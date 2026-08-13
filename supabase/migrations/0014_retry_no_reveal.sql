-- Close the retry exploit, and correct the attempts floor.
--
-- Before this, losing a round revealed the answer and a retry then scored
-- normally: watch the ad, read the number, retype it, take 100 points. That
-- makes the ad a way to buy a perfect score rather than a second chance.
--
-- Now the answer stays hidden while a retry is still on the table, and a
-- retried round scores nothing. The reason to retry is to finish the day and
-- keep the streak, not to farm points.
--
-- The floor also moves from 3 to 5: with three rounds there are only two
-- chances to reduce (7 -> 6 -> 5), so 3 was never reachable.

alter table public.games
  drop constraint if exists games_attempts_allowed_check;
alter table public.games
  add constraint games_attempts_allowed_check check (attempts_allowed between 5 and 7);

-- Set when the player chooses to stop rather than retry. Only then is the
-- answer safe to show.
alter table public.games
  add column if not exists gave_up boolean not null default false;

-- A round replayed after an elimination scores nothing.
alter table public.round_results
  add column if not exists retried boolean not null default false;

-- ------------------------------------------------------------------ retry

create or replace function public.retry_round()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid  uuid := auth.uid();
  v_date date;
  v_game public.games%rowtype;
begin
  if v_uid is null then
    return jsonb_build_object('error', 'not_authenticated');
  end if;

  v_date := public.current_puzzle_date(v_uid);
  select * into v_game from public.games
  where user_id = v_uid and puzzle_date = v_date for update;

  if v_game.id is null or v_game.status <> 'eliminated' or v_game.gave_up then
    return jsonb_build_object('error', 'nothing_to_retry');
  end if;

  delete from public.guesses where game_id = v_game.id and round = v_game.current_round;

  update public.round_results set
    status = 'playing', attempts_used = 0, score = 0, clue2_unlocked = false,
    -- Sticks for the rest of the day, so the replayed round can never score.
    retried = true
  where game_id = v_game.id and round = v_game.current_round;

  update public.games set
    status = 'playing', finished_at = null, retries_used = retries_used + 1
  where id = v_game.id;

  return jsonb_build_object('ok', true);
end;
$$;

-- Ends the day deliberately. Only now is the answer revealed.
create or replace function public.give_up()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid  uuid := auth.uid();
  v_date date;
begin
  if v_uid is null then
    return jsonb_build_object('error', 'not_authenticated');
  end if;

  v_date := public.current_puzzle_date(v_uid);

  update public.games set gave_up = true
  where user_id = v_uid and puzzle_date = v_date and status = 'eliminated';

  return jsonb_build_object('ok', true);
end;
$$;

-- --------------------------------------------------------------- guessing

create or replace function public.submit_guess(p_guess integer)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid       uuid := auth.uid();
  v_date      date;
  v_game      public.games%rowtype;
  v_round     public.round_results%rowtype;
  v_answer    smallint;
  v_clue2     text;
  v_distance  integer;
  v_direction text;
  v_tier      text;
  v_index     smallint;
  v_score     smallint := 0;
  v_next_allowed smallint;
  v_order     smallint[];
  v_last_attempt boolean;
begin
  if v_uid is null then
    return jsonb_build_object('error', 'not_authenticated');
  end if;
  if p_guess is null or p_guess < 1 or p_guess > 1000 then
    return jsonb_build_object('error', 'out_of_range');
  end if;

  insert into public.profiles (id) values (v_uid) on conflict (id) do nothing;
  insert into public.stats (user_id) values (v_uid) on conflict (user_id) do nothing;

  v_date := public.current_puzzle_date(v_uid);
  v_game := public.ensure_game(v_uid, v_date);

  select * into v_game from public.games where id = v_game.id for update;

  if v_game.status <> 'playing' then
    return jsonb_build_object('error',
      case when v_game.status = 'eliminated' then 'eliminated' else 'already_played' end);
  end if;

  select * into v_round from public.round_results
  where game_id = v_game.id and round = v_game.current_round;

  if v_round.status <> 'playing' then
    return jsonb_build_object('error', 'round_over');
  end if;

  if exists (select 1 from public.guesses
             where game_id = v_game.id and round = v_round.round and guess = p_guess) then
    return jsonb_build_object('error', 'duplicate_guess');
  end if;

  select answer, clue2 into v_answer, v_clue2 from public.puzzle_round_secrets
  where puzzle_date = v_date and round = v_round.source_round;

  if v_answer is null then
    return jsonb_build_object('error', 'no_puzzle_today');
  end if;

  v_distance  := abs(p_guess - v_answer);
  v_direction := case when v_distance = 0 then 'correct'
                      when p_guess < v_answer then 'below' else 'above' end;
  v_tier := case
    when v_distance = 0   then 'correct'
    when v_distance <= 10 then 'intense'
    when v_distance <= 24 then 'dark'
    when v_distance <= 99 then 'medium'
    else 'light' end;

  v_index := v_round.attempts_used + 1;
  v_last_attempt := v_index >= v_round.attempts_allowed;

  insert into public.guesses (game_id, round, guess_index, guess, direction, tier)
  values (v_game.id, v_round.round, v_index, p_guess, v_direction, v_tier);

  update public.round_results set
    attempts_used  = v_index,
    clue2_unlocked = clue2_unlocked or v_distance <= 10,
    status = (case when v_distance = 0 then 'won'
                   when v_last_attempt then 'lost'
                   else 'playing' end)::public.round_status,
    -- A retried round scores nothing, whatever attempt it lands on.
    score = (case when v_distance = 0 and not retried
                  then public.score_for_attempt(v_index) else 0 end)::smallint
  where game_id = v_game.id and round = v_round.round
  returning * into v_round;

  if v_round.status = 'won' then
    v_score := v_round.score;

    v_next_allowed := case when v_last_attempt
                           then greatest(5, v_round.attempts_allowed - 1)
                           else v_round.attempts_allowed end;

    if v_round.round = 3 then
      update public.games set
        status = 'complete',
        total_score = total_score + v_score,
        finished_at = now()
      where id = v_game.id returning * into v_game;
    else
      v_order := public.round_order(v_uid, v_date);

      update public.games set
        total_score = total_score + v_score,
        current_round = current_round + 1,
        attempts_allowed = v_next_allowed
      where id = v_game.id returning * into v_game;

      insert into public.round_results (game_id, round, source_round, attempts_allowed)
      values (v_game.id, v_game.current_round, v_order[v_game.current_round], v_next_allowed)
      on conflict (game_id, round) do nothing;
    end if;

  elsif v_round.status = 'lost' then
    update public.games set status = 'eliminated', finished_at = now()
    where id = v_game.id returning * into v_game;
  end if;

  return jsonb_build_object(
    'dayStatus',    v_game.status,
    'currentRound', v_game.current_round,
    'totalScore',   v_game.total_score,
    'roundStatus',  v_round.status,
    'attemptsUsed', v_round.attempts_used,
    'attemptsAllowed', v_round.attempts_allowed,
    'roundScore',   v_round.score,
    'retried',      v_round.retried,
    'nextAttemptsAllowed', v_next_allowed,
    'canRetry',     v_round.status = 'lost' and not v_game.gave_up,
    'guess', jsonb_build_object(
      'guess', p_guess, 'direction', v_direction, 'tier', v_tier,
      'isWithin10', v_distance > 0 and v_distance <= 10,
      'isOneAway',  v_distance = 1,
      'isCorrect',  v_distance = 0
    ),
    'clue2',  case when v_round.clue2_unlocked then v_clue2 else null end,
    -- Held back while a retry is still possible: revealing it here is what
    -- turned the ad into a way to buy points.
    'answer', case when v_round.status = 'won' or v_game.gave_up then v_answer else null end
  );
end;
$$;

-- ----------------------------------------------------------------- state

create or replace function public.game_state()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid    uuid := auth.uid();
  v_date   date;
  v_game   public.games%rowtype;
  v_round  public.round_results%rowtype;
  v_clue1  text;
  v_clue2  text;
  v_answer smallint;
  v_stats  public.stats%rowtype;
  v_reveal boolean;
begin
  if v_uid is null then
    return jsonb_build_object('error', 'not_authenticated');
  end if;

  insert into public.profiles (id) values (v_uid) on conflict (id) do nothing;
  insert into public.stats (user_id) values (v_uid) on conflict (user_id) do nothing;

  v_date := public.current_puzzle_date(v_uid);

  if not exists (select 1 from public.puzzle_rounds where puzzle_date = v_date) then
    return jsonb_build_object('error', 'no_puzzle_today');
  end if;

  v_game := public.ensure_game(v_uid, v_date);

  select * into v_round from public.round_results
  where game_id = v_game.id and round = v_game.current_round;

  select clue1 into v_clue1 from public.puzzle_rounds
  where puzzle_date = v_date and round = v_round.source_round;

  select answer, clue2 into v_answer, v_clue2 from public.puzzle_round_secrets
  where puzzle_date = v_date and round = v_round.source_round;

  select * into v_stats from public.stats where user_id = v_uid;

  v_reveal := v_round.status = 'won' or v_game.gave_up;

  return jsonb_build_object(
    'puzzleDate',   v_date,
    'dayStatus',    v_game.status,
    'currentRound', v_game.current_round,
    'totalRounds',  3,
    'totalScore',   v_game.total_score,
    'retriesUsed',  v_game.retries_used,
    'gaveUp',       v_game.gave_up,
    'canRetry',     v_game.status = 'eliminated' and not v_game.gave_up,
    'round', jsonb_build_object(
      'round',          v_round.round,
      'status',         v_round.status,
      'attemptsUsed',   v_round.attempts_used,
      'attemptsAllowed', v_round.attempts_allowed,
      'score',          v_round.score,
      'retried',        v_round.retried,
      'clue1',          v_clue1,
      'clue2',          case when v_round.clue2_unlocked then v_clue2 else null end,
      'answer',         case when v_reveal then v_answer else null end,
      'guesses', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'guess', g.guess, 'direction', g.direction, 'tier', g.tier,
                 'isCorrect',  g.direction = 'correct',
                 'isWithin10', g.guess <> v_answer and abs(g.guess - v_answer) <= 10,
                 'isOneAway',  abs(g.guess - v_answer) = 1
               ) order by g.guess_index)
        from public.guesses g
        where g.game_id = v_game.id and g.round = v_round.round
      ), '[]'::jsonb)
    ),
    'rounds', coalesce((
      select jsonb_agg(jsonb_build_object(
               'round', r.round, 'status', r.status,
               'score', r.score, 'attemptsUsed', r.attempts_used,
               'attemptsAllowed', r.attempts_allowed, 'retried', r.retried
             ) order by r.round)
      from public.round_results r where r.game_id = v_game.id
    ), '[]'::jsonb),
    'stats', jsonb_build_object(
      'currentStreak', coalesce(v_stats.current_streak, 0),
      'maxStreak',     coalesce(v_stats.max_streak, 0),
      'gamesPlayed',   coalesce(v_stats.games_played, 0),
      'gamesWon',      coalesce(v_stats.games_won, 0),
      'totalPoints',   coalesce(v_stats.total_points, 0)
    )
  );
end;
$$;

revoke execute on function public.submit_guess(integer) from public, anon;
revoke execute on function public.game_state() from public, anon;
revoke execute on function public.retry_round() from public, anon;
revoke execute on function public.give_up() from public, anon;

grant execute on function public.submit_guess(integer) to authenticated;
grant execute on function public.game_state() to authenticated;
grant execute on function public.retry_round() to authenticated;
grant execute on function public.give_up() to authenticated;

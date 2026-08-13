-- Gameplay for the three-round day.
--
-- Everything the app used to decide is decided here: which round you're on,
-- how many attempts that round gets, whether a guess is legal, what it scores,
-- and whether the day is over. A modified client can only submit a number.

-- Creates the day's game and its first round if they don't exist yet.
create or replace function public.ensure_game(p_uid uuid, p_date date)
returns public.games
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_game  public.games%rowtype;
  v_order smallint[];
begin
  insert into public.games (user_id, puzzle_date)
  values (p_uid, p_date)
  on conflict (user_id, puzzle_date) do nothing;

  select * into v_game from public.games where user_id = p_uid and puzzle_date = p_date;

  v_order := public.round_order(p_uid, p_date);

  insert into public.round_results (game_id, round, source_round, attempts_allowed)
  values (v_game.id, 1, v_order[1], v_game.attempts_allowed)
  on conflict (game_id, round) do nothing;

  return v_game;
end;
$$;

-- --------------------------------------------------------------- state

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

  return jsonb_build_object(
    'puzzleDate',   v_date,
    'dayStatus',    v_game.status,
    'currentRound', v_game.current_round,
    'totalRounds',  3,
    'totalScore',   v_game.total_score,
    'retriesUsed',  v_game.retries_used,
    'round', jsonb_build_object(
      'round',          v_round.round,
      'status',         v_round.status,
      'attemptsUsed',   v_round.attempts_used,
      'attemptsAllowed', v_round.attempts_allowed,
      'score',          v_round.score,
      'clue1',          v_clue1,
      'clue2',          case when v_round.clue2_unlocked then v_clue2 else null end,
      -- Only once this round can no longer be played.
      'answer',         case when v_round.status = 'playing' then null else v_answer end,
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
               'attemptsAllowed', r.attempts_allowed
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
    -- A CASE yields text, and this column is an enum, so the cast is required.
    status = (case when v_distance = 0 then 'won'
                   when v_last_attempt then 'lost'
                   else 'playing' end)::public.round_status,
    score  = (case when v_distance = 0 then public.score_for_attempt(v_index) else 0 end)::smallint
  where game_id = v_game.id and round = v_round.round
  returning * into v_round;

  if v_round.status = 'won' then
    v_score := v_round.score;

    -- Solving on the final attempt costs one attempt next round, never below 3.
    v_next_allowed := case when v_last_attempt
                           then greatest(3, v_round.attempts_allowed - 1)
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
    -- Out of attempts: the day stops here unless a retry is used.
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
    'nextAttemptsAllowed', v_next_allowed,
    'guess', jsonb_build_object(
      'guess', p_guess, 'direction', v_direction, 'tier', v_tier,
      'isWithin10', v_distance > 0 and v_distance <= 10,
      'isOneAway',  v_distance = 1,
      'isCorrect',  v_distance = 0
    ),
    'clue2',  case when v_round.clue2_unlocked then v_clue2 else null end,
    'answer', case when v_round.status = 'playing' then null else v_answer end
  );
end;
$$;

-- ----------------------------------------------------------------- retry

-- Replays the round the player was eliminated on. The ad is a client concern;
-- the server only enforces that there is something to retry.
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

  if v_game.id is null or v_game.status <> 'eliminated' then
    return jsonb_build_object('error', 'nothing_to_retry');
  end if;

  delete from public.guesses where game_id = v_game.id and round = v_game.current_round;

  update public.round_results set
    status = 'playing', attempts_used = 0, score = 0, clue2_unlocked = false
  where game_id = v_game.id and round = v_game.current_round;

  update public.games set
    status = 'playing', finished_at = null, retries_used = retries_used + 1
  where id = v_game.id;

  return jsonb_build_object('ok', true);
end;
$$;

-- ----------------------------------------------------------------- stats

create or replace function public.apply_game_result()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'playing' or old.status <> 'playing' then
    return new;
  end if;

  insert into public.stats (user_id) values (new.user_id) on conflict (user_id) do nothing;

  update public.stats s set
    games_played = s.games_played + 1,
    games_won    = s.games_won + (case when new.status = 'complete' then 1 else 0 end),
    total_points = s.total_points + new.total_score,
    -- A streak means finishing all three rounds; being eliminated ends it.
    current_streak = case
                       when new.status <> 'complete' then 0
                       when s.last_played_date = new.puzzle_date - 1 then s.current_streak + 1
                       else 1 end,
    max_streak = greatest(s.max_streak,
                   case when new.status <> 'complete' then 0
                        when s.last_played_date = new.puzzle_date - 1 then s.current_streak + 1
                        else 1 end),
    last_played_date = new.puzzle_date
  where s.user_id = new.user_id;

  return new;
end;
$$;

drop trigger if exists games_apply_result on public.games;
create trigger games_apply_result
  after update on public.games
  for each row execute function public.apply_game_result();

-- ----------------------------------------------------- leaderboard + dev

create or replace function public.daily_leaderboard(p_limit integer default 50)
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

  return jsonb_build_object(
    'puzzleDate', v_date,
    'entries', coalesce((
      select jsonb_agg(e order by e.rank)
      from (
        select
          rank() over (order by g.total_score desc, g.finished_at asc) as rank,
          coalesce(p.username, 'Player ' || upper(right(g.user_id::text, 4))) as name,
          g.total_score as score,
          g.user_id = v_uid as is_me
        from public.games g
        join public.profiles p on p.id = g.user_id
        where g.puzzle_date = v_date and g.status = 'complete'
        order by g.total_score desc, g.finished_at asc
        limit greatest(1, least(p_limit, 200))
      ) e
    ), '[]'::jsonb),
    'totalPlayers', (select count(*) from public.games
                     where puzzle_date = v_date and status = 'complete')
  );
end;
$$;

create or replace function public.dev_reset_today()
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
  if not exists (select 1 from public.dev_testers where user_id = v_uid) then
    return jsonb_build_object('error', 'not_a_tester');
  end if;

  v_date := public.current_puzzle_date(v_uid);
  delete from public.games where user_id = v_uid and puzzle_date = v_date;

  update public.stats s set
    games_played = (select count(*) from public.games g where g.user_id = v_uid and g.status <> 'playing'),
    games_won    = (select count(*) from public.games g where g.user_id = v_uid and g.status = 'complete'),
    total_points = coalesce((select sum(g.total_score) from public.games g where g.user_id = v_uid), 0),
    last_played_date = (select max(g.puzzle_date) from public.games g where g.user_id = v_uid and g.status <> 'playing')
  where s.user_id = v_uid;

  return jsonb_build_object('ok', true);
end;
$$;

revoke execute on function public.submit_guess(integer) from public, anon;
revoke execute on function public.game_state() from public, anon;
revoke execute on function public.retry_round() from public, anon;
revoke execute on function public.daily_leaderboard(integer) from public, anon;
revoke execute on function public.dev_reset_today() from public, anon;

grant execute on function public.submit_guess(integer) to authenticated;
grant execute on function public.game_state() to authenticated;
grant execute on function public.retry_round() to authenticated;
grant execute on function public.daily_leaderboard(integer) to authenticated;
grant execute on function public.dev_reset_today() to authenticated;

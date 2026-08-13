-- Each round is tighter than the last: 7 attempts, then 6, then 5.
--
-- Previously every round carried the same allowance and only a last-attempt
-- solve reduced it, so a day could run 7/7/7 and never get harder. Now the
-- difficulty rises on its own while the numbers stay 1-1000 and the feedback
-- bands stay exactly as they are - the two things that carry the game's
-- identity and would break if scaled per round.
--
-- Harder rounds also pay better without any extra rule. Score is set by which
-- attempt solved it, so a round capped at 5 attempts cannot score below 60,
-- while a 7-attempt round bottoms out at 40.
--
-- The last-attempt penalty still applies, floored at 5. In practice it now
-- bites going into round 2 (6 becomes 5) and is already at the floor going into
-- round 3. Dropping the floor to 4 would make it bite twice, at the cost of a
-- genuinely punishing final round.
--
-- Rounds already created keep the allowance they were given, so a day in
-- progress is not re-cut underneath the player.

create or replace function public.attempts_for_round(p_round integer)
returns smallint
language sql
immutable
as $$
  select (case p_round when 1 then 7 when 2 then 6 else 5 end)::smallint;
$$;

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
  if not exists (select 1 from public.puzzle_rounds where puzzle_date = p_date) then
    perform public.generate_puzzle_days(p_date, 1);
  end if;

  insert into public.games (user_id, puzzle_date)
  values (p_uid, p_date)
  on conflict (user_id, puzzle_date) do nothing;

  select * into v_game from public.games where user_id = p_uid and puzzle_date = p_date;

  v_order := public.round_order(p_uid, p_date);

  insert into public.round_results (game_id, round, source_round, attempts_allowed)
  values (v_game.id, 1, v_order[1], public.attempts_for_round(1))
  on conflict (game_id, round) do nothing;

  return v_game;
end;
$$;

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
    score = (case when v_distance = 0 and not retried
                  then public.score_for_attempt(v_index) else 0 end)::smallint
  where game_id = v_game.id and round = v_round.round
  returning * into v_round;

  -- Won or lost, the round is over and the day moves on. A lost round simply
  -- brings zero with it.
  if v_round.status <> 'playing' then
    v_score := v_round.score;

    -- The next round's own allowance, minus the last-attempt penalty, never
    -- below five.
    v_next_allowed := public.attempts_for_round(v_round.round + 1);
    if v_round.status = 'won' and v_last_attempt then
      v_next_allowed := greatest(5, v_next_allowed - 1)::smallint;
    end if;

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
    'canRetry',     false,
    'guess', jsonb_build_object(
      'guess', p_guess, 'direction', v_direction, 'tier', v_tier,
      'isWithin10', v_distance > 0 and v_distance <= 10,
      'isOneAway',  v_distance = 1,
      'isCorrect',  v_distance = 0
    ),
    'clue2',  case when v_round.clue2_unlocked then v_clue2 else null end,
    'answer', case when v_round.status <> 'playing' then v_answer else null end
  );
end;
$$;

revoke execute on function public.attempts_for_round(integer) from public, anon;
revoke execute on function public.submit_guess(integer) from public, anon;
grant execute on function public.submit_guess(integer) to authenticated;

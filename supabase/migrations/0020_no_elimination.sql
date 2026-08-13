-- A failed round costs the round, not the day.
--
-- Running out of attempts used to end the day outright. A first-time player who
-- missed round one saw about ninety seconds of the game and then "come back
-- tomorrow", which is the worst possible introduction and the likeliest moment
-- to lose someone. It also kept them off the leaderboard, so the people most
-- worth hearing from left no trace.
--
-- A lost round now scores zero and play moves to the next one. Everybody sees
-- all three rounds, everybody finishes with a score, and the spread between a
-- good day and a bad one is still wide - three solved rounds against none is
-- the difference between 300 and 0.
--
-- The attempt penalty is unchanged and still applies only to solving on the
-- final attempt. Failing a round already costs its points; charging an attempt
-- on top would compound one bad round into a worse next one.
--
-- The answer is now revealed on a lost round. It was withheld because a player
-- could read it and then buy a retry with an ad; with no elimination there is
-- nothing to retry, so the exploit has no route and the player deserves to know
-- what they missed. retry_round still requires status = 'eliminated', which new
-- games no longer reach, so it is unreachable rather than open. Existing
-- eliminated days keep working as they did.

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

  -- Won or lost, the round is over and the day moves on. A lost round simply
  -- brings zero with it.
  if v_round.status <> 'playing' then
    v_score := v_round.score;

    v_next_allowed := case when v_round.status = 'won' and v_last_attempt
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
    -- Nothing to retry any more: a failed round is already behind you.
    'canRetry',     false,
    'guess', jsonb_build_object(
      'guess', p_guess, 'direction', v_direction, 'tier', v_tier,
      'isWithin10', v_distance > 0 and v_distance <= 10,
      'isOneAway',  v_distance = 1,
      'isCorrect',  v_distance = 0
    ),
    'clue2',  case when v_round.clue2_unlocked then v_clue2 else null end,
    -- Safe to show on a loss now that no retry can follow it.
    'answer', case when v_round.status <> 'playing' then v_answer else null end
  );
end;
$$;

-- game_state reveals the answer for a finished round for the same reason.
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
    perform public.generate_puzzle_days(v_date, 1);
  end if;

  v_game := public.ensure_game(v_uid, v_date);

  select * into v_round from public.round_results
  where game_id = v_game.id and round = v_game.current_round;

  select clue1 into v_clue1 from public.puzzle_rounds
  where puzzle_date = v_date and round = v_round.source_round;

  select answer, clue2 into v_answer, v_clue2 from public.puzzle_round_secrets
  where puzzle_date = v_date and round = v_round.source_round;

  select * into v_stats from public.stats where user_id = v_uid;

  v_reveal := v_round.status <> 'playing' or v_game.gave_up;

  return jsonb_build_object(
    'puzzleDate',   v_date,
    'puzzleNumber', (v_date - date '2026-08-11') + 1,
    'dayStatus',    v_game.status,
    'currentRound', v_game.current_round,
    'totalRounds',  3,
    'totalScore',   v_game.total_score,
    'retriesUsed',  v_game.retries_used,
    'gaveUp',       v_game.gave_up,
    -- Only a day eliminated under the old rules can still offer a retry.
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
               'attemptsAllowed', r.attempts_allowed, 'retried', r.retried,
               'marks', coalesce((
                 select jsonb_agg(g2.direction order by g2.guess_index)
                 from public.guesses g2
                 where g2.game_id = v_game.id and g2.round = r.round
               ), '[]'::jsonb)
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

revoke execute on function public.game_state() from public, anon;
grant execute on function public.game_state() to authenticated;
revoke execute on function public.submit_guess(integer) from public, anon;
grant execute on function public.submit_guess(integer) to authenticated;

-- Put the daily back. Run this now.
--
-- 0124 was written to ship with a client that can call a shot, choose a clue
-- and place a bet. Without it the app sends none of those, so submit_guess
-- answers every round-one guess with call_first and the day cannot be played
-- at all. My fault for leaving a runnable file in the tree with only a comment
-- guarding it.
--
-- This restores exactly what was live before: ensure_game from 0026,
-- submit_guess from 0121 - the small-points ladder with the floor, which is
-- what you ran this morning - and game_state from 0030. The three-round work
-- stays in the repo, unapplied, until the client is ready to meet it.
--
-- Nothing here touches 0123's columns or scoring helpers. They are additive and
-- harmless while unused: new columns on round_results that nothing reads, and
-- functions nothing calls.

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
  values (v_game.id, 1, v_order[1], public.attempts_for_round(1, p_date))
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
  v_spec      jsonb;
  v_mult      numeric;
  v_clue_mode text;
  v_unlock    integer;
  v_keep      boolean;
  v_nopen     boolean;
  v_show_clue2 boolean;
  v_broken    boolean;
begin
  if v_uid is null then
    return jsonb_build_object('error', 'not_authenticated');
  end if;
  if p_guess is null or p_guess < 1 or p_guess > 1000 then
    return jsonb_build_object('error', 'out_of_range');
  end if;

  insert into public.profiles (id) values (v_uid) on conflict (id) do nothing;
  insert into public.stats (user_id) values (v_uid) on conflict (user_id) do nothing;

  v_date      := public.current_puzzle_date(v_uid);
  v_spec      := public.modifier_spec(public.day_modifier(v_date));
  v_mult      := coalesce((v_spec->>'mult')::numeric, 1);
  v_clue_mode := coalesce(v_spec->>'clue', 'normal');
  v_unlock    := coalesce((v_spec->>'unlock')::int, 10);
  v_keep      := coalesce((v_spec->>'keep')::boolean, false);
  v_nopen     := coalesce((v_spec->>'nopen')::boolean, false);

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

  -- Nothing carries forward. A round is scored on how it went, and a miss
  -- earlier in the day has no say in it.
  v_broken := false;

  v_distance  := abs(p_guess - v_answer);
  v_direction := case when v_distance = 0 then 'correct'
                      when p_guess < v_answer then 'below' else 'above' end;
  v_tier := case
    when v_distance = 0    then 'correct'
    when v_distance <= 10  then 'intense'
    when v_distance <= 24  then 'dark'
    when v_distance <= 99  then 'medium'
    when v_distance <= 249 then 'light'
    when v_distance <= 499 then 'distant'
    else 'vast' end;

  v_index := v_round.attempts_used + 1;
  v_last_attempt := v_index >= v_round.attempts_allowed;

  insert into public.guesses (game_id, round, guess_index, guess, direction, tier)
  values (v_game.id, v_round.round, v_index, p_guess, v_direction, v_tier);

  update public.round_results set
    attempts_used  = v_index,
    clue2_unlocked = clue2_unlocked or v_distance <= v_unlock,
    status = (case when v_distance = 0 then 'won'
                   when v_last_attempt then 'lost'
                   else 'playing' end)::public.round_status,
    -- Rounded, because a multiplier can be fractional.
    -- A round that is over always pays something. Solving cleanly pays the
    -- ladder; a round that ran out of attempts, or one being replayed after a
    -- retry, pays the floor - turning up for a number you never found is worth
    -- more than nothing, and without the floor a retry would score less than
    -- the miss it was meant to fix.
    score = (case
               when v_distance = 0 and not retried and not v_broken
                 then round(public.score_for_attempt(v_index) * v_mult)
               when v_distance = 0 or v_last_attempt
                 then public.score_floor()
               else 0
             end)::smallint
  where game_id = v_game.id and round = v_round.round
  returning * into v_round;

  if v_round.status <> 'playing' then
    v_score := v_round.score;

    -- Seven, six, five. Solving on the last attempt is solving on the last
    -- attempt: it was already the hardest way to win a round, and charging an
    -- attempt for it punished the players who most deserved the round.
    v_next_allowed := public.attempts_for_round(v_round.round + 1, v_date);

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

  v_show_clue2 := case v_clue_mode
    when 'none'  then false
    when 'blind' then false
    when 'early' then true
    else v_round.clue2_unlocked
  end;

  return jsonb_build_object(
    'dayStatus',    v_game.status,
    'currentRound', v_game.current_round,
    'totalScore',   v_game.total_score,
    'roundStatus',  v_round.status,
    'attemptsUsed', v_round.attempts_used,
    'attemptsAllowed', v_round.attempts_allowed,
    'roundScore',   v_round.score,
    'retried',      v_round.retried,
    'scoringOver',  false,
    'nextAttemptsAllowed', v_next_allowed,
    'canRetry',     false,
    'guess', jsonb_build_object(
      'guess', p_guess, 'direction', v_direction, 'tier', v_tier,
      'isWithin10', v_distance > 0 and v_distance <= 10,
      'isOneAway',  v_distance = 1,
      'isCorrect',  v_distance = 0
    ),
    'clue2',  case when v_show_clue2 then v_clue2 else null end,
    'answer', case when v_round.status <> 'playing' then v_answer else null end
  );
end;
$$;

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
  v_id     text;
  v_spec   jsonb;
  v_clue_mode text;
  v_mult   numeric;
  v_show_clue2 boolean;
begin
  if v_uid is null then
    return jsonb_build_object('error', 'not_authenticated');
  end if;

  insert into public.profiles (id) values (v_uid) on conflict (id) do nothing;
  insert into public.stats (user_id) values (v_uid) on conflict (user_id) do nothing;

  v_date      := public.current_puzzle_date(v_uid);
  v_id        := public.day_modifier(v_date);
  v_spec      := public.modifier_spec(v_id);
  v_clue_mode := coalesce(v_spec->>'clue', 'normal');
  v_mult      := coalesce((v_spec->>'mult')::numeric, 1);

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

  v_show_clue2 := case v_clue_mode
    when 'none'  then false
    when 'blind' then false
    when 'early' then true
    else v_round.clue2_unlocked
  end;

  return jsonb_build_object(
    'puzzleDate',   v_date,
    'puzzleNumber', (v_date - date '2026-08-11') + 1,
    -- The day's twist or bonus, named by the server so there is one list.
    'modifier', jsonb_build_object(
      'id',     v_id,
      'kind',   coalesce(v_spec->>'kind', 'standard'),
      'label',  coalesce(v_spec->>'label', ''),
      'detail', coalesce(v_spec->>'detail', '')
    ),
    'maxScore',     round(300 * v_mult),
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
      -- A blind day withholds the opening clue as well.
      'clue1',          case when v_clue_mode = 'blind' then null else v_clue1 end,
      'clue2',          case when v_show_clue2 then v_clue2 else null end,
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

revoke execute on function public.ensure_game(uuid, date)   from public, anon, authenticated;
revoke execute on function public.submit_guess(integer)     from public, anon;
revoke execute on function public.game_state()              from public, anon;
grant execute on function public.submit_guess(integer) to authenticated;
grant execute on function public.game_state()          to authenticated;

-- And the half-finished round shape goes with them.
drop function if exists public.daily_call(integer);
drop function if exists public.daily_clue(text);
drop function if exists public.daily_bet(integer, integer);

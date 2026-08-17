-- The daily's three rounds, played. Part two of the rebuild.
--
-- STILL DO NOT RUN. The client half has to ship with it.
--
-- 0123 laid down the columns and the scoring. This is the game: making a game,
-- calling your shot, choosing a clue, guessing, betting, and reading the state
-- back. It replaces submit_guess and game_state wholesale rather than patching
-- them, because what they did - three symmetrical rounds, a shuffled round
-- order, day modifiers multiplying scores, a retry that replays an eliminated
-- round - describes a game that no longer exists.
--
-- Three things go, deliberately:
--
--   Day modifiers. Three rounds that already differ leave nothing for a
--   multiplier to vary, and keeping them meant an "unless today is a bonus"
--   branch in every rule below.
--
--   Elimination. Every round now pays at least 3, so there is nothing to be
--   eliminated from - a day ends by being finished.
--
--   The retry. It existed to replay a round you lost outright, which no longer
--   happens.
--
-- source_round stays and is now always equal to round: it existed so a twist
-- could shuffle which of the day's numbers you met first, and nothing shuffles
-- them any more. Kept rather than dropped so the secrets table and every
-- historical row still join.

/**
 * The day, and its three rounds.
 *
 * Round three's allowance is three probes rather than three attempts - they
 * cost nothing and end nothing, which is what makes the bet after them a
 * decision rather than a guess.
 */
create or replace function public.ensure_game(p_uid uuid, p_date date)
returns public.games
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_game public.games%rowtype;
begin
  select * into v_game from public.games where user_id = p_uid and puzzle_date = p_date;
  if v_game.id is not null then return v_game; end if;

  insert into public.games (user_id, puzzle_date, current_round, attempts_allowed)
  values (p_uid, p_date, 1, public.daily_attempts(1))
  on conflict (user_id, puzzle_date) do nothing
  returning * into v_game;

  if v_game.id is null then
    select * into v_game from public.games where user_id = p_uid and puzzle_date = p_date;
    return v_game;
  end if;

  insert into public.round_results (game_id, round, source_round, attempts_allowed)
  select v_game.id, r, r, public.daily_attempts(r) from generate_series(1, 3) r
  on conflict do nothing;

  return v_game;
end;
$$;

/**
 * Call your shot, once, before the first guess of round one.
 *
 * Binding from the moment a guess lands - otherwise everybody would call two,
 * miss, and quietly become a seven-caller, and there would be no bet at all.
 */
create or replace function public.daily_call(p_call integer)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid  uuid := auth.uid();
  v_game public.games%rowtype;
  v_r    public.round_results%rowtype;
begin
  if v_uid is null then return jsonb_build_object('error', 'not_authenticated'); end if;
  if p_call is null or p_call < 1 or p_call > 7 then
    return jsonb_build_object('error', 'bad_call');
  end if;

  v_game := public.ensure_game(v_uid, public.current_puzzle_date(v_uid));
  select * into v_r from public.round_results where game_id = v_game.id and round = 1;

  if v_r.status <> 'playing' then return jsonb_build_object('error', 'round_over'); end if;
  if v_r.attempts_used > 0 then return jsonb_build_object('error', 'already_started'); end if;

  update public.round_results set called = p_call where game_id = v_game.id and round = 1;
  return jsonb_build_object('ok', true, 'called', p_call, 'pays', public.daily_call_pay(p_call));
end;
$$;

/**
 * Choose the kind of clue for round two.
 *
 * The clue is written down when it is chosen so a reload cannot reroll it into
 * a kinder one.
 */
create or replace function public.daily_clue(p_kind text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid    uuid := auth.uid();
  v_game   public.games%rowtype;
  v_r      public.round_results%rowtype;
  v_answer smallint;
  v_text   text;
begin
  if v_uid is null then return jsonb_build_object('error', 'not_authenticated'); end if;
  if p_kind not in ('digits', 'factors', 'where') then
    return jsonb_build_object('error', 'bad_kind');
  end if;

  v_game := public.ensure_game(v_uid, public.current_puzzle_date(v_uid));
  select * into v_r from public.round_results where game_id = v_game.id and round = 2;

  if v_r.clue_text is not null then
    return jsonb_build_object('ok', true, 'kind', v_r.clue_kind, 'clue', v_r.clue_text);
  end if;

  select answer into v_answer from public.puzzle_round_secrets
  where puzzle_date = v_game.puzzle_date and round = v_r.source_round;

  v_text := public.daily_clue_for(v_answer, p_kind);

  update public.round_results set clue_kind = p_kind, clue_text = v_text
  where game_id = v_game.id and round = 2;

  return jsonb_build_object('ok', true, 'kind', p_kind, 'clue', v_text);
end;
$$;

/**
 * A guess. Rounds one and two are searches; round three's are free probes that
 * end nothing.
 */
create or replace function public.submit_guess(p_guess integer)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid    uuid := auth.uid();
  v_date   date;
  v_game   public.games%rowtype;
  v_r      public.round_results%rowtype;
  v_answer smallint;
  v_dist   integer;
  v_dir    text;
  v_tier   text;
  v_index  smallint;
  v_score  smallint := 0;
  v_last   boolean;
  v_over   boolean := false;
begin
  if v_uid is null then return jsonb_build_object('error', 'not_authenticated'); end if;
  if p_guess is null or p_guess < 1 or p_guess > 1000 then
    return jsonb_build_object('error', 'out_of_range');
  end if;

  insert into public.profiles (id) values (v_uid) on conflict (id) do nothing;
  insert into public.stats (user_id) values (v_uid) on conflict (user_id) do nothing;

  v_date := public.current_puzzle_date(v_uid);
  v_game := public.ensure_game(v_uid, v_date);
  select * into v_game from public.games where id = v_game.id for update;

  if v_game.status <> 'playing' then return jsonb_build_object('error', 'already_played'); end if;

  select * into v_r from public.round_results
  where game_id = v_game.id and round = v_game.current_round;

  if v_r.status <> 'playing' then return jsonb_build_object('error', 'round_over'); end if;
  -- Round one will not take a guess until the shot is called.
  if v_r.round = 1 and v_r.called is null then
    return jsonb_build_object('error', 'call_first');
  end if;
  -- Nor round two until a clue has been chosen.
  if v_r.round = 2 and v_r.clue_text is null then
    return jsonb_build_object('error', 'choose_clue');
  end if;
  if v_r.round = 3 and v_r.attempts_used >= public.daily_attempts(3) then
    return jsonb_build_object('error', 'probes_spent');
  end if;

  if exists (select 1 from public.guesses
             where game_id = v_game.id and round = v_r.round and guess = p_guess) then
    return jsonb_build_object('error', 'duplicate_guess');
  end if;

  select answer into v_answer from public.puzzle_round_secrets
  where puzzle_date = v_game.puzzle_date and round = v_r.source_round;

  v_dist := abs(p_guess - v_answer);
  v_dir  := case when v_dist = 0 then 'correct'
                 when p_guess < v_answer then 'below' else 'above' end;
  v_tier := case
    when v_dist = 0    then 'correct'
    when v_dist <= 10  then 'intense'
    when v_dist <= 24  then 'dark'
    when v_dist <= 99  then 'medium'
    when v_dist <= 249 then 'light'
    when v_dist <= 499 then 'distant'
    else 'vast' end;

  v_index := v_r.attempts_used + 1;
  v_last  := v_index >= v_r.attempts_allowed;

  insert into public.guesses (game_id, round, guess_index, guess, direction, tier)
  values (v_game.id, v_r.round, v_index, p_guess, v_dir, v_tier);

  update public.round_results set attempts_used = v_index
  where game_id = v_game.id and round = v_r.round;

  -- Round three never ends on a guess. The probes are free and the bet is the
  -- only thing that scores.
  if v_r.round = 3 then
    return jsonb_build_object(
      'round', 3, 'roundStatus', 'playing', 'dayStatus', 'playing',
      'probesLeft', public.daily_attempts(3) - v_index,
      'guess', jsonb_build_object('guess', p_guess, 'direction', v_dir, 'tier', v_tier,
        'isWithin10', v_dist > 0 and v_dist <= 10, 'isOneAway', v_dist = 1, 'isCorrect', v_dist = 0)
    );
  end if;

  if v_dist = 0 then
    v_over := true;
    if v_r.round = 1 then
      v_score := case when v_index <= v_r.called
                      then public.daily_call_pay(v_r.called)
                      else public.daily_late_pay() end;
    else
      v_score := public.daily_clue_pay(v_index);
    end if;
  elsif v_last then
    v_over := true;
    v_score := public.score_floor();
  end if;

  if v_over then
    update public.round_results
      set status = (case when v_dist = 0 then 'won' else 'lost' end)::public.round_status,
          score = v_score
    where game_id = v_game.id and round = v_r.round;

    update public.games set
      total_score = total_score + v_score,
      current_round = least(3, v_r.round + 1),
      attempts_allowed = public.daily_attempts(least(3, v_r.round + 1))
    where id = v_game.id
    returning * into v_game;
  end if;

  return jsonb_build_object(
    'round', v_r.round,
    'roundStatus', case when not v_over then 'playing' when v_dist = 0 then 'won' else 'lost' end,
    'dayStatus', v_game.status,
    'roundScore', v_score,
    'totalScore', v_game.total_score,
    'attemptsUsed', v_index,
    'attemptsAllowed', v_r.attempts_allowed,
    'currentRound', v_game.current_round,
    'guess', jsonb_build_object('guess', p_guess, 'direction', v_dir, 'tier', v_tier,
      'isWithin10', v_dist > 0 and v_dist <= 10, 'isOneAway', v_dist = 1, 'isCorrect', v_dist = 0),
    'answer', case when v_over then v_answer end
  );
end;
$$;

/** The bet: a range, and the day ends on it. */
create or replace function public.daily_bet(p_lo integer, p_hi integer)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid    uuid := auth.uid();
  v_game   public.games%rowtype;
  v_r      public.round_results%rowtype;
  v_answer smallint;
  v_lo     int := greatest(1, least(p_lo, p_hi));
  v_hi     int := least(1000, greatest(p_lo, p_hi));
  v_width  int;
  v_inside boolean;
  v_score  smallint;
begin
  if v_uid is null then return jsonb_build_object('error', 'not_authenticated'); end if;
  if p_lo is null or p_hi is null then return jsonb_build_object('error', 'out_of_range'); end if;

  v_game := public.ensure_game(v_uid, public.current_puzzle_date(v_uid));
  select * into v_game from public.games where id = v_game.id for update;

  if v_game.status <> 'playing' then return jsonb_build_object('error', 'already_played'); end if;
  if v_game.current_round <> 3 then return jsonb_build_object('error', 'not_the_bet'); end if;

  select * into v_r from public.round_results where game_id = v_game.id and round = 3;
  if v_r.status <> 'playing' then return jsonb_build_object('error', 'round_over'); end if;

  select answer into v_answer from public.puzzle_round_secrets
  where puzzle_date = v_game.puzzle_date and round = v_r.source_round;

  v_width  := v_hi - v_lo + 1;
  v_inside := v_answer between v_lo and v_hi;
  v_score  := case when v_inside then public.daily_bet_pay(v_width) else public.score_floor() end;

  update public.round_results set
    status = (case when v_inside then 'won' else 'lost' end)::public.round_status,
    score = v_score, bet_lo = v_lo, bet_hi = v_hi
  where game_id = v_game.id and round = 3;

  -- The bet is the last thing in the day, whichever way it lands.
  update public.games set
    total_score = total_score + v_score,
    status = 'complete',
    finished_at = now()
  where id = v_game.id
  returning * into v_game;

  return jsonb_build_object(
    'inside', v_inside, 'width', v_width, 'roundScore', v_score,
    'totalScore', v_game.total_score, 'answer', v_answer, 'dayStatus', 'complete'
  );
end;
$$;

/** The whole day, as the app reads it. */
create or replace function public.game_state()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid   uuid := auth.uid();
  v_date  date;
  v_game  public.games%rowtype;
  v_r     public.round_results%rowtype;
  v_stats public.stats%rowtype;
  v_done  boolean;
begin
  if v_uid is null then return jsonb_build_object('error', 'not_authenticated'); end if;

  v_date := public.current_puzzle_date(v_uid);
  v_game := public.ensure_game(v_uid, v_date);
  select * into v_game from public.games where id = v_game.id;
  select * into v_r from public.round_results where game_id = v_game.id and round = v_game.current_round;
  select * into v_stats from public.stats where user_id = v_uid;
  v_done := v_game.status <> 'playing';

  return jsonb_build_object(
    'puzzleDate', v_date,
    'puzzleNumber', v_date - date '2026-08-12',
    'maxScore', 70,
    'dayStatus', v_game.status,
    'currentRound', v_game.current_round,
    'totalRounds', 3,
    'totalScore', v_game.total_score,
    'round', jsonb_build_object(
      'round', v_r.round,
      -- What kind of question this round is, so the screen knows what to draw.
      'kind', case v_r.round when 1 then 'cold' when 2 then 'clue' else 'bet' end,
      'status', v_r.status,
      'attemptsUsed', v_r.attempts_used,
      'attemptsAllowed', v_r.attempts_allowed,
      'called', v_r.called,
      'clueKind', v_r.clue_kind,
      'clue1', v_r.clue_text,
      'betLo', v_r.bet_lo,
      'betHi', v_r.bet_hi,
      'score', v_r.score,
      'answer', case when v_r.status <> 'playing' then (
        select answer from public.puzzle_round_secrets
        where puzzle_date = v_game.puzzle_date and round = v_r.source_round) end,
      'guesses', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'guess', g.guess, 'direction', g.direction, 'tier', g.tier,
                 'isCorrect', g.direction = 'correct',
                 'isWithin10', g.tier = 'intense', 'isOneAway', false
               ) order by g.guess_index)
        from public.guesses g where g.game_id = v_game.id and g.round = v_r.round
      ), '[]'::jsonb)
    ),
    'rounds', coalesce((
      select jsonb_agg(jsonb_build_object(
               'round', r.round, 'status', r.status, 'score', r.score,
               'attemptsUsed', r.attempts_used, 'attemptsAllowed', r.attempts_allowed,
               'called', r.called, 'clueKind', r.clue_kind,
               'answer', case when r.status <> 'playing' then (
                 select answer from public.puzzle_round_secrets
                 where puzzle_date = v_game.puzzle_date and round = r.source_round) end,
               'marks', coalesce((
                 select jsonb_agg(g2.direction order by g2.guess_index)
                 from public.guesses g2 where g2.game_id = v_game.id and g2.round = r.round
               ), '[]'::jsonb)
             ) order by r.round)
      from public.round_results r where r.game_id = v_game.id
    ), '[]'::jsonb),
    'stats', jsonb_build_object(
      'currentStreak', public.streak_of(v_uid),
      'maxStreak',   coalesce(v_stats.max_streak, 0),
      'gamesPlayed', coalesce(v_stats.games_played, 0),
      'gamesWon',    coalesce(v_stats.games_won, 0),
      'totalPoints', coalesce(v_stats.total_points, 0)
    ),
    'done', v_done
  );
end;
$$;

revoke execute on function public.ensure_game(uuid, date)          from public, anon, authenticated;
revoke execute on function public.daily_call(integer)              from public, anon;
revoke execute on function public.daily_clue(text)                 from public, anon;
revoke execute on function public.daily_bet(integer, integer)      from public, anon;
revoke execute on function public.submit_guess(integer)            from public, anon;
revoke execute on function public.game_state()                     from public, anon;
grant execute on function public.daily_call(integer)          to authenticated;
grant execute on function public.daily_clue(text)             to authenticated;
grant execute on function public.daily_bet(integer, integer)  to authenticated;
grant execute on function public.submit_guess(integer)        to authenticated;
grant execute on function public.game_state()                 to authenticated;

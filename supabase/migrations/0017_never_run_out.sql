-- Make the schedule self-extending.
--
-- Any pre-generated runway ends on some date, and on that date the game breaks
-- for everyone with "no puzzle today". Rather than trusting a reminder years
-- from now, the day is created on demand if it is missing: the first player to
-- open the app on a date nobody has reached yet generates it.
--
-- The pre-generated years still matter — they keep that first request fast and
-- let the schedule be inspected ahead of time — but they are no longer load
-- bearing. There is now no date on which this can run out.

-- Races are possible: two players in the same timezone can hit an ungenerated
-- day at the same instant. Skipping conflicting rows makes the second one a
-- no-op rather than an error.
create or replace function public.generate_puzzle_days(p_start date, p_days integer)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  d       date;
  i       integer;
  r       integer;
  n       integer;
  picked  integer[];
  created integer := 0;
begin
  for i in 0 .. p_days - 1 loop
    d := p_start + i;

    continue when exists (select 1 from public.puzzle_rounds where puzzle_date = d);

    picked := '{}';
    for r in 1 .. 3 loop
      loop
        n := 1 + floor(random() * 1000)::int;
        exit when not (n = any(picked));
      end loop;
      picked := picked || n;

      insert into public.puzzle_rounds (puzzle_date, round, clue1)
      values (d, r, public.pick_clue1(n))
      on conflict (puzzle_date, round) do nothing;

      insert into public.puzzle_round_secrets (puzzle_date, round, answer, clue2)
      values (d, r, n, public.pick_clue2(n))
      on conflict (puzzle_date, round) do nothing;
    end loop;

    created := created + 1;
  end loop;

  return created;
end;
$$;

-- game_state previously returned 'no_puzzle_today' when a date was missing.
-- Now it creates the day and carries on.
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

  -- Self-healing: reaching a date nobody has played creates it rather than
  -- failing. Also covers a gap left by any mistake in the schedule.
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

-- submit_guess does the same, so a guess can't fail on a day that state
-- created a moment earlier.
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
  values (v_game.id, 1, v_order[1], v_game.attempts_allowed)
  on conflict (game_id, round) do nothing;

  return v_game;
end;
$$;

revoke execute on function public.game_state() from public, anon;
grant execute on function public.game_state() to authenticated;

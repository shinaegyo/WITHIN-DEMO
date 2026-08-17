-- Smaller numbers, a floor under every round, and a clean start on Monday.
--
-- Four days old and the totals were already in four figures, because a round
-- has been worth 110 - 10 x attempts since the beginning: a hundred points for
-- a first-guess solve, forty for a seventh. Three rounds a day, three hundred a
-- day, and a leaderboard that turns into a measure of how early somebody joined
-- rather than how well they play.
--
--   attempt   1    2    3    4    5    6    7   missed
--   was     100   90   80   70   60   50   40      0
--   now      20   18   16   14   12   10    5      3
--
-- Sixty a day at most rather than three hundred, and - the part that changes
-- how a bad day feels - every round that ends pays something. Playing three
-- numbers and finding none of them is now worth 9 rather than a zero, which is
-- the difference between a day that went badly and a day that may as well not
-- have happened.
--
-- The floor also fixes a trap the new numbers would have created on their own.
-- A retried round scores nothing, so with a floor on misses only, a player who
-- missed would beat a player who retried and won. Both pay the floor now, and
-- nobody is punished for using the thing the game offered them.
--
-- And the totals start again. Not by deleting anything: stats.total_points is
-- derived from the games table and recompute_stats would refill it by the next
-- evening, so a wipe would quietly undo itself. Instead the sum starts at an
-- epoch - Monday 17 August, the same morning the climb's week turns over.
-- Every game before it keeps its score and its place in history, and the board
-- opens at zero for everybody.
--
-- The season boards need no epoch: they already reset every month, which is the
-- reason this is the last time the points have to be reset by hand.

/** The day the totals start counting from. */
create or replace function public.points_epoch()
returns date
language sql
immutable
as $$ select date '2026-08-17' $$;

/** What a round pays when it ends without a clean solve. */
create or replace function public.score_floor()
returns smallint
language sql
immutable
as $$ select 3::smallint $$;

/**
 * What solving on a given attempt pays.
 *
 * The step from six to seven is deliberately a cliff rather than another two:
 * the seventh attempt only exists in round one, and it is the difference
 * between reading the colours and exhausting them.
 */
create or replace function public.score_for_attempt(attempts smallint)
returns smallint
language sql
immutable
as $$
  select case attempts
    when 1 then 20 when 2 then 18 when 3 then 16 when 4 then 14
    when 5 then 12 when 6 then 10 when 7 then 5
    else 0
  end::smallint;
$$;

/** 0099's submit_guess, with the new ladder and the floor. */
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

/** 0107's all-time board, with per-day rebased on the scoring era. */
create or replace function public.alltime_leaderboard(p_limit integer default 50, p_friends boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid    uuid := auth.uid();
  v_holder uuid;
  v_out    jsonb;
begin
  if v_uid is null then
    return jsonb_build_object('error', 'not_authenticated');
  end if;

  v_holder := public.belt_holder();

  with lifetime as (
    select
      g.user_id,
      sum(g.total_score)::int as points,
      count(*)::int as days,
      max(g.finished_at) as last_at,
      sum(coalesce((
        select sum(abs(gu.guess - s.answer))
        from public.guesses gu
        join public.round_results rr on rr.game_id = g.id and rr.round = gu.round
        join public.puzzle_round_secrets s
             on s.puzzle_date = g.puzzle_date and s.round = rr.source_round
        where gu.game_id = g.id
      ), 0))::bigint as distance,
      sum((select count(*) from public.guesses gu where gu.game_id = g.id))::bigint as guesses
    from public.games g
    where g.status in ('complete', 'eliminated')
      and (not p_friends or exists (
        select 1 from public.my_circle(v_uid) c where c.user_id = g.user_id))
    group by g.user_id
  ),
  scored as (
    select l.*,
           case when l.guesses > 0
                then round(l.distance::numeric / l.guesses)::int else 0 end as avg_off
    from lifetime l
  ),
  ranked as (
    select s.*,
           row_number() over (
             order by s.points desc, s.avg_off asc, s.last_at asc
           ) as rank
    from scored s
  ),
  mine as (select * from ranked where user_id = v_uid),
  field as (select count(*)::int as n from scored)
  select jsonb_build_object(
    'entries', coalesce((
      select jsonb_agg(e order by e.rank)
      from (
        select r.rank,
               coalesce(p.username, 'Player ' || upper(right(r.user_id::text, 4))) as name,
               p.avatar,
               r.points as score,
               r.avg_off,
               r.days as days_played,
               r.user_id = v_uid as is_me,
               r.user_id = v_holder as has_belt
        from ranked r
        join public.profiles p on p.id = r.user_id
        where r.rank <= greatest(1, least(p_limit, 200))
      ) e
    ), '[]'::jsonb),
    'me', (
      select jsonb_build_object(
        'score', m.points,
        'avgOff', m.avg_off,
        'daysPlayed', m.days,
        'rank', m.rank,
        'topPercent', case when (select n from field) >= 20
                           then greatest(1, round(100.0 * m.rank / (select n from field)))::int end
      ) from mine m
    ),
    'beltHolder', (select username from public.profiles where id = v_holder),
    'totalPlayers', (select n from field)
  ) into v_out;

  return v_out;
end;
$$;

/** 0015's, with the totals counted from the epoch rather than from the start. */
create or replace function public.recompute_stats(p_uid uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_current integer := 0;
  v_max     integer := 0;
  v_ends    date;
begin
  insert into public.stats (user_id) values (p_uid) on conflict (user_id) do nothing;

  with completed as (
    select puzzle_date
    from public.games
    where user_id = p_uid
      and status = 'complete'
      and retries_used = 0
  ),
  grouped as (
    select puzzle_date,
           puzzle_date - (row_number() over (order by puzzle_date))::integer as grp
    from completed
  ),
  runs as (
    select grp, count(*)::integer as len, max(puzzle_date) as ends_on
    from grouped group by grp
  )
  select
    coalesce((select len from runs order by ends_on desc limit 1), 0),
    coalesce((select max(len) from runs), 0),
    (select ends_on from runs order by ends_on desc limit 1)
  into v_current, v_max, v_ends;

  update public.stats s set
    -- Games played and won are a record of what somebody has done and are not
    -- reset; only the points start again.
    games_played = (select count(*) from public.games g
                    where g.user_id = p_uid and g.status <> 'playing'),
    games_won    = (select count(*) from public.games g
                    where g.user_id = p_uid and g.status = 'complete'),
    total_points = coalesce((select sum(g.total_score) from public.games g
                             where g.user_id = p_uid
                               and g.puzzle_date >= public.points_epoch()), 0),
    current_streak = v_current,
    streak_ends_on = v_ends,
    max_streak     = greatest(s.max_streak, v_max),
    last_played_date = (select max(g.puzzle_date) from public.games g
                        where g.user_id = p_uid and g.status <> 'playing')
  where s.user_id = p_uid;
end;
$$;

-- Everybody's totals, rebased in one pass. Before Monday this zeroes the board;
-- from Monday it is simply the truth.
update public.stats s set
  total_points = coalesce((select sum(g.total_score) from public.games g
                           where g.user_id = s.user_id
                             and g.puzzle_date >= public.points_epoch()), 0);

revoke execute on function public.points_epoch()              from public, anon, authenticated;
revoke execute on function public.score_floor()               from public, anon, authenticated;
revoke execute on function public.score_for_attempt(smallint) from public, anon, authenticated;
revoke execute on function public.submit_guess(integer)       from public, anon;
revoke execute on function public.alltime_leaderboard(integer, boolean) from public, anon;
grant execute on function public.submit_guess(integer) to authenticated;
grant execute on function public.alltime_leaderboard(integer, boolean) to authenticated;

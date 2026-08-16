-- The climb gets a top, and a shape.
--
-- What was wrong: levels 1 to 39 gave 8 and 7 attempts where the colours alone
-- need at most 7, so the first forty levels held no risk at all - a solver
-- playing them optimally lost nothing across 39 levels and then died five times
-- in the next forty. Easy, long, and then a wall. A hundred levels nobody could
-- reach on top of it, so the climb had no ending either.
--
-- What replaces it: fifty levels, five tiers of ten, and difficulty carried by
-- what a mistake costs rather than by taking guesses away.
--
--   Ground        1-10   7 attempts   a fall costs 10%
--   Sky          11-20   7                        20%
--   Stratosphere 21-30   6                        30%
--   Thin air     31-40   6                        40%
--   Orbit        41-50   5                        50%
--
-- Health is a percentage now rather than five equal lives, because the fall
-- costs differ: ten falls on the ground, two in orbit. It starts every day at
-- 100 and a three-guess solve pays 20 of it back, capped at 100 - so the easy
-- tiers are where you bank the buffer that carries you through the top.
--
-- Checkpoints stay every fifth level up to 40. Orbit has two, at 41 and 46: the
-- summit stretch is where a fall should cost more than four numbers, and making
-- it a property of the tier rather than a trap on level 50 keeps it a rule
-- somebody can read.
--
-- Level 50 is the summit. Clearing it tops the climb out for the week, and
-- because several people can finish, the board breaks their tie on guesses
-- used - which is why every guess is now counted and never rolled back, even
-- the ones on levels replayed after a fall.

-- ---------------------------------------------------------------- schema

alter table public.endless_runs
  add column if not exists health smallint not null default 100,
  -- Every guess ever made in this week's climb. endless_guesses is wiped from
  -- the checkpoint up whenever a day restarts, which is right for the board and
  -- useless for a tiebreak - so the count lives here and only ever goes up.
  add column if not exists guesses_used integer not null default 0,
  add column if not exists summit_at timestamptz;

-- Existing climbs carry their five lives across as the percentage they were.
update public.endless_runs set health = greatest(0, least(100, lives * 20))
where health = 100 and lives is distinct from 5;

-- ---------------------------------------------------------------- the ladder

create or replace function public.endless_max_level()
returns smallint
language sql
immutable
as $$ select 50::smallint $$;

/** Ten levels a tier, five tiers. */
create or replace function public.arena_floor(p_level integer)
returns smallint
language sql
immutable
as $$
  select (case
    when p_level >= 41 then 41
    when p_level >= 31 then 31
    when p_level >= 21 then 21
    when p_level >= 11 then 11
    else 1
  end)::smallint;
$$;

/**
 * Seven is the worst case for the colours alone, so Ground has no slack and is
 * still winnable by anyone who reads them. Orbit's five is below that worst
 * case deliberately: the last ten levels are where the clue has to carry you.
 */
create or replace function public.endless_attempts(p_level integer)
returns smallint
language sql
immutable
as $$
  select (case
    when p_level <= 20 then 7
    when p_level <= 40 then 6
    else 5
  end)::smallint;
$$;

/** What running out of attempts costs, as a share of health. */
create or replace function public.endless_fall(p_level integer)
returns smallint
language sql
immutable
as $$
  select (case
    when p_level <= 10 then 10
    when p_level <= 20 then 20
    when p_level <= 30 then 30
    when p_level <= 40 then 40
    else 50
  end)::smallint;
$$;

/**
 * Every fifth level, except in Orbit, where there are two - and never below the
 * tier you are standing in.
 *
 * The tier floor matters because the tiers are ten deep and the checkpoints are
 * five apart: without it, reaching 21 and falling would put you back at 20,
 * which is Sky. Climbing into a tier should not be something a single fall can
 * undo, and "you never drop out of the tier you reached" is a rule people can
 * hold in their heads.
 */
create or replace function public.endless_checkpoint(p_level integer)
returns smallint
language sql
immutable
as $$
  select greatest(
    case
      when coalesce(p_level, 1) >= 46 then 46
      when coalesce(p_level, 1) >= 41 then 41
      else greatest(1, (coalesce(p_level, 1) / 5) * 5)
    end,
    public.arena_floor(coalesce(p_level, 1))
  )::smallint;
$$;

/**
 * The clue gets stronger with altitude rather than arriving sooner - it is
 * already shown from the first attempt. Orbit leaves under a fifth of the
 * field standing, which is what makes five attempts a puzzle instead of a
 * coin toss.
 */
create or replace function public.endless_clue_target(p_level integer)
returns numeric
language sql
immutable
as $$
  select case
    when p_level <= 10 then 0.55
    when p_level <= 20 then 0.45
    when p_level <= 30 then 0.32
    when p_level <= 40 then 0.25
    else 0.18
  end;
$$;

-- ---------------------------------------------------------------- the run

/**
 * The week's climb, and the daily reset.
 *
 * A new day restores health to 100 and drops you to your checkpoint. 0101's,
 * with lives replaced by health.
 */
create or replace function public.endless_climb(p_uid uuid)
returns public.endless_runs
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_week  date := public.endless_week(p_uid);
  v_today date := public.current_puzzle_date(p_uid);
  v_run   public.endless_runs%rowtype;
  v_floor smallint;
begin
  select * into v_run from public.endless_runs
  where user_id = p_uid and week_start = v_week
  order by started_at desc limit 1;

  if v_run.id is null then
    insert into public.endless_runs
      (user_id, week_start, run_date, session_date, clue1, lives, health, sessions_used, status)
    values
      (p_uid, v_week, v_today, null,
       public.pick_clue1(public.endless_number(v_week, 1)),
       5, 100, 0, 'active')
    returning * into v_run;
    return v_run;
  end if;

  if v_run.session_date is distinct from v_today then
    v_floor := public.endless_checkpoint(greatest(v_run.level, v_run.best_level));

    if v_run.level is distinct from v_floor or v_run.attempts_used > 0 then
      -- From the floor upward: those levels are about to be played again, and a
      -- board carried over from the first time through is the answer.
      delete from public.endless_guesses
      where run_id = v_run.id and level >= v_floor;

      update public.endless_runs set
        level = v_floor,
        attempts_used = 0,
        clue_level = null
      where id = v_run.id
      returning * into v_run;
    end if;
  end if;

  return v_run;
end;
$$;

create or replace function public.endless_start_session()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid   uuid := auth.uid();
  v_run   public.endless_runs%rowtype;
  v_today date;
begin
  if v_uid is null then
    return jsonb_build_object('error', 'not_authenticated');
  end if;

  v_run := public.endless_climb(v_uid);
  v_today := public.current_puzzle_date(v_uid);

  if v_run.summit_at is not null then
    return jsonb_build_object('error', 'topped_out');
  end if;

  if v_run.session_date = v_today and v_run.health > 0 and v_run.status = 'active' then
    return jsonb_build_object('ok', true, 'resumed', true);
  end if;

  if public.endless_sessions_left(v_uid) <= 0 then
    return jsonb_build_object('error', 'no_sessions_left');
  end if;

  -- The board for this level belongs to the session that just ended.
  delete from public.endless_guesses
  where run_id = v_run.id and level = v_run.level;

  update public.endless_runs set
    health = 100,
    lives = 5,
    attempts_used = 0,
    status = 'active',
    sessions_used = 0,
    session_date = v_today,
    clue_level = null
  where id = v_run.id;

  return jsonb_build_object('ok', true, 'resumed', false);
end;
$$;

/**
 * A guess.
 *
 * 0101's, with three changes: health falls by the tier's cost rather than by
 * one life, a solve in three guesses or fewer pays 20 back, and clearing level
 * 50 is the summit rather than a hundredth level nobody reached.
 */
create or replace function public.endless_guess(p_guess integer)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid    uuid := auth.uid();
  v_week   date;
  v_run    public.endless_runs%rowtype;
  v_answer smallint;
  v_dist   integer;
  v_dir    text;
  v_tier   text;
  v_index  smallint;
  v_last   boolean;
  v_next   smallint;
  v_floor  smallint;
  v_fall   smallint;
  v_heal   smallint := 0;
  v_capped boolean := false;
  v_lost   boolean := false;
  v_died   boolean := false;
begin
  if v_uid is null then
    return jsonb_build_object('error', 'not_authenticated');
  end if;
  if p_guess is null or p_guess < 1 or p_guess > 1000 then
    return jsonb_build_object('error', 'out_of_range');
  end if;

  v_week := public.endless_week(v_uid);

  select * into v_run from public.endless_runs
  where user_id = v_uid and week_start = v_week
  order by started_at desc limit 1 for update;

  if v_run.id is null then
    return jsonb_build_object('error', 'no_run');
  end if;
  if v_run.summit_at is not null then
    return jsonb_build_object('error', 'topped_out');
  end if;
  if v_run.health <= 0 or v_run.session_date is distinct from public.current_puzzle_date(v_uid) then
    return jsonb_build_object('error', 'no_session');
  end if;

  if exists (select 1 from public.endless_guesses
             where run_id = v_run.id and level = v_run.level and guess = p_guess) then
    return jsonb_build_object('error', 'duplicate_guess');
  end if;

  if v_run.sessions_used = 0 then
    update public.endless_runs set sessions_used = 1 where id = v_run.id;
    v_run.sessions_used := 1;
  end if;

  v_answer := public.endless_number(v_week, v_run.level);
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

  v_index := v_run.attempts_used + 1;
  v_last  := v_index >= public.endless_attempts(v_run.level);
  v_fall  := public.endless_fall(v_run.level);

  insert into public.endless_guesses (run_id, level, guess_index, guess, direction, tier)
  values (v_run.id, v_run.level, v_index, p_guess, v_dir, v_tier);

  -- Counted here and nowhere else: the rows above are deleted on a rollback,
  -- and the tiebreak has to remember the guesses that were spent losing.
  update public.endless_runs set guesses_used = guesses_used + 1 where id = v_run.id;

  if v_dist = 0 then
    v_next := v_run.level + 1;
    perform public.award_xp(v_uid, 20 + case when public.arena_floor(v_next) > public.arena_floor(v_run.level)
                                             then 50 else 0 end);
    -- Three guesses or fewer is a flex, and it pays a Ground fall back.
    if v_index <= 3 then
      v_heal := least(20, 100 - v_run.health);
    end if;

    if v_next > public.endless_max_level() then
      v_capped := true;
      update public.endless_runs set
        level = v_next,
        best_level = greatest(best_level, v_next),
        attempts_used = v_index,
        health = least(100, health + v_heal),
        status = 'over',
        summit_at = coalesce(summit_at, now())
      where id = v_run.id returning * into v_run;
    else
      update public.endless_runs set
        level = v_next,
        best_level = greatest(best_level, v_next),
        attempts_used = 0,
        clue_level = null,
        health = least(100, health + v_heal)
      where id = v_run.id returning * into v_run;
    end if;
  elsif v_last then
    v_lost := true;

    if v_run.health - v_fall <= 0 then
      v_died := true;
      v_floor := public.endless_checkpoint(greatest(v_run.level, v_run.best_level));
      -- Everything from the floor up, not just the level that was lost: the
      -- climb replays those, and yesterday's guesses would hand them over.
      delete from public.endless_guesses
      where run_id = v_run.id and level >= v_floor;

      update public.endless_runs set
        health = 0,
        lives = 0,
        attempts_used = 0,
        clue_level = null,
        level = v_floor
      where id = v_run.id returning * into v_run;
    else
      delete from public.endless_guesses where run_id = v_run.id and level = v_run.level;
      update public.endless_runs set
        health = health - v_fall,
        lives = greatest(1, ceil((health - v_fall) / 20.0)::smallint),
        attempts_used = 0,
        clue_level = null
      where id = v_run.id returning * into v_run;
    end if;
  else
    update public.endless_runs set attempts_used = v_index
    where id = v_run.id returning * into v_run;
  end if;

  return jsonb_build_object(
    'solved', v_dist = 0,
    'lostLife', v_lost,
    'health', v_run.health,
    'healed', v_heal,
    'fall', v_fall,
    'lives', v_run.lives,
    'sessionOver', v_died,
    'restartsAt', case when v_died then v_run.level end,
    'cleared', v_capped,
    'summit', v_run.summit_at is not null,
    'level', v_run.level,
    'attemptsUsed', v_run.attempts_used,
    'attemptsAllowed', public.endless_attempts(least(v_run.level, public.endless_max_level())),
    'guessesUsed', v_run.guesses_used,
    'guess', jsonb_build_object(
      'guess', p_guess, 'direction', v_dir, 'tier', v_tier,
      'isWithin10', v_dist > 0 and v_dist <= 10,
      'isOneAway',  v_dist = 1,
      'isCorrect',  v_dist = 0
    ),
    'answer', case when v_dist = 0 or v_lost then v_answer end
  );
end;
$$;

/** 0102's, with health in place of lives and the summit reported. */
create or replace function public.endless_state()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid  uuid := auth.uid();
  v_week date;
  v_run  public.endless_runs%rowtype;
  v_show boolean;
  v_clue text;
  v_win  int[];
  v_pick text[];
  v_lvl  smallint;
begin
  if v_uid is null then
    return jsonb_build_object('error', 'not_authenticated');
  end if;

  v_week := public.endless_week(v_uid);
  v_run  := public.endless_climb(v_uid);
  v_lvl  := least(v_run.level, public.endless_max_level());

  v_show := (public.endless_attempts(v_lvl) - v_run.attempts_used)
            <= public.endless_clue_at(v_lvl);

  if v_show and v_run.health > 0 and v_run.summit_at is null then
    if v_run.clue_level is distinct from v_run.level then
      v_win := public.endless_window(v_run.id, v_run.level);
      v_pick := public.clue_at_strength(
        public.endless_number(v_week, v_run.level),
        v_win[1], v_win[2],
        public.endless_clue_target(v_run.level),
        v_run.clue_family,
        v_run.clue_recent
      );

      update public.endless_runs set
        clue1 = v_pick[1],
        clue_family = v_pick[2],
        clue_level = v_run.level,
        clue_recent = array(
          select u from unnest(v_run.clue_recent || v_pick[3]) with ordinality t(u, o)
          order by o
          offset greatest(0, coalesce(array_length(v_run.clue_recent, 1), 0) + 1 - 8)
        )
      where id = v_run.id
      returning * into v_run;
    end if;
    v_clue := v_run.clue1;
  end if;

  return jsonb_build_object(
    'week', v_week,
    'level', v_run.level,
    'maxLevel', public.endless_max_level(),
    'health', v_run.health,
    'fall', public.endless_fall(v_lvl),
    'summit', v_run.summit_at is not null,
    'guessesUsed', v_run.guesses_used,
    'lives', v_run.lives,
    'sessionsLeft', public.endless_sessions_left(v_uid),
    'inSession', v_run.health > 0 and v_run.summit_at is null
                 and v_run.session_date = public.current_puzzle_date(v_uid),
    'attemptsUsed', v_run.attempts_used,
    'attemptsAllowed', public.endless_attempts(v_lvl),
    'clue1', v_clue,
    'guesses', coalesce((
      select jsonb_agg(jsonb_build_object(
               'guess', g.guess, 'direction', g.direction, 'tier', g.tier,
               'isCorrect', g.direction = 'correct',
               'isWithin10', abs(g.guess - public.endless_number(v_week, v_run.level)) <= 10
                             and g.direction <> 'correct',
               'isOneAway', abs(g.guess - public.endless_number(v_week, v_run.level)) = 1
             ) order by g.guess_index)
      from public.endless_guesses g
      where g.run_id = v_run.id and g.level = v_run.level
    ), '[]'::jsonb),
    'best', greatest(0, v_run.best_level - 1)
  );
end;
$$;

/**
 * The week's board: depth first, and among people who finished, fewest guesses.
 *
 * A summit is depth 50 and several people can reach it, so without a tiebreak
 * the top of the board would be an alphabetical list of everyone who finished.
 * Guesses used is the only measure that keeps separating them, and it makes the
 * easy tiers matter: a guess wasted on level 3 costs exactly what one wasted on
 * level 48 does.
 */
create or replace function public.endless_leaderboard(p_limit integer default 50)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid  uuid := auth.uid();
  v_week date;
begin
  if v_uid is null then
    return jsonb_build_object('error', 'not_authenticated');
  end if;

  v_week := public.endless_week(v_uid);

  return jsonb_build_object(
    'week', v_week,
    'max', public.endless_max_level(),
    'entries', coalesce((
      select jsonb_agg(e order by e.rank, e.name)
      from (
        select
          rank() over (
            order by least(max(r.best_level - 1), public.endless_max_level()) desc,
                     min(r.guesses_used) asc,
                     min(r.started_at) asc
          ) as rank,
          p.username as name,
          p.avatar,
          least(max(r.best_level - 1), public.endless_max_level()) as depth,
          min(r.guesses_used) as guesses,
          bool_or(r.summit_at is not null) as topped,
          r.user_id = v_uid as is_me
        from public.endless_runs r
        join public.profiles p on p.id = r.user_id
        where r.week_start = v_week
          and p.username is not null
        group by r.user_id, p.username, p.avatar
        having max(r.best_level - 1) > 0
        order by least(max(r.best_level - 1), public.endless_max_level()) desc,
                 min(r.guesses_used) asc,
                 min(r.started_at) asc
        limit greatest(1, least(p_limit, 200))
      ) e
    ), '[]'::jsonb)
  );
end;
$$;

/** home_status is 0116's, with health where lives were. */
create or replace function public.home_status()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid  uuid := auth.uid();
  v_run  public.endless_runs%rowtype;
  v_date date;
  v_rush public.rush_runs%rowtype;
  v_win  public.window_runs%rowtype;
begin
  if v_uid is null then
    return jsonb_build_object('error', 'not_authenticated');
  end if;

  v_date := public.current_puzzle_date(v_uid);

  select * into v_run from public.endless_runs
  where user_id = v_uid and week_start = public.endless_week(v_uid)
  order by started_at desc limit 1;

  select * into v_rush from public.rush_runs
  where user_id = v_uid and puzzle_date = v_date;

  select * into v_win from public.window_runs
  where user_id = v_uid and puzzle_date = v_date;

  return jsonb_build_object(
    'duelsWaiting', (
      select count(*) from public.duels d
      where not d.ranked
        and v_uid in (d.challenger_id, d.opponent_id)
        and (
          (d.status = 'pending' and d.opponent_id = v_uid)
          or (d.status = 'active' and (
                exists (select 1 from public.duel_progress g
                        where g.duel_id = d.id and g.user_id = v_uid and g.status = 'playing')
                or (public.duel_pick_round(d.id, v_uid) is not null
                    and not exists (select 1 from public.duel_numbers n
                                    where n.duel_id = d.id and n.set_by = v_uid
                                      and n.round = public.duel_pick_round(d.id, v_uid)))
             ))
        )
    ),
    'ranked', jsonb_build_object(
      'rating', null, 'played', 0, 'queued', false, 'inMatch', false,
      'needsMe', false, 'beltHolder', null, 'iHoldBelt', false
    ),
    'impossible', jsonb_build_object(
      'sessionsLeft', public.endless_sessions_left(v_uid),
      'health', coalesce(v_run.health, 100),
      'summit', v_run.summit_at is not null,
      'lives', coalesce(v_run.lives, 0),
      'level', least(coalesce(v_run.level, 1), public.endless_max_level()),
      'best', greatest(0, least(coalesce(v_run.level, 1), public.endless_max_level() + 1) - 1)
    ),
    'rush', jsonb_build_object(
      'played', v_rush.id is not null and public.rush_left(v_rush) <= 0,
      'running', v_rush.id is not null and public.rush_left(v_rush) > 0,
      'found', coalesce(v_rush.found, 0)
    ),
    'window', jsonb_build_object(
      'played', v_win.submitted_at is not null,
      'started', v_win.id is not null,
      'score', coalesce(v_win.score, 0),
      'inside', coalesce(v_win.score, 0) > 0
    )
  );
end;
$$;

-- ------------------------------------------------------- the week restarts
--
-- Every climb on the board was made under the old ladder, and most of them are
-- no longer meaningful: a level of 81 is off the end of a fifty-level climb,
-- and health carried over from five equal lives means nothing now that a fall
-- costs between 10 and 50. So this week starts again for everybody.
--
-- Not from nothing, though. Anyone who was past level 25 has already proved
-- they can read the colours under pressure, and making them replay Ground and
-- Sky is the exact tedium this whole change is meant to remove - so they start
-- at the foot of Stratosphere, where the attempts drop and the falls start to
-- hurt. Everybody else starts at 1, which is now a real climb rather than a
-- warm-up.
--
-- Everyone also gets today's session back, whether or not they had spent it.
-- The rules changed underneath them; the least this can do is let them play
-- the new ones today.

delete from public.endless_guesses g
using public.endless_runs r
where g.run_id = r.id
  and r.week_start >= (select max(week_start) from public.endless_runs);

update public.endless_runs r set
  level         = case when greatest(r.best_level, r.level) - 1 > 25 then 21 else 1 end,
  best_level    = case when greatest(r.best_level, r.level) - 1 > 25 then 21 else 1 end,
  health        = 100,
  lives         = 5,
  attempts_used = 0,
  guesses_used  = 0,
  status        = 'active',
  summit_at     = null,
  sessions_used = 0,
  session_date  = public.current_puzzle_date(r.user_id),
  clue_level    = null,
  clue_family   = null,
  clue_recent   = '{}',
  clue1 = public.pick_clue1(
    public.endless_number(r.week_start,
      case when greatest(r.best_level, r.level) - 1 > 25 then 21 else 1 end)
  )
where r.week_start >= (select max(week_start) from public.endless_runs);

revoke execute on function public.endless_max_level()            from public, anon, authenticated;
revoke execute on function public.endless_fall(integer)          from public, anon, authenticated;
revoke execute on function public.endless_attempts(integer)      from public, anon, authenticated;
revoke execute on function public.endless_checkpoint(integer)    from public, anon, authenticated;
revoke execute on function public.endless_clue_target(integer)   from public, anon, authenticated;
revoke execute on function public.arena_floor(integer)           from public, anon, authenticated;
revoke execute on function public.endless_climb(uuid)            from public, anon, authenticated;
revoke execute on function public.endless_guess(integer)         from public, anon;
revoke execute on function public.endless_state()                from public, anon;
revoke execute on function public.endless_start_session()        from public, anon;
revoke execute on function public.endless_leaderboard(integer)   from public, anon;
revoke execute on function public.home_status()                  from public, anon;
grant execute on function public.endless_guess(integer)       to authenticated;
grant execute on function public.endless_state()              to authenticated;
grant execute on function public.endless_start_session()      to authenticated;
grant execute on function public.endless_leaderboard(integer) to authenticated;
grant execute on function public.home_status()                to authenticated;

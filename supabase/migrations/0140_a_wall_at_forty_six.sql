-- The climb is colours only, and the top is a wall.
--
-- Measured on the live database before writing this: a level with no clue takes
-- 5.6 guesses on average - the tier ran 6 6 6 7 2 5 4 6 4 6 6 7 7 6. From that
-- distribution the failure rate by attempts allowed is roughly
--
--   7 attempts   0%
--   6 attempts  21%
--   5 attempts  71%
--   4 attempts  93%
--
-- Everything below follows from those four numbers rather than from taste.
--
-- A CLUE THAT FADES, THEN STOPS. Ground 0.70, Sky 0.80 - three hundred numbers
-- ruled out, then two hundred. Weak on purpose and weaker as it climbs, so the
-- help never once increases, and gone entirely from Stratosphere up.
--
-- Two seams, not one. The clue disappears at 31, and six attempts becomes five
-- at 61 - the step from a 21% failure rate to a 71% one. Each is legible on
-- its own, and the second is what ends almost every week.
--
-- Modelled over fifty thousand simulated weeks before it was written, using a
-- guess distribution measured on the live database rather than assumed. A
-- player who empties their bar every day lands at level 21 on Monday, 40 on
-- Tuesday, 55 on Wednesday, and then arrives in Orbit and grinds: median
-- finish 64, and eight in a thousand reach 75.
--
-- FLAT FALLS, FULL BAR. Twenty on the Ground and twenty-two above it, rather
-- than the old 10-to-50. That spread meant the Ground could not kill anybody
-- and Orbit killed everybody in two, so the number being tuned was never the
-- one that mattered - what rises with altitude is how often you fall, not what
-- a fall costs. The morning returns the whole hundred, keyed to the date rather
-- than the session, which also closes the hole where a second session in one
-- day handed out a second full bar.

begin;

/** Fifteen levels a tier, five tiers. */
create or replace function public.endless_max_level()
returns smallint
language sql
immutable
as $fn$ select 75::smallint $fn$;

create or replace function public.arena_floor(p_level integer)
returns smallint
language sql
immutable
as $fn$
  select (case
    when p_level >= 61 then 61
    when p_level >= 46 then 46
    when p_level >= 31 then 31
    when p_level >= 16 then 16
    else 1
  end)::smallint;
$fn$;

/**
 * Six to level 60, five in Orbit.
 *
 * Not a gradient. The measured failure rate is 21% at six attempts and 71% at
 * five, so this one step is the entire difficulty curve and everything either
 * side of it is the same climb wearing different colours.
 *
 * The step sits at 61 rather than 46 because 46 was modelled and did not work:
 * a thirty-level stretch at 71% clears about a level a day, so the week ended
 * at 49 with four dead days and nobody ever topped out. Confined to Orbit it
 * becomes a last tier almost everybody reaches and almost nobody leaves -
 * roughly eight in a thousand daily players finish, and the median week ends
 * at 64.
 */
create or replace function public.endless_attempts(p_level integer)
returns smallint
language sql
immutable
as $fn$
  select (case when p_level <= 60 then 6 else 5 end)::smallint;
$fn$;

/**
 * What running out of attempts costs, as a share of health.
 *
 * Twenty on the Ground and twenty-two everywhere above it. Nearly flat, and
 * never falling, because the thing that actually rises with altitude is how
 * often you fall rather than what a fall costs: at 21% failure a level costs
 * about 4.6 health in expectation, and at Orbit's 71% the same 22 costs 15.6.
 * The curve is in the frequency.
 *
 * The old 10-to-50 spread meant the Ground could not kill anybody and Orbit
 * killed everybody in two, so the number being tuned was never the one that
 * mattered. Modelling a rising 20-22-24-26-28 put the summit out of reach for
 * all but thirteen in ten thousand; holding it at 22 lands on eighty-four,
 * with the same median finish.
 */
create or replace function public.endless_fall(p_level integer)
returns smallint
language sql
immutable
as $fn$
  select (case when p_level <= 15 then 20 else 22 end)::smallint;
$fn$;

/** Every fifth level, and never below the tier you are standing in. */
create or replace function public.endless_checkpoint(p_level integer)
returns smallint
language sql
immutable
as $fn$
  select greatest(
    greatest(1, (coalesce(p_level, 1) / 5) * 5),
    public.arena_floor(coalesce(p_level, 1))
  )::smallint;
$fn$;

/**
 * A clue on the Ground and in the Sky, and nothing above them.
 *
 * 99 means it is there from the first attempt; 0 means never, and works
 * because the caller asks whether the attempts remaining have fallen to this
 * number, which cannot happen while a level is still being played.
 *
 * The cut is at 31 rather than anywhere else because that is where the climb
 * stops teaching. The first thirty levels are learnable with help; from
 * Stratosphere on, the colours are all there is, and losing the clue is the
 * event that says so.
 */
create or replace function public.endless_clue_at(p_level integer)
returns smallint
language sql
immutable
as $fn$ select (case when p_level <= 30 then 99 else 0 end)::smallint;
$fn$;

/**
 * How much of the field a clue leaves standing, where there is one.
 *
 * Deliberately weak and getting weaker: 0.70 rules out three hundred numbers
 * and 0.80 two hundred. A nudge on the Ground, half a nudge in the Sky, and
 * nothing above it.
 *
 * Stratosphere was going to get 0.90, and it is clue-less instead. A hundred
 * numbers ruled out is worth about a sixth of a guess, and worse, a target
 * that weak may have no match in the catalogue at all - in which case the
 * fallback is the closest clue that does exist, which could be far stronger.
 * A clue that is either worthless or accidentally generous is worse than none.
 *
 * These are targets rather than guarantees. clue_at_strength ranks the clues
 * the answer actually belongs to by how near their share falls to this and
 * takes the closest, so a number with no weak clue in the catalogue gets the
 * weakest it has. Whether 0.70 and 0.80 are reachable at all depends on what
 * the catalogue holds, and the honest way to find out is to sample the shares
 * once this is live rather than to assume the targets were met.
 */
create or replace function public.endless_clue_target(p_level integer)
returns numeric
language sql
immutable
as $fn$
  select (case
    when p_level <= 15 then 0.70
    else 0.80
  end)::numeric;
$fn$;

/** A full bar, once a day, however many sessions are spent inside it. */
create or replace function public.endless_daily_health()
returns smallint
language sql
immutable
as $fn$ select 100::smallint $fn$;


create or replace function public.endless_heal(p_level integer)
returns smallint
language sql
immutable
as $$ select 10::smallint $$;

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
      (user_id, week_start, run_date, session_date, health_date, clue1, lives, health,
       sessions_used, status)
    values
      (p_uid, v_week, v_today, null, v_today,
       public.pick_clue1(public.endless_number(v_week, 1)),
       5, 100, 0, 'active')
    returning * into v_run;
    return v_run;
  end if;

  -- The day's 30, once per date however many times this is called.
  if v_run.health_date is distinct from v_today then
    update public.endless_runs set
      health = public.endless_daily_health(),
      health_date = v_today
    where id = v_run.id
    returning * into v_run;

    -- lives is derived from health and kept only for older clients.
    update public.endless_runs set
      lives = greatest(0, ceil(v_run.health / 20.0)::smallint)
    where id = v_run.id
    returning * into v_run;
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
  v_uid    uuid := auth.uid();
  v_run    public.endless_runs%rowtype;
  v_today  date;
  v_newday boolean;
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

  v_newday := v_run.session_date is distinct from v_today;

  -- The bar is empty and today has already given what it gives. Ending the day
  -- here is the point: the old code handed over a fresh hundred on every new
  -- session, so the fall that emptied the bar cost nothing at all.
  if v_run.health <= 0 then
    return jsonb_build_object('error', 'no_health');
  end if;

  if public.endless_sessions_left(v_uid) <= 0 then
    return jsonb_build_object('error', 'no_sessions_left');
  end if;

  -- The board for this level belongs to the session that just ended.
  delete from public.endless_guesses
  where run_id = v_run.id and level = v_run.level;

  update public.endless_runs set
    attempts_used = 0,
    status = 'active',
    -- Only on a new day. Resetting this on every session start made
    -- endless_sessions_left recompute against zero every time, so the two-a-day
    -- limit never once bound - and each of those unlimited sessions used to
    -- arrive with a full bar.
    sessions_used = case when v_newday then 0 else sessions_used end,
    session_date = v_today,
    clue_level = null
  where id = v_run.id;

  return jsonb_build_object('ok', true, 'resumed', false, 'health', v_run.health);
end;
$$;

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
    -- Three guesses or fewer is a flex, and it pays ten back. Never a whole
    -- fall: a climb you can undo is not a climb. Three rather than four
    -- because four fires on about a quarter of levels and turns health into
    -- something you top up - three came in once in fourteen when this was
    -- measured, which is the rate a flourish should have.
    if v_index <= 3 then
      v_heal := least(public.endless_heal(v_run.level), 100 - v_run.health);
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

revoke execute on function public.endless_max_level()          from public, anon, authenticated;
revoke execute on function public.arena_floor(integer)         from public, anon, authenticated;
revoke execute on function public.endless_attempts(integer)    from public, anon, authenticated;
revoke execute on function public.endless_fall(integer)        from public, anon, authenticated;
revoke execute on function public.endless_checkpoint(integer)  from public, anon, authenticated;
revoke execute on function public.endless_clue_at(integer)     from public, anon, authenticated;
revoke execute on function public.endless_clue_target(integer) from public, anon, authenticated;
revoke execute on function public.endless_heal(integer)        from public, anon, authenticated;
revoke execute on function public.endless_daily_health()       from public, anon, authenticated;
revoke execute on function public.endless_climb(uuid)          from public, anon, authenticated;
grant  execute on function public.endless_start_session()      to authenticated;
grant  execute on function public.endless_guess(integer)       to authenticated;

commit;

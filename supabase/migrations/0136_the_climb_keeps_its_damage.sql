-- The climb keeps its damage.
--
-- It is called the Impossible Climb and somebody reached level 37 in two hours.
-- Not because they were lucky - because a competent player could not lose. Three
-- separate things guaranteed it, and fixing any one of them alone changes
-- nothing, which is why all three move here.
--
-- One: the payback outran the falls. A Ground fall costs 10 and a three-guess
-- solve paid back 20, so through the first twenty levels a good climber gained
-- health faster than they spent it. The early tiers were not easy, they were
-- free. A clean solve now pays back half of what a fall costs at that altitude
-- - 5 on Ground, 25 in Orbit - so skill always softens a fall and never erases
-- it, and health can only ever trend down.
--
-- Two: health reset to 100 every morning, so damage never became anything. The
-- week was seven separate sprints wearing a week's clothing. Health carries now,
-- and each day gives back 30 rather than the whole bar: a bad Monday follows you
-- into Tuesday, a clean week compounds into a buffer, and the low tiers become
-- the place you bank the health that Orbit is going to take off you.
--
-- Three: two sessions a day, each of which reset the bar - two hundred health a
-- day dressed up as one hundred. The grant is a property of the day now, not of
-- the session. A second session is still allowed and picks up the health the
-- first one left behind; running out ends the climbing day outright, and the
-- next 30 arrives tomorrow.
--
-- What this is not: a cap on levels per day. That was the other candidate and it
-- paces by attendance - the board ends up ranking whoever showed up seven days
-- running. This paces by skill, which is the thing the name promises. If the
-- climb still empties out in two days after this, the cap is the next lever and
-- nothing here is in its way.

begin;

-- The date the daily grant was last applied. Distinct from session_date, which
-- only moves when somebody actually opens the climb: the grant has to land on
-- every read, or the home row reports yesterday's empty bar and greys out a
-- button that would have worked.
alter table public.endless_runs
  add column if not exists health_date date;

update public.endless_runs set health_date = session_date where health_date is null;

/**
 * What a clean solve pays back, by altitude: half of what a fall costs here.
 *
 * Half rather than a flat number so the relationship holds everywhere. The
 * flat 20 was worth two Ground falls and less than half an Orbit one, which
 * made the bottom of the climb free and the top no easier to survive - exactly
 * backwards from a ladder that is meant to get harder as it goes up.
 */
create or replace function public.endless_heal(p_level integer)
returns smallint
language sql
immutable
as $$ select (public.endless_fall(p_level) / 2)::smallint $$;

/** What a day hands back, once, however many sessions are spent inside it. */
create or replace function public.endless_daily_health()
returns smallint
language sql
immutable
as $$ select 30::smallint $$;

/**
 * 0117's, with the day's health handed out here rather than at session start.
 *
 * It belongs on the read, not on the session. home_status and endless_state
 * both come through this function without starting anything, so a grant that
 * waited for start_session would leave the home row reporting yesterday's
 * empty bar and grey out a button that would in fact have worked.
 *
 * Guarded by health_date rather than session_date because this branch runs on
 * every read: session_date only moves when somebody actually opens the climb,
 * so keying off it would hand out 30 more health on every poll until they did.
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
      health = least(100, health + public.endless_daily_health()),
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

/**
 * 0117's, with the health reset gone: endless_climb has already granted
 * whatever today gives before this is reached. All that is left here is
 * refusing to open a session there is no health to spend.
 */
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

/**
 * A guess.
 *
 * 0117's, with one line changed: the payback is the altitude's half-fall
 * rather than a flat 20.
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
    -- Three guesses or fewer is a flex, and it pays back half a fall from this
    -- altitude. Never the whole one: a climb you can undo is not a climb.
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

revoke execute on function public.endless_heal(integer)      from public, anon, authenticated;
revoke execute on function public.endless_daily_health()     from public, anon, authenticated;
-- Replacing a function keeps its privileges, but endless_climb hands back a
-- whole run row and is only ever called from inside other definer functions,
-- so it is worth being explicit rather than trusting inheritance.
revoke execute on function public.endless_climb(uuid)        from public, anon, authenticated;
grant  execute on function public.endless_start_session()    to authenticated;
grant  execute on function public.endless_guess(integer)     to authenticated;

commit;

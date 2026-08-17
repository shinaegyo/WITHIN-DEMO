-- The climb goes back to how it was.
--
-- 0136 changed three things at once: a clean solve paid back half the tier's
-- fall instead of a flat 20, health carried across the week with 30 returned
-- each morning instead of a full bar, and the daily grant became a property of
-- the day rather than of the session. It was tested and it worked. It is being
-- taken out because the change is not wanted yet, not because it was wrong.
--
-- Undone forwards rather than by deleting 0136, because the database has
-- already run it. A migration that has been applied is history; the way back is
-- another migration, not a missing file. 0136 stays in the tree so the sequence
-- still describes what the database actually did.
--
-- The three functions below are 0117's, restored verbatim. endless_heal and
-- endless_daily_health go with them, and so does health_date - nothing reads it
-- once endless_climb stops granting, and leaving a column behind to describe a
-- rule that no longer exists is how the next person ends up trusting it.
--
-- One thing this cannot put back: health that already moved under the new
-- rules. Anyone who fell today is carrying a number the old code would not have
-- given them. It settles itself on the next day boundary, when the restored
-- start_session resets the bar to 100 the way it used to.

begin;

/** 0117's: the day's climb, created on first sight, no grant of any kind. */
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

/** 0117's: a session opens on a full bar. */
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

/** 0117's: a three-guess solve pays back a flat 20. */
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

-- Nothing references these once the three above are back.
drop function if exists public.endless_heal(integer);
drop function if exists public.endless_daily_health();

alter table public.endless_runs drop column if exists day_start_best;
alter table public.endless_runs drop column if exists health_date;

revoke execute on function public.endless_climb(uuid)     from public, anon, authenticated;
grant  execute on function public.endless_start_session() to authenticated;
grant  execute on function public.endless_guess(integer)  to authenticated;

commit;

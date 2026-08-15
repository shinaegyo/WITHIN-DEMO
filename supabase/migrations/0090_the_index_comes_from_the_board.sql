-- A guess takes its index from the board, not from a counter.
--
-- endless_guesses is keyed on (run_id, level, guess_index), and the insert took
-- its index from attempts_used + 1. Those two agree right up until something
-- moves one without the other - and endless_start_session does exactly that: it
-- sets attempts_used to zero and leaves the level's guesses in place. So a
-- player who stopped partway through a number came back, pressed Climb, and
-- every guess from then on tried to write index 1 over a row that already
-- existed:
--
--   duplicate key value violates unique constraint "endless_guesses_pkey"
--
-- Permanent, for everybody it happened to, and invisible until somebody typed a
-- number. Three fixes, because one would only have hidden it:
--
--   the index is read from the board, so it cannot collide whatever a counter
--   says; starting a session clears the level it starts on; and the counters
--   that already drifted are put back in step with the rows.

/** Starting a session clears the number you are about to play. */
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

  if v_run.session_date = v_today and v_run.lives > 0 and v_run.status = 'active' then
    return jsonb_build_object('ok', true, 'resumed', true);
  end if;

  if public.endless_sessions_left(v_uid) <= 0 then
    return jsonb_build_object('error', 'no_sessions_left');
  end if;

  -- The board for this level belongs to the session that just ended. Leaving it
  -- while zeroing attempts_used is what broke the key.
  delete from public.endless_guesses
  where run_id = v_run.id and level = v_run.level;

  update public.endless_runs set
    lives = public.endless_lives_per_session(),
    attempts_used = 0,
    status = 'active',
    sessions_used = 0,
    session_date = v_today,
    clue_level = null
  where id = v_run.id;

  return jsonb_build_object('ok', true, 'resumed', false);
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
  if v_run.lives <= 0 or v_run.session_date is distinct from public.current_puzzle_date(v_uid) then
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

  -- From the board itself. A counter can drift; the rows are the truth, and
  -- they are what the key is made of.
  select coalesce(max(g.guess_index), 0) + 1 into v_index
  from public.endless_guesses g
  where g.run_id = v_run.id and g.level = v_run.level;

  -- And the counter is put back in step, so the attempts shown match the board.
  if v_run.attempts_used <> v_index - 1 then
    update public.endless_runs set attempts_used = v_index - 1
    where id = v_run.id returning * into v_run;
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

  v_last := v_index >= public.endless_attempts(v_run.level);

  insert into public.endless_guesses (run_id, level, guess_index, guess, direction, tier)
  values (v_run.id, v_run.level, v_index, p_guess, v_dir, v_tier);

  if v_dist = 0 then
    v_next := v_run.level + 1;
    perform public.award_xp(v_uid, 20 + case when public.arena_floor(v_next) > public.arena_floor(v_run.level)
                                             then 50 else 0 end);
    if v_next > 100 then
      v_capped := true;
      update public.endless_runs set
        level = v_next, best_level = greatest(best_level, v_next), attempts_used = v_index, status = 'over'
      where id = v_run.id returning * into v_run;
    else
      update public.endless_runs set
        level = v_next, best_level = greatest(best_level, v_next), attempts_used = 0, clue_level = null
      where id = v_run.id returning * into v_run;
    end if;
  elsif v_last then
    v_lost := true;

    if v_run.lives <= 1 then
      v_died := true;
      v_floor := public.arena_floor(greatest(v_run.level, v_run.best_level));
      delete from public.endless_guesses
      where run_id = v_run.id and level >= v_floor;

      update public.endless_runs set
        lives = 0, attempts_used = 0, clue_level = null, level = v_floor
      where id = v_run.id returning * into v_run;
    else
      delete from public.endless_guesses where run_id = v_run.id and level = v_run.level;
      update public.endless_runs set
        lives = lives - 1, attempts_used = 0, clue_level = null
      where id = v_run.id returning * into v_run;
    end if;
  else
    update public.endless_runs set attempts_used = v_index
    where id = v_run.id returning * into v_run;
  end if;

  return jsonb_build_object(
    'solved', v_dist = 0,
    'lostLife', v_lost,
    'lives', v_run.lives,
    'sessionOver', v_died,
    'restartsAt', case when v_died then v_run.level end,
    'cleared', v_capped,
    'level', v_run.level,
    'attemptsUsed', v_run.attempts_used,
    'attemptsAllowed', public.endless_attempts(least(v_run.level, 100)),
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

-- Everyone already stuck: put the counter back in step with the board so the
-- next guess lands rather than colliding.
update public.endless_runs r set attempts_used = coalesce((
  select max(g.guess_index) from public.endless_guesses g
  where g.run_id = r.id and g.level = r.level
), 0)
where r.attempts_used is distinct from coalesce((
  select max(g.guess_index) from public.endless_guesses g
  where g.run_id = r.id and g.level = r.level
), 0);

revoke execute on function public.endless_guess(integer)   from public, anon;
revoke execute on function public.endless_start_session()  from public, anon;
grant execute on function public.endless_guess(integer)  to authenticated;
grant execute on function public.endless_start_session() to authenticated;

-- A climb is spent by guessing, not by opening.
--
-- Pressing Climb marked the day used, so anyone who opened the mode, looked at
-- the number and backed out had spent it - with one session a day that is the
-- whole mode gone for a mis-tap. Nothing had happened: no guess, no life, no
-- level.
--
-- So starting a session now only opens it. The day is charged on the first
-- guess, which is the first moment anything is actually at stake. Backing out
-- before that leaves the climb exactly where it was, and leaving after it still
-- resumes for free, because resuming was never the thing being counted.

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

  -- Already in a session with lives left: carry on rather than restart it.
  if v_run.session_date = v_today and v_run.lives > 0 and v_run.status = 'active' then
    return jsonb_build_object('ok', true, 'resumed', true);
  end if;

  if public.endless_sessions_left(v_uid) <= 0 then
    return jsonb_build_object('error', 'no_sessions_left');
  end if;

  -- Opened, not spent. The first guess is what charges the day.
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

  -- The day is charged here, on the first guess of an open session, and never
  -- again for the rest of it.
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
    delete from public.endless_guesses where run_id = v_run.id and level = v_run.level;

    if v_run.lives <= 1 then
      v_died := true;
      update public.endless_runs set
        lives = 0,
        attempts_used = 0,
        clue_level = null,
        level = public.arena_floor(v_run.level)
      where id = v_run.id returning * into v_run;
    else
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

-- Anyone sitting on a session they opened and never played gets it back.
update public.endless_runs r set sessions_used = 0
where r.sessions_used > 0
  and r.session_date = public.current_puzzle_date(r.user_id)
  and not exists (select 1 from public.endless_guesses g where g.run_id = r.id);

revoke execute on function public.endless_guess(integer)         from public, anon;
revoke execute on function public.endless_start_session()        from public, anon;
grant execute on function public.endless_guess(integer)  to authenticated;
grant execute on function public.endless_start_session() to authenticated;

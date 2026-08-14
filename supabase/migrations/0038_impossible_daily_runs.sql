-- Five Impossible runs a day.
--
-- Unlimited runs made depth a question of persistence: keep restarting and the
-- best run eventually arrives. Five a day makes each one worth playing
-- carefully, and it keeps the weekly board a measure of how well people played
-- rather than how long they sat there.
--
-- Counted against the player's own day, the same date the daily puzzle uses, so
-- a run at 11pm and one at 1am fall on different days wherever they are.

alter table public.endless_runs
  add column if not exists run_date date;

update public.endless_runs set run_date = week_start where run_date is null;

create or replace function public.endless_runs_left(p_uid uuid)
returns integer
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select greatest(0, 5 - (
    select count(*) from public.endless_runs
    where user_id = p_uid and run_date = public.current_puzzle_date(p_uid)
  ))::int;
$$;

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
  v_n    smallint;
  v_left int;
begin
  if v_uid is null then
    return jsonb_build_object('error', 'not_authenticated');
  end if;

  v_week := public.endless_week(v_uid);
  v_left := public.endless_runs_left(v_uid);

  select * into v_run from public.endless_runs
  where user_id = v_uid and week_start = v_week and status = 'active'
  order by started_at desc limit 1;

  -- A new run is only started if the player has one left today.
  if v_run.id is null and v_left > 0 then
    v_n := public.endless_number(v_week, 1);
    insert into public.endless_runs (user_id, week_start, run_date, clue1, clue2)
    values (v_uid, v_week, public.current_puzzle_date(v_uid),
            public.pick_clue1(v_n), public.pick_clue2(v_n))
    returning * into v_run;
    v_left := v_left - 1;
  end if;

  return jsonb_build_object(
    'week', v_week,
    'runsLeft', v_left,
    'hasRun', v_run.id is not null,
    'level', coalesce(v_run.level, 1),
    'attemptsUsed', coalesce(v_run.attempts_used, 0),
    'attemptsAllowed', public.endless_attempts(coalesce(v_run.level, 1)),
    'clue1', v_run.clue1,
    'clue2', case when v_run.clue2_unlocked then v_run.clue2 end,
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
    'best', coalesce((
      select max(level - 1) from public.endless_runs
      where user_id = v_uid and week_start = v_week
    ), 0)
  );
end;
$$;

create or replace function public.endless_restart()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid  uuid := auth.uid();
  v_week date;
  v_n    smallint;
begin
  if v_uid is null then
    return jsonb_build_object('error', 'not_authenticated');
  end if;

  if public.endless_runs_left(v_uid) <= 0 then
    return jsonb_build_object('error', 'no_runs_left');
  end if;

  v_week := public.endless_week(v_uid);

  update public.endless_runs set status = 'over', ended_at = now()
  where user_id = v_uid and week_start = v_week and status = 'active';

  -- Always from the first number: a run is the whole climb, not a checkpoint.
  v_n := public.endless_number(v_week, 1);
  insert into public.endless_runs (user_id, week_start, run_date, clue1, clue2)
  values (v_uid, v_week, public.current_puzzle_date(v_uid),
          public.pick_clue1(v_n), public.pick_clue2(v_n));

  return jsonb_build_object('ok', true);
end;
$$;

revoke execute on function public.endless_runs_left(uuid) from public, anon;
revoke execute on function public.endless_state()         from public, anon;
revoke execute on function public.endless_restart()       from public, anon;
grant execute on function public.endless_state()   to authenticated;
grant execute on function public.endless_restart() to authenticated;

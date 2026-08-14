-- Impossible drops the bonus clue.
--
-- The bonus clue exists to rescue a round: land within 10 and something more
-- specific opens up, so the last attempts are spent narrowing rather than
-- guessing. That is a daily-challenge bargain, where a round is worth points on
-- a sliding scale and the clue costs nothing but the attempts already spent.
--
-- Impossible is not scored that way. There is one thing to lose - the run - and
-- one thing to earn, depth. A second clue arriving exactly when the player is
-- closest turns the deep levels, where four attempts on 1-1000 is close to a
-- coin toss, back into a solvable puzzle. The mode is named for what it
-- promises, and the clue quietly takes that back.
--
-- Everything else is carried over from 0037 and 0038 unchanged: the hundredth
-- number ends a run, five runs a day, counted against the player's own date.
-- The clue2 column stays and is simply never filled or read again.

alter table public.endless_runs alter column clue2 drop not null;
alter table public.endless_runs alter column clue2 set default null;

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
    insert into public.endless_runs (user_id, week_start, run_date, clue1)
    values (v_uid, v_week, public.current_puzzle_date(v_uid), public.pick_clue1(v_n))
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
begin
  if v_uid is null then
    return jsonb_build_object('error', 'not_authenticated');
  end if;
  if p_guess is null or p_guess < 1 or p_guess > 1000 then
    return jsonb_build_object('error', 'out_of_range');
  end if;

  v_week := public.endless_week(v_uid);

  select * into v_run from public.endless_runs
  where user_id = v_uid and week_start = v_week and status = 'active'
  order by started_at desc limit 1 for update;

  if v_run.id is null then
    return jsonb_build_object('error', 'no_run');
  end if;

  if exists (select 1 from public.endless_guesses
             where run_id = v_run.id and level = v_run.level and guess = p_guess) then
    return jsonb_build_object('error', 'duplicate_guess');
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
    if v_next > 100 then
      -- Cleared the hundredth. The run ends because there is nothing after it.
      v_capped := true;
      update public.endless_runs set
        level = v_next, status = 'over', ended_at = now(), attempts_used = v_index
      where id = v_run.id returning * into v_run;
    else
      update public.endless_runs set
        level = v_next,
        attempts_used = 0,
        clue1 = public.pick_clue1(public.endless_number(v_week, v_next))
      where id = v_run.id returning * into v_run;
    end if;
  elsif v_last then
    update public.endless_runs set status = 'over', ended_at = now(), attempts_used = v_index
    where id = v_run.id returning * into v_run;
  else
    update public.endless_runs set attempts_used = v_index
    where id = v_run.id returning * into v_run;
  end if;

  return jsonb_build_object(
    'solved', v_dist = 0,
    'runOver', v_run.status = 'over',
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
    'answer', case when v_dist = 0 or v_run.status = 'over' then v_answer end
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
  insert into public.endless_runs (user_id, week_start, run_date, clue1)
  values (v_uid, v_week, public.current_puzzle_date(v_uid), public.pick_clue1(v_n));

  return jsonb_build_object('ok', true);
end;
$$;

revoke execute on function public.endless_state()         from public, anon;
revoke execute on function public.endless_guess(integer)  from public, anon;
revoke execute on function public.endless_restart()       from public, anon;
grant execute on function public.endless_state()          to authenticated;
grant execute on function public.endless_guess(integer)   to authenticated;
grant execute on function public.endless_restart()        to authenticated;

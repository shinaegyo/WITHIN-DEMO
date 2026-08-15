-- found = found + 1 was ambiguous, and only on the winning branch.
--
-- FOUND is a built-in PL/pgSQL variable - the boolean set after every statement
-- - so a column of the same name cannot be read unqualified inside a function.
-- Postgres refuses rather than guesses, which is right, and the error lands
-- exactly where a player solves their first number: everything up to that point
-- worked, so the mode looked fine until the moment it paid.
--
-- Qualifying the right-hand side through an alias settles it. The column keeps
-- its name because the leaderboard and the client read it, and renaming a
-- column to dodge a language keyword is a change in the wrong direction.

create or replace function public.rush_guess(p_guess integer)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid    uuid := auth.uid();
  v_date   date;
  v_run    public.rush_runs%rowtype;
  v_answer smallint;
  v_dist   integer;
  v_dir    text;
  v_tier   text;
begin
  if v_uid is null then
    return jsonb_build_object('error', 'not_authenticated');
  end if;
  if p_guess is null or p_guess < 1 or p_guess > 1000 then
    return jsonb_build_object('error', 'out_of_range');
  end if;

  v_date := public.current_puzzle_date(v_uid);

  select * into v_run from public.rush_runs
  where user_id = v_uid and puzzle_date = v_date
  for update;

  if v_run.id is null then
    return jsonb_build_object('error', 'no_run');
  end if;
  if public.rush_left(v_run) <= 0 then
    return jsonb_build_object('error', 'time_up');
  end if;

  v_answer := public.rush_number(v_date, v_run.position);
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

  insert into public.rush_guesses (run_id, position, guess, direction, tier)
  values (v_run.id, v_run.position, p_guess, v_dir, v_tier);

  if v_dist = 0 then
    update public.rush_runs r set
      found = r.found + 1,
      position = r.position + 1,
      attempts = r.attempts + 1
    where r.id = v_run.id returning r.* into v_run;
    perform public.award_xp(v_uid, 15);
  else
    update public.rush_runs r set attempts = r.attempts + 1
    where r.id = v_run.id returning r.* into v_run;
  end if;

  return jsonb_build_object(
    'solved', v_dist = 0,
    'found', v_run.found,
    'secondsLeft', public.rush_left(v_run),
    'over', public.rush_left(v_run) <= 0,
    'guess', jsonb_build_object(
      'guess', p_guess, 'direction', v_dir, 'tier', v_tier,
      'isWithin10', v_dist > 0 and v_dist <= 10,
      'isOneAway',  v_dist = 1,
      'isCorrect',  v_dist = 0
    ),
    'answer', case when v_dist = 0 then v_answer end
  );
end;
$$;

revoke execute on function public.rush_guess(integer) from public, anon;
grant execute on function public.rush_guess(integer) to authenticated;

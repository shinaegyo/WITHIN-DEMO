-- Cap what a run can pay, and make a repeated guess free.
--
-- Driving the API with no typing delay found 87 numbers in three minutes and
-- was paid 1,305 XP for it - five levels in one run, where a strong human run
-- is six to ten numbers and 150. Paying by the number rewards whoever automates
-- it, so the pay stops at twelve: above any human run, below any scripted one.
-- The score on the board is unaffected. What a script cannot be given is a
-- level, and a leaderboard is defended by attention rather than arithmetic.
--
-- And a guess that repeats a guess already made costs nothing now. The client
-- retries a request that looks dropped - a phone on one bar loses them - and
-- without this the retry of a guess that did arrive is counted twice, spending
-- a second of a clock that is the entire score.

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
  v_paid   integer;
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

  -- Already made against this number: answer it again and charge nothing. A
  -- retry has to be safe, and the same guess twice was never worth counting.
  if exists (select 1 from public.rush_guesses g
             where g.run_id = v_run.id and g.position = v_run.position
               and g.guess = p_guess) then
    return jsonb_build_object(
      'solved', false,
      'found', v_run.found,
      'secondsLeft', public.rush_left(v_run),
      'over', public.rush_left(v_run) <= 0,
      'guess', jsonb_build_object(
        'guess', p_guess, 'direction', v_dir, 'tier', v_tier,
        'isWithin10', v_dist > 0 and v_dist <= 10,
        'isOneAway',  v_dist = 1,
        'isCorrect',  false
      ),
      'answer', null
    );
  end if;

  insert into public.rush_guesses (run_id, position, guess, direction, tier)
  values (v_run.id, v_run.position, p_guess, v_dir, v_tier);

  if v_dist = 0 then
    update public.rush_runs r set
      found = r.found + 1,
      position = r.position + 1,
      attempts = r.attempts + 1
    where r.id = v_run.id returning r.* into v_run;

    -- Twelve numbers is above any human run and below any scripted one.
    if v_run.found <= 12 then
      perform public.award_xp(v_uid, 15);
    end if;
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

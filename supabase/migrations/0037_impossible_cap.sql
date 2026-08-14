-- Cap a run at 100 numbers.
--
-- Nobody will meet it. From level seven the allowance is four attempts and
-- stays there, and four attempts on 1-1000 is a coin toss at best; chaining
-- ninety of those is a probability with a long row of zeros. The cap exists so
-- a theoretically perfect run terminates, not because anyone will finish.
--
-- Which is also why the mode is called Impossible. A run ending at six or seven
-- is the expected outcome, and the name should say so rather than leaving
-- people feeling they failed at something they were meant to beat.

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
        clue2_unlocked = false,
        clue1 = public.pick_clue1(public.endless_number(v_week, v_next)),
        clue2 = public.pick_clue2(public.endless_number(v_week, v_next))
      where id = v_run.id returning * into v_run;
    end if;
  elsif v_last then
    update public.endless_runs set status = 'over', ended_at = now(), attempts_used = v_index
    where id = v_run.id returning * into v_run;
  else
    update public.endless_runs set
      attempts_used = v_index,
      clue2_unlocked = clue2_unlocked or v_dist <= 10
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

revoke execute on function public.endless_guess(integer) from public, anon;
grant execute on function public.endless_guess(integer) to authenticated;

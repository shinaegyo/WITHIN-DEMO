-- Opening the mode is not spending the day.
--
-- The week's row is created the first time a player looks at Impossible, and it
-- was created as though a session had already been started: sessions_used 1,
-- session_date today. With two a day that left one and nobody noticed. With one
-- a day it leaves none - so a player who has never guessed anything is told the
-- climb is done and the button is disabled. Reading a screen locked them out of
-- the mode for the day.
--
-- The row is now created dormant. A session is spent in exactly one place, by
-- pressing the button, which is where it was always supposed to happen.

create or replace function public.endless_climb(p_uid uuid)
returns public.endless_runs
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_week date := public.endless_week(p_uid);
  v_today date := public.current_puzzle_date(p_uid);
  v_run  public.endless_runs%rowtype;
begin
  select * into v_run from public.endless_runs
  where user_id = p_uid and week_start = v_week
  order by started_at desc limit 1;

  if v_run.id is null then
    insert into public.endless_runs
      (user_id, week_start, run_date, session_date, clue1, lives, sessions_used, status)
    values
      (p_uid, v_week, v_today, null,
       public.pick_clue1(public.endless_number(v_week, 1)),
       public.endless_lives_per_session(), 0, 'active')
    returning * into v_run;
  end if;

  return v_run;
end;
$$;

-- Anyone whose row was created today by looking rather than playing gets their
-- climb back: no guesses on it means no session was ever spent.
update public.endless_runs r set sessions_used = 0, session_date = null
where r.session_date = r.run_date
  and r.sessions_used = 1
  and r.level = 1
  and not exists (select 1 from public.endless_guesses g where g.run_id = r.id);

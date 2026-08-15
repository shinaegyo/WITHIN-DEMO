-- A new day starts at the checkpoint, not where yesterday stopped.
--
-- Losing five lives dropped the climb to the floor of the deepest tier reached,
-- which is the rule - the tiers are checkpoints. But a day that simply ended,
-- with lives still in hand, kept the level exactly where it was. So somebody
-- who reached level 9 and went to bed came back to level 9 the next morning,
-- having never earned The Depths, and with yesterday's board still on screen.
--
-- The tier is the thing you keep. Everything inside it is played again.
--
-- Doing it here, in the accessor every read goes through, rather than in
-- start_session: the board, the home row and the climb screen all have to agree
-- about where today begins before anybody presses anything.

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
      (user_id, week_start, run_date, session_date, clue1, lives, sessions_used, status)
    values
      (p_uid, v_week, v_today, null,
       public.pick_clue1(public.endless_number(v_week, 1)),
       public.endless_lives_per_session(), 0, 'active')
    returning * into v_run;
    return v_run;
  end if;

  -- The day has turned since this run was last touched: fall back to the floor
  -- of the deepest tier reached, and clear the board that belonged to yesterday.
  if v_run.session_date is distinct from v_today then
    v_floor := public.arena_floor(greatest(v_run.level, v_run.best_level));

    if v_run.level is distinct from v_floor or v_run.attempts_used > 0 then
      delete from public.endless_guesses
      where run_id = v_run.id and level = v_run.level;

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

revoke execute on function public.endless_climb(uuid) from public, anon, authenticated;

-- One hint per level, and it stays put.
--
-- The clue was recomputed on every read, so each guess replaced it with a
-- sharper one. That reads as a stream of hints rather than a single piece of
-- help, and it quietly made the early levels far easier than intended: a player
-- guessing five times was handed five clues.
--
-- It is now computed once, the first time it is due, and stored against the
-- level it belongs to. The same sentence stays on screen for the rest of that
-- level, which is what "you get a clue" should mean.

alter table public.endless_runs add column if not exists clue_level smallint;

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
  v_win  int[];
  v_clue text := null;
  v_show boolean;
begin
  if v_uid is null then
    return jsonb_build_object('error', 'not_authenticated');
  end if;

  v_week := public.endless_week(v_uid);
  v_left := public.endless_runs_left(v_uid);

  select * into v_run from public.endless_runs
  where user_id = v_uid and week_start = v_week and status = 'active'
  order by started_at desc limit 1;

  if v_run.id is null and v_left > 0 then
    v_n := public.endless_number(v_week, 1);
    insert into public.endless_runs (user_id, week_start, run_date, clue1)
    values (v_uid, v_week, public.current_puzzle_date(v_uid), public.pick_clue1(v_n))
    returning * into v_run;
    v_left := v_left - 1;
  end if;

  if v_run.id is not null then
    v_show := (public.endless_attempts(v_run.level) - v_run.attempts_used)
              <= public.endless_clue_at(v_run.level);

    if v_show then
      -- Written once per level. After that the stored sentence is served
      -- unchanged, however many guesses follow.
      if v_run.clue_level is distinct from v_run.level then
        v_win := public.endless_window(v_run.id, v_run.level);
        update public.endless_runs set
          clue1 = public.live_clue(public.endless_number(v_week, v_run.level), v_win[1], v_win[2]),
          clue_level = v_run.level
        where id = v_run.id
        returning * into v_run;
      end if;
      v_clue := v_run.clue1;
    end if;
  end if;

  return jsonb_build_object(
    'week', v_week,
    'runsLeft', v_left,
    'hasRun', v_run.id is not null,
    'level', coalesce(v_run.level, 1),
    'attemptsUsed', coalesce(v_run.attempts_used, 0),
    'attemptsAllowed', public.endless_attempts(coalesce(v_run.level, 1)),
    'clue1', v_clue,
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

revoke execute on function public.endless_state() from public, anon;
grant execute on function public.endless_state() to authenticated;

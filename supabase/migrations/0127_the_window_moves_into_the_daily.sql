-- The Window is gone, because round three of the daily is the Window.
--
-- Three free guesses and then a range you commit to was the best idea in the
-- side modes and the least played: four finishers on a day the daily had
-- twenty-four. It was never a discovery problem worth solving from the outside
-- - a mode nobody opens is a mode nobody opens - so the mechanic moved to where
-- everybody already is, and the mode it came from has nothing left to do.
--
-- The runs go with it. Keeping the table would leave a leaderboard nothing
-- writes to and a score nothing reads, which is the kind of thing that looks
-- like a bug to the next person who finds it. The daily's own round_results
-- hold every range committed from here on.
--
-- Run this AFTER 0123 and 0124, and after the client that plays three rounds is
-- deployed. In that order there is never a day without a range to name; in any
-- other order there is.

begin;

drop function if exists public.window_state();
drop function if exists public.window_probe(integer);
drop function if exists public.window_submit(integer, integer);
drop function if exists public.window_leaderboard(integer);
drop function if exists public.window_number(date);
drop function if exists public.window_probes_allowed();
drop function if exists public.window_max_width();

drop table if exists public.window_probes;
drop table if exists public.window_runs;

-- home_status as 0120 left it, minus a mode that no longer exists. The client
-- reads every field defensively, so an app that predates this simply sees the
-- window key stop arriving and treats it as untried - which is why the tile is
-- gone from the client before this runs, not after.
create or replace function public.home_status()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid  uuid := auth.uid();
  v_run  public.endless_runs%rowtype;
  v_date date;
  v_rush public.rush_runs%rowtype;
begin
  if v_uid is null then
    return jsonb_build_object('error', 'not_authenticated');
  end if;

  v_date := public.current_puzzle_date(v_uid);

  select * into v_run from public.endless_runs
  where user_id = v_uid and week_start = public.endless_week(v_uid)
  order by started_at desc limit 1;

  select * into v_rush from public.rush_runs
  where user_id = v_uid and puzzle_date = v_date;

  return jsonb_build_object(
    'duelsWaiting', (
      select count(*) from public.duels d
      where not d.ranked
        and v_uid in (d.challenger_id, d.opponent_id)
        and (
          (d.status = 'pending' and d.opponent_id = v_uid)
          or (d.status = 'active' and (
                exists (select 1 from public.duel_progress g
                        where g.duel_id = d.id and g.user_id = v_uid and g.status = 'playing')
                or (public.duel_pick_round(d.id, v_uid) is not null
                    and not exists (select 1 from public.duel_numbers n
                                    where n.duel_id = d.id and n.set_by = v_uid
                                      and n.round = public.duel_pick_round(d.id, v_uid)))
             ))
        )
    ),
    -- Waiting survives leaving the screen, so something other than that screen
    -- has to say it is still going on.
    'queued', public.is_queued(v_uid),
    'ranked', jsonb_build_object(
      'rating', null, 'played', 0, 'queued', false, 'inMatch', false,
      'needsMe', false, 'beltHolder', null, 'iHoldBelt', false
    ),
    'impossible', jsonb_build_object(
      'sessionsLeft', public.endless_sessions_left(v_uid),
      'health', coalesce(v_run.health, 100),
      'summit', v_run.summit_at is not null,
      'lives', coalesce(v_run.lives, 0),
      'level', least(coalesce(v_run.level, 1), public.endless_max_level()),
      'best', greatest(0, least(coalesce(v_run.level, 1), public.endless_max_level() + 1) - 1)
    ),
    'rush', jsonb_build_object(
      'played', v_rush.id is not null and public.rush_left(v_rush) <= 0,
      'running', v_rush.id is not null and public.rush_left(v_rush) > 0,
      'found', coalesce(v_rush.found, 0)
    )
  );
end;
$$;

grant execute on function public.home_status() to authenticated;

commit;

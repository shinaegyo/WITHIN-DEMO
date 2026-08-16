-- home_status has never known about Rush or Window.
--
-- It carries duels waiting and the Impossible climb, and nothing about the two
-- newest modes - which is why their rows on the Games screen still look
-- available after they have been played, and why a home screen cannot say
-- whether they are worth opening.
--
-- Two lookups on tables that already exist, keyed on the player's own puzzle
-- date. Nothing else about the function changes; it is 0064's, extracted with
-- the two blocks added.
--
-- Window returns its score and whether it landed separately. A missed window is
-- genuinely zero, and "0 points" on a home screen is honest and bleak - the
-- screen can say "Missed" instead, but only if it is told which zero it is
-- looking at.

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
  v_win  public.window_runs%rowtype;
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

  select * into v_win from public.window_runs
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
    'ranked', jsonb_build_object(
      'rating', null, 'played', 0, 'queued', false, 'inMatch', false,
      'needsMe', false, 'beltHolder', null, 'iHoldBelt', false
    ),
    'impossible', jsonb_build_object(
      'sessionsLeft', public.endless_sessions_left(v_uid),
      'lives', coalesce(v_run.lives, 0),
      'level', coalesce(v_run.level, 1),
      'best', greatest(0, coalesce(v_run.level, 1) - 1)
    ),
    -- Played means the clock ran out, not that a row exists: starting Rush and
    -- walking away leaves one behind that is still playable. rush_left is the
    -- game's own clock, and asking it rather than rebuilding the arithmetic
    -- here is what keeps the two from disagreeing after a pause.
    'rush', jsonb_build_object(
      'played', v_rush.id is not null and public.rush_left(v_rush) <= 0,
      'running', v_rush.id is not null and public.rush_left(v_rush) > 0,
      'found', coalesce(v_rush.found, 0)
    ),
    'window', jsonb_build_object(
      'played', v_win.submitted_at is not null,
      'started', v_win.id is not null,
      'score', coalesce(v_win.score, 0),
      -- The screen needs to tell a zero that was earned from a zero that
      -- missed, so it can say "Missed" rather than "0 points".
      'inside', coalesce(v_win.score, 0) > 0
    )
  );
end;
$$;

revoke execute on function public.home_status() from public, anon;
grant execute on function public.home_status() to authenticated;

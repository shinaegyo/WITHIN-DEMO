-- What each mode is worth opening for, in one call.
--
-- The home screen listed the modes as three doors with nothing written on them.
-- A door tells you nothing: whether a friend is waiting on your number, how
-- many Impossible runs are left today, who holds the belt. All of that already
-- exists, scattered across four functions, and the screen would have needed
-- four round trips to say any of it.
--
-- One deliberately excluded: this must never call endless_state. That function
-- starts a run if none is open, which counts against the five for the day - so
-- merely looking at the home screen would spend one.

create or replace function public.home_status()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid    uuid := auth.uid();
  v_week   date;
  v_holder uuid;
begin
  if v_uid is null then
    return jsonb_build_object('error', 'not_authenticated');
  end if;

  v_week   := public.endless_week(v_uid);
  v_holder := public.belt_holder();

  return jsonb_build_object(
    -- Friendly duels wanting something from you: a challenge to answer, a
    -- number to set, or a round to play.
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
      'rating', (select rating from public.ranked_stats where user_id = v_uid),
      'played', coalesce((select played from public.ranked_stats where user_id = v_uid), 0),
      'queued', exists (select 1 from public.ranked_queue where user_id = v_uid),
      'inMatch', exists (
        select 1 from public.duels d
        where d.ranked and d.status = 'active' and v_uid in (d.challenger_id, d.opponent_id)
      ),
      'needsMe', exists (
        select 1 from public.duels d
        where d.ranked and d.status = 'active'
          and v_uid in (d.challenger_id, d.opponent_id)
          and (
            exists (select 1 from public.duel_progress g
                    where g.duel_id = d.id and g.user_id = v_uid and g.status = 'playing')
            or (public.duel_pick_round(d.id, v_uid) is not null
                and not exists (select 1 from public.duel_numbers n
                                where n.duel_id = d.id and n.set_by = v_uid
                                  and n.round = public.duel_pick_round(d.id, v_uid)))
          )
      ),
      'beltHolder', (select username from public.profiles where id = v_holder),
      'iHoldBelt', v_holder = v_uid
    ),

    'impossible', jsonb_build_object(
      'runsLeft', public.endless_runs_left(v_uid),
      'best', coalesce((
        select max(level - 1) from public.endless_runs
        where user_id = v_uid and week_start = v_week
      ), 0)
    )
  );
end;
$$;

revoke execute on function public.home_status() from public, anon;
grant execute on function public.home_status() to authenticated;

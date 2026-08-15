-- Only named players appear on the weekly board.
--
-- Every account that has never chosen a name was being listed as "Player", so
-- the board carried several identical rows - anonymous sessions that reached
-- level 1 and were never seen again, mine among them from testing tonight.
-- Ranks tie and the names match, so two of those rows are indistinguishable to
-- anyone reading the board and, as it turned out, to React as well.
--
-- Choosing a name is the moment somebody becomes a player. Before that there is
-- nothing to compare.

create or replace function public.endless_leaderboard(p_limit integer default 50)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid  uuid := auth.uid();
  v_week date;
begin
  if v_uid is null then
    return jsonb_build_object('error', 'not_authenticated');
  end if;

  v_week := public.endless_week(v_uid);

  return jsonb_build_object(
    'week', v_week,
    'entries', coalesce((
      select jsonb_agg(e order by e.rank, e.name)
      from (
        select
          rank() over (order by max(r.best_level - 1) desc) as rank,
          p.username as name,
          p.avatar,
          max(r.best_level - 1) as depth,
          r.user_id = v_uid as is_me
        from public.endless_runs r
        join public.profiles p on p.id = r.user_id
        where r.week_start = v_week
          and p.username is not null
        group by r.user_id, p.username, p.avatar
        having max(r.best_level - 1) > 0
        order by max(r.best_level - 1) desc
        limit greatest(1, least(p_limit, 200))
      ) e
    ), '[]'::jsonb)
  );
end;
$$;

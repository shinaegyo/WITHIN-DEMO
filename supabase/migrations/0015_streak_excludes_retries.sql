-- A streak has to be earned without help.
--
-- Completing the day after a rewarded retry still earns points and a
-- leaderboard place, but it no longer extends a streak. Otherwise a streak
-- only measures willingness to watch ads, and the number that players care
-- about most is the easiest one to buy.
--
-- Points and games played are unaffected: those were earned on rounds that
-- were played straight, since a retried round already scores zero.

create or replace function public.recompute_stats(p_uid uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_current integer := 0;
  v_max     integer := 0;
begin
  insert into public.stats (user_id) values (p_uid) on conflict (user_id) do nothing;

  -- Only clean completions count toward a run: finished all three rounds, and
  -- no retry used that day.
  with completed as (
    select puzzle_date
    from public.games
    where user_id = p_uid
      and status = 'complete'
      and retries_used = 0
  ),
  grouped as (
    select puzzle_date,
           puzzle_date - (row_number() over (order by puzzle_date))::integer as grp
    from completed
  ),
  runs as (
    select grp, count(*)::integer as len, max(puzzle_date) as ends_on
    from grouped group by grp
  )
  select
    coalesce((select len from runs order by ends_on desc limit 1), 0),
    coalesce((select max(len) from runs), 0)
  into v_current, v_max;

  update public.stats s set
    -- Every finished day still counts as played and, if completed, as won.
    games_played = (select count(*) from public.games g
                    where g.user_id = p_uid and g.status <> 'playing'),
    games_won    = (select count(*) from public.games g
                    where g.user_id = p_uid and g.status = 'complete'),
    total_points = coalesce((select sum(g.total_score) from public.games g
                             where g.user_id = p_uid), 0),
    current_streak = v_current,
    max_streak     = greatest(s.max_streak, v_max),
    last_played_date = (select max(g.puzzle_date) from public.games g
                        where g.user_id = p_uid and g.status <> 'playing')
  where s.user_id = p_uid;
end;
$$;

-- Apply the new rule to everyone already recorded.
do $$
declare r record;
begin
  for r in select user_id from public.stats loop
    perform public.recompute_stats(r.user_id);
  end loop;
end $$;

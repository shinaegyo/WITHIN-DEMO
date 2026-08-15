-- The last seven days, whether they were played or not.
--
-- A streak is a single number, and a single number hides its own shape: three
-- days and thirty days look alike, and a day about to break the run looks like
-- nothing at all. Seven dots say which days were finished and which were let
-- go, so the streak becomes something a player can see themselves keeping.
--
-- The gaps are the point, so the series is generated from the calendar rather
-- than read off the games table - a day nobody played has no row there, and a
-- list of what was played cannot show what was missed.

create or replace function public.recent_days(p_days integer default 7)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with span as (
    select greatest(1, least(coalesce(p_days, 7), 30)) as n,
           public.current_puzzle_date(auth.uid()) as today
  ),
  days as (
    select generate_series(span.today - (span.n - 1), span.today, interval '1 day')::date as d
    from span
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'date', days.d,
           'status', coalesce(g.status::text, 'none'),
           'score', coalesce(g.total_score, 0)
         ) order by days.d), '[]'::jsonb)
  from days
  left join public.games g
    on g.user_id = auth.uid() and g.puzzle_date = days.d;
$$;

revoke execute on function public.recent_days(integer) from public, anon;
grant execute on function public.recent_days(integer) to authenticated;

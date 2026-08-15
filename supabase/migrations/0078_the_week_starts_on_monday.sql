-- Monday to Sunday, not the last seven days.
--
-- A rolling window put today at the right-hand end always, so the marked circle
-- moved with the reader and the row had no shape to recognise: the same seven
-- dots meant something different every day, and nothing said which day was
-- which. A calendar week sits still. Monday is on the left on Monday and on
-- Friday, and the days that have not happened yet are visibly ahead of you
-- rather than missing.
--
-- Days still to come are told apart from days let go. Sunday is not a day you
-- failed to play on a Wednesday.

create or replace function public.recent_days(p_days integer default 7)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with today as (
    select public.current_puzzle_date(auth.uid()) as d
  ),
  span as (
    -- isodow: Monday is 1, so subtracting one lands on this week's Monday.
    select (select d from today) as today,
           (select d from today) - (extract(isodow from (select d from today))::int - 1) as monday
  ),
  days as (
    select generate_series(span.monday, span.monday + 6, interval '1 day')::date as d
    from span
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'date', days.d,
           'status', case
                       when days.d > (select today from span) then 'future'
                       else coalesce(g.status::text, 'none')
                     end,
           'isToday', days.d = (select today from span),
           'score', coalesce(g.total_score, 0)
         ) order by days.d), '[]'::jsonb)
  from days
  left join public.games g
    on g.user_id = auth.uid() and g.puzzle_date = days.d;
$$;

revoke execute on function public.recent_days(integer) from public, anon;
grant execute on function public.recent_days(integer) to authenticated;

-- Ranking Rush for ten thousand players rather than for eighteen.
--
-- Scores here are single digits, so at any real size thousands of people share
-- every one of them. Three consequences, and this handles all three.
--
-- Ties broke on who started earlier, which ranked people by what time they woke
-- up. They break on guesses used now: seven numbers in 41 guesses beat seven in
-- 58, because reading the colours faster is the skill the mode is actually
-- testing, and it is the one thing that separates two identical scores.
--
-- A position stops being worth reading long before ten thousand - nobody is
-- glad to be four-thousandth at something they did well - so the player's own
-- standing is returned as a percentile. Under twenty runs a percentile is
-- nonsense in the other direction ("top 6%" of seventeen people), so the rank
-- comes back too and the screen decides which to say.
--
-- And the distribution: how many players found each score today. At this size
-- it is the honest answer to "was that any good", it has no tie problem at all
-- because nobody is ranked in it, and it is the thing worth screenshotting.

create or replace function public.rush_leaderboard(p_limit integer default 10)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid    uuid := auth.uid();
  v_date   date;
  v_me     public.rush_runs%rowtype;
  v_total  integer;
  v_better integer;
begin
  if v_uid is null then
    return jsonb_build_object('error', 'not_authenticated');
  end if;

  v_date := public.current_puzzle_date(v_uid);

  select * into v_me from public.rush_runs
  where user_id = v_uid and puzzle_date = v_date;

  -- Everyone who ran today, including the runs that found nothing: a
  -- distribution that hides them flatters everybody else.
  select count(*) into v_total
  from public.rush_runs r
  join public.profiles p on p.id = r.user_id
  where r.puzzle_date = v_date and p.username is not null;

  select count(*) into v_better
  from public.rush_runs r
  join public.profiles p on p.id = r.user_id
  where r.puzzle_date = v_date and p.username is not null
    and (r.found > coalesce(v_me.found, -1)
      or (r.found = v_me.found and r.attempts < v_me.attempts));

  return jsonb_build_object(
    'date', v_date,
    'total', v_total,

    -- The showcase. Ten rows of what a good run looks like, which is worth
    -- seeing however far down the list you are.
    'entries', coalesce((
      select jsonb_agg(e order by e.rank, e.name)
      from (
        select
          rank() over (order by r.found desc, r.attempts asc) as rank,
          p.username as name,
          p.avatar,
          r.found,
          r.attempts,
          r.user_id = v_uid as is_me
        from public.rush_runs r
        join public.profiles p on p.id = r.user_id
        where r.puzzle_date = v_date
          and p.username is not null
          and r.found > 0
        order by r.found desc, r.attempts asc
        limit greatest(1, least(p_limit, 50))
      ) e
    ), '[]'::jsonb),

    'me', case when v_me.id is not null then jsonb_build_object(
      'found', v_me.found,
      'attempts', v_me.attempts,
      'rank', v_better + 1,
      -- Withheld until there are enough runs for a percentage to mean
      -- something; the screen shows the rank instead.
      'topPercent', case when v_total >= 20
                         then greatest(1, round(100.0 * (v_better + 1) / v_total))::int end
    ) end,

    'distribution', coalesce((
      select jsonb_agg(jsonb_build_object('found', d.found, 'players', d.players) order by d.found)
      from (
        select r.found, count(*) as players
        from public.rush_runs r
        join public.profiles p on p.id = r.user_id
        where r.puzzle_date = v_date and p.username is not null
        group by r.found
      ) d
    ), '[]'::jsonb)
  );
end;
$$;

revoke execute on function public.rush_leaderboard(integer) from public, anon;
grant execute on function public.rush_leaderboard(integer) to authenticated;

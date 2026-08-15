-- Rush needs a fact that does not depend on who else showed up.
--
-- "2nd of 5 today" is the same empty room the home screen already threw out.
-- With eighteen players a position is a statement about the size of the game
-- rather than about the run, and it reads worst exactly when someone has done
-- well. The screen holds the rank back until there are enough runs for it to
-- mean something - that is a client decision - but it then has nothing at all
-- to say, and a result screen that says nothing about your result is a waste
-- of the one moment the player is paying attention.
--
-- So: your own best. Rush is one run a day, which makes every run a direct
-- comparison with every run you have ever made, and that comparison works
-- identically at eighteen players and at ten thousand. Two additions:
--
--   best   the most you have ever found, before today. Null on a first run,
--          because there is nothing to compare against yet.
--   tied   how many other people finished on your exact score today. The line
--          explaining that guesses break ties is only worth printing when a
--          tie actually exists, and until now it printed always.
--
-- Everything else about the function is unchanged from 0084.

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
  v_best   integer;
  v_tied   integer := 0;
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

  -- Strictly before today, so today's run is measured against the record
  -- rather than becoming it and then tying with itself.
  select max(r.found) into v_best
  from public.rush_runs r
  where r.user_id = v_uid and r.puzzle_date < v_date;

  if v_me.id is not null then
    select count(*) into v_tied
    from public.rush_runs r
    join public.profiles p on p.id = r.user_id
    where r.puzzle_date = v_date and p.username is not null
      and r.user_id <> v_uid and r.found = v_me.found;
  end if;

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
                         then greatest(1, round(100.0 * (v_better + 1) / v_total))::int end,
      'best', v_best,
      'tied', v_tied
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

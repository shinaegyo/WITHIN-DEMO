-- Daily leaderboard.
--
-- The daily_leaderboard view can't do this job: it runs with the caller's
-- permissions, and games only grants "read own rows", so every player saw a
-- leaderboard containing exactly themselves. Loosening that policy would
-- expose other people's raw game rows, so instead a SECURITY DEFINER function
-- returns just the aggregate that's safe to publish.
--
-- Nothing here touches the answer, and only finished, won games are included.

create or replace function public.daily_leaderboard(p_limit integer default 50)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid  uuid := auth.uid();
  v_date date;
begin
  if v_uid is null then
    return jsonb_build_object('error', 'not_authenticated');
  end if;

  -- Rank against the day the caller is actually playing, so players in
  -- different timezones are compared on the same puzzle rather than the same
  -- wall clock.
  v_date := public.current_puzzle_date(v_uid);

  return jsonb_build_object(
    'puzzleDate', v_date,
    'entries', coalesce((
      select jsonb_agg(e order by e.rank)
      from (
        select
          rank() over (order by g.score desc, g.attempts_used asc, g.finished_at asc) as rank,
          -- Anonymous players have no username yet; a short stable handle keeps
          -- the board readable without exposing the account id.
          coalesce(p.username, 'Player ' || upper(right(g.user_id::text, 4))) as name,
          g.score,
          g.attempts_used as attempts,
          g.user_id = v_uid as is_me
        from public.games g
        join public.profiles p on p.id = g.user_id
        where g.puzzle_date = v_date and g.status = 'won'
        order by g.score desc, g.attempts_used asc, g.finished_at asc
        limit greatest(1, least(p_limit, 200))
      ) e
    ), '[]'::jsonb),
    'me', (
      select jsonb_build_object(
        'rank', r.rank, 'score', r.score, 'attempts', r.attempts, 'status', r.status
      )
      from (
        select
          rank() over (order by g.score desc, g.attempts_used asc, g.finished_at asc) as rank,
          g.score, g.attempts_used as attempts, g.status, g.user_id
        from public.games g
        where g.puzzle_date = v_date and g.status = 'won'
      ) r
      where r.user_id = v_uid
    ),
    'totalPlayers', (
      select count(*) from public.games
      where puzzle_date = v_date and status = 'won'
    )
  );
end;
$$;

revoke execute on function public.daily_leaderboard(integer) from public, anon;
grant execute on function public.daily_leaderboard(integer) to authenticated;

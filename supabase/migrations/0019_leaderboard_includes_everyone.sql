-- Put everyone who played on the leaderboard, not only those who finished.
--
-- The board listed complete days only, so a player knocked out in round one or
-- two vanished entirely — they had played, scored, and had nothing to show for
-- it. That also made the board useless as a measure of how many people turned
-- up, which is the thing worth watching during a test.
--
-- Days still in progress stay out. A score that climbs while somebody is
-- mid-round would reshuffle the board under everyone reading it, and it would
-- leak how far along a rival is.
--
-- Complete days rank above eliminated ones on equal points, since finishing all
-- three is the harder way to reach the same score.

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

  v_date := public.current_puzzle_date(v_uid);

  return jsonb_build_object(
    'puzzleDate', v_date,
    'entries', coalesce((
      select jsonb_agg(e order by e.rank)
      from (
        select
          rank() over (
            order by g.total_score desc,
                     (g.status = 'complete') desc,
                     g.finished_at asc
          ) as rank,
          coalesce(p.username, 'Player ' || upper(right(g.user_id::text, 4))) as name,
          g.total_score as score,
          g.user_id = v_uid as is_me,
          g.status = 'complete' as is_complete,
          -- How far they got, so an early exit reads as an exit rather than a
          -- bad score.
          (select count(*) from public.round_results r
            where r.game_id = g.id and r.status = 'won')::int as rounds_won
        from public.games g
        join public.profiles p on p.id = g.user_id
        where g.puzzle_date = v_date
          and g.status in ('complete', 'eliminated')
        order by g.total_score desc, (g.status = 'complete') desc, g.finished_at asc
        limit greatest(1, least(p_limit, 200))
      ) e
    ), '[]'::jsonb),
    'totalPlayers', (select count(*) from public.games
                     where puzzle_date = v_date
                       and status in ('complete', 'eliminated'))
  );
end;
$$;

revoke execute on function public.daily_leaderboard(integer) from public, anon;
grant execute on function public.daily_leaderboard(integer) to authenticated;

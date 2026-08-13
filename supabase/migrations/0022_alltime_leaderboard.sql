-- An all-time board to sit behind the daily one.
--
-- The home screen shows today, which everyone can win: a player who joined this
-- morning can top it by tonight. This board is the opposite, and that is the
-- point of having both. Cumulative points reward turning up for months, which
-- would be a discouraging thing to put in front of a newcomer on its own but is
-- worth having once someone is invested.
--
-- Days played is carried alongside the total, because a score means something
-- different after four days than after four hundred.
--
-- Ties break toward fewer days: the same points in less time is the better run.

create or replace function public.alltime_leaderboard(p_limit integer default 100)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    return jsonb_build_object('error', 'not_authenticated');
  end if;

  return jsonb_build_object(
    'entries', coalesce((
      select jsonb_agg(e order by e.rank)
      from (
        select
          rank() over (order by s.total_points desc, s.games_played asc) as rank,
          coalesce(p.username, 'Player ' || upper(right(s.user_id::text, 4))) as name,
          s.total_points as score,
          s.games_played as days_played,
          s.max_streak   as best_streak,
          s.user_id = v_uid as is_me
        from public.stats s
        join public.profiles p on p.id = s.user_id
        -- Signed-up accounts that have never played would otherwise pad the
        -- bottom of the board with zeros.
        where s.games_played > 0
        order by s.total_points desc, s.games_played asc
        limit greatest(1, least(p_limit, 200))
      ) e
    ), '[]'::jsonb),
    'totalPlayers', (select count(*) from public.stats where games_played > 0)
  );
end;
$$;

revoke execute on function public.alltime_leaderboard(integer) from public, anon;
grant execute on function public.alltime_leaderboard(integer) to authenticated;

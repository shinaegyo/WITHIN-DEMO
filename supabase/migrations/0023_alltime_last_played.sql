-- Carry when each player was last seen, not how many days they have played.
--
-- A day count only moves once every twenty-four hours, so the board looked
-- frozen. Recency makes it read as something people are doing rather than a
-- record of something they did, and it is the number that tells you whether the
-- person above you is still playing or has drifted off.
--
-- Taken from the last guess rather than the last finished day, so somebody
-- part-way through today counts as active now instead of showing yesterday.
--
-- The subquery runs per row and touches guesses. Fine at a hundred rows; if the
-- board ever gets slow, an index on guesses(game_id) or a last_seen column on
-- stats is the way out.

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
          s.user_id = v_uid as is_me,
          (select max(gu.created_at)
             from public.guesses gu
             join public.games g2 on g2.id = gu.game_id
            where g2.user_id = s.user_id) as last_played_at
        from public.stats s
        join public.profiles p on p.id = s.user_id
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

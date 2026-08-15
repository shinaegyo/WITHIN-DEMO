-- Back to the total, because the rate emptied the board.
--
-- 0106 ranked average points a day with ten days to qualify, and the reasoning
-- still holds - a cumulative board ranks tenure and cannot be climbed by
-- anybody who starts late. But it shipped to a game where nobody has ten days
-- yet, so every player fell below the qualifier at once and the board read
-- "Nobody is on this board yet". A leaderboard that hides everybody is worse
-- than one that ranks the wrong thing.
--
-- So: the total again, everybody included, no minimum. What is kept from 0106
-- is the part that was not the problem - a strict order, and your own standing
-- returned whether or not you are in the top rows.
--
-- The climbing problem is real and is still unsolved. It is not urgent at this
-- size: with eighteen players and a few weeks of history, nobody is looking at
-- an unreachable total yet. It becomes urgent before launch, and the shape of
-- the answer is in docs/daily-leaderboard.md.

create or replace function public.alltime_leaderboard(p_limit integer default 50)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid    uuid := auth.uid();
  v_holder uuid;
  v_min    integer := public.alltime_minimum_days();
  v_out    jsonb;
begin
  if v_uid is null then
    return jsonb_build_object('error', 'not_authenticated');
  end if;

  v_holder := public.belt_holder();

  with qualified as (
    select
      s.user_id,
      s.total_points,
      s.games_played,
      s.max_streak,
      round(s.total_points::numeric / greatest(1, s.games_played))::int as per_day
    from public.stats s
    where s.games_played > 0
  ),
  ranked as (
    select q.*,
           row_number() over (
             order by q.total_points desc, q.games_played asc, q.per_day desc, q.user_id
           ) as rank
    from qualified q
  ),
  mine as (select * from ranked where user_id = v_uid),
  totals as (select count(*)::int as n from qualified)
  select jsonb_build_object(
    'entries', coalesce((
      select jsonb_agg(e order by e.rank)
      from (
        select r.rank,
               coalesce(p.username, 'Player ' || upper(right(r.user_id::text, 4))) as name,
               p.avatar,
               r.total_points as score,
               r.per_day,
               r.games_played as days_played,
               r.max_streak as best_streak,
               r.user_id = v_uid as is_me,
               r.user_id = v_holder as has_belt,
               (select max(gu.created_at)
                  from public.guesses gu
                  join public.games g2 on g2.id = gu.game_id
                 where g2.user_id = r.user_id) as last_played_at
        from ranked r
        join public.profiles p on p.id = r.user_id
        where r.rank <= greatest(1, least(p_limit, 200))
      ) e
    ), '[]'::jsonb),

    'me', (
      select jsonb_build_object(
        'perDay', m.per_day,
        'totalPoints', m.total_points,
        'daysPlayed', m.games_played,
        'rank', m.rank,
        'topPercent', case when (select n from totals) >= 20
                           then greatest(1, round(100.0 * m.rank / (select n from totals)))::int end
      ) from mine m
    ),

    -- Anybody short of the minimum still needs to know where they stand, and
    -- "four more days" is a better answer than an empty space where their row
    -- would be.
    'pending', null::jsonb,

    'minimumDays', 0,
    'beltHolder', (select username from public.profiles where id = v_holder),
    'totalPlayers', (select n from totals)
  ) into v_out;

  return v_out;
end;
$$;

revoke execute on function public.alltime_leaderboard(integer) from public, anon;
grant execute on function public.alltime_leaderboard(integer) to authenticated;
revoke execute on function public.alltime_minimum_days() from public, anon;
grant execute on function public.alltime_minimum_days() to authenticated;

-- All time ranks how well you play, not when you arrived.
--
-- A cumulative board cannot be climbed. Somebody a year in has 300 days at 200
-- a day: 60,000. A better player joining today, averaging 250, gains 50 a day
-- on that - 1,200 days, three and a quarter years, to pass them, while playing
-- better every single day and never missing one. An equally good player never
-- passes them at all, because the gap is frozen. And nobody can play harder to
-- fix it: the daily is capped at 300 a day for everyone alike.
--
-- So the board does not rank skill or effort. It ranks tenure. On launch day
-- that is invisible; by month three the newest players do the arithmetic, see
-- the top is unreachable, and stop having a reason to play.
--
-- Ranking the rate fixes it. Average points per day, with ten days to qualify,
-- and a better player passes a veteran in a fortnight because the question is
-- "how well do you play" rather than "when did you start".
--
-- Nobody loses their total. It stays on the profile and in the player card as
-- a personal record - the people at the top of the old board keep the number
-- they earned, it just stops being a ladder nobody else can climb.
--
-- The keys after the average, in order: more days at the same average is the
-- harder thing to sustain, then the bigger total, then row_number, which
-- numbers from one whatever happens. No two players share a place.
--
-- What is gone is player_level as the first tiebreak. XP is mostly earned from
-- points, so it restated the number already sorted on - and where it did not,
-- it was worse: it let somebody who grinds Rush outrank somebody who played
-- the daily better, on a board about the daily.

/** Ten days before a rate means anything. Three good mornings is not a record. */
create or replace function public.alltime_minimum_days()
returns integer language sql immutable as $$ select 10 $$;

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
    where s.games_played >= v_min
  ),
  ranked as (
    select q.*,
           row_number() over (
             order by q.per_day desc, q.games_played desc, q.total_points desc, q.user_id
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
               r.per_day as score,
               r.total_points,
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
    'pending', (
      select case when s.games_played < v_min
                  then jsonb_build_object(
                    'daysPlayed', s.games_played,
                    'daysNeeded', v_min - s.games_played,
                    'perDay', round(s.total_points::numeric / greatest(1, s.games_played))::int
                  ) end
      from public.stats s where s.user_id = v_uid
    ),

    'minimumDays', v_min,
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

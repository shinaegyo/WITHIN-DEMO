-- Level breaks a tie, and then the day itself does.
--
-- Every board ranked on one number and stopped, so players level on points
-- shared a rank and were ordered by name underneath - which is alphabetical
-- luck presented as a standing. Player level breaks the tie first: it is the
-- one figure that covers everything somebody has played.
--
-- After that the tiebreak has to measure the thing being ranked, not more
-- history. On today's board that is the day: 210 points in twelve guesses is a
-- better day than 210 in seventeen, and whoever got there first settles the
-- rest. All time asks for fewer days to the same total. Impossible asks who
-- reached the depth first.
--
-- The tiebreakers sit inside rank() as well as in the ordering, so a rank is
-- only shared when players are genuinely level on all of it.

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
      select jsonb_agg(e order by e.rank, e.name)
      from (
        select
          rank() over (
            order by g.total_score desc,
                     public.player_level(p.xp) desc,
                     (select coalesce(sum(r.attempts_used), 0) from public.round_results r
                       where r.game_id = g.id) asc,
                     g.finished_at asc
          ) as rank,
          coalesce(p.username, 'Player ' || upper(right(g.user_id::text, 4))) as name,
          p.avatar,
          g.total_score as score,
          g.user_id = v_uid as is_me,
          g.status = 'complete' as is_complete,
          (select count(*) from public.round_results r
            where r.game_id = g.id and r.status = 'won')::int as rounds_won
        from public.games g
        join public.profiles p on p.id = g.user_id
        where g.puzzle_date = v_date
          and g.status in ('complete', 'eliminated')
        order by g.total_score desc,
                 public.player_level(p.xp) desc,
                 (select coalesce(sum(r.attempts_used), 0) from public.round_results r
                   where r.game_id = g.id) asc,
                 g.finished_at asc
        limit greatest(1, least(p_limit, 200))
      ) e
    ), '[]'::jsonb),
    'totalPlayers', (select count(*) from public.games
                     where puzzle_date = v_date
                       and status in ('complete', 'eliminated')),
    'stillPlaying', (select count(*) from public.games g
                     where g.puzzle_date = v_date
                       and g.status = 'playing'
                       and exists (select 1 from public.guesses gu where gu.game_id = g.id))
  );
end;
$$;

create or replace function public.alltime_leaderboard(p_limit integer default 50)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid    uuid := auth.uid();
  v_holder uuid;
begin
  if v_uid is null then
    return jsonb_build_object('error', 'not_authenticated');
  end if;

  v_holder := public.belt_holder();

  return jsonb_build_object(
    'entries', coalesce((
      select jsonb_agg(e order by e.rank, e.name)
      from (
        select
          rank() over (
            order by s.total_points desc,
                     public.player_level(p.xp) desc,
                     s.games_played asc
          ) as rank,
          coalesce(p.username, 'Player ' || upper(right(s.user_id::text, 4))) as name,
          p.avatar,
          s.total_points as score,
          s.games_played as days_played,
          s.max_streak   as best_streak,
          s.user_id = v_uid as is_me,
          s.user_id = v_holder as has_belt,
          (select max(gu.created_at)
             from public.guesses gu
             join public.games g2 on g2.id = gu.game_id
            where g2.user_id = s.user_id) as last_played_at
        from public.stats s
        join public.profiles p on p.id = s.user_id
        where s.games_played > 0
        order by s.total_points desc,
                 public.player_level(p.xp) desc,
                 s.games_played asc
        limit greatest(1, least(p_limit, 200))
      ) e
    ), '[]'::jsonb),
    'beltHolder', (select username from public.profiles where id = v_holder),
    'totalPlayers', (select count(*) from public.stats where games_played > 0)
  );
end;
$$;

create or replace function public.endless_leaderboard(p_limit integer default 50)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid  uuid := auth.uid();
  v_week date;
begin
  if v_uid is null then
    return jsonb_build_object('error', 'not_authenticated');
  end if;

  v_week := public.endless_week(v_uid);

  return jsonb_build_object(
    'week', v_week,
    'entries', coalesce((
      select jsonb_agg(e order by e.rank, e.name)
      from (
        select
          rank() over (
            order by max(r.best_level - 1) desc,
                     public.player_level(max(p.xp)) desc,
                     min(r.started_at) asc
          ) as rank,
          p.username as name,
          p.avatar,
          max(r.best_level - 1) as depth,
          r.user_id = v_uid as is_me
        from public.endless_runs r
        join public.profiles p on p.id = r.user_id
        where r.week_start = v_week
          and p.username is not null
        group by r.user_id, p.username, p.avatar
        having max(r.best_level - 1) > 0
        order by max(r.best_level - 1) desc,
                 public.player_level(max(p.xp)) desc,
                 min(r.started_at) asc
        limit greatest(1, least(p_limit, 200))
      ) e
    ), '[]'::jsonb)
  );
end;
$$;

-- player_level is called from these, so the boards need to reach it.
grant execute on function public.player_level(integer) to authenticated;

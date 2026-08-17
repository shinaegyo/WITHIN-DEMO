-- The boards never read the totals they were supposed to.
--
-- 0121 rebased stats.total_points on an epoch so the all-time number would
-- start again, and the profile duly reads zero. The board does not: 0109's
-- alltime_leaderboard sums public.games directly and has never looked at the
-- stats table, so it went on reporting seven hundred points next to a profile
-- claiming none.
--
-- Two places, one rule. Both boards now count from the epoch, and August's
-- season takes the later of its own start and the epoch - from September the
-- month is always later and the clause does nothing, which is how it should
-- decay.
--
-- Worth being plain about the cost: today's games are on the wrong side of the
-- line. Everything played before the 17th keeps its score in the games table
-- and in a player's own history, and counts toward nothing on any board.

/** 0109's, counting from the epoch. */
create or replace function public.alltime_leaderboard(p_limit integer default 50, p_friends boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid    uuid := auth.uid();
  v_holder uuid;
  v_out    jsonb;
begin
  if v_uid is null then
    return jsonb_build_object('error', 'not_authenticated');
  end if;

  v_holder := public.belt_holder();

  with lifetime as (
    select
      g.user_id,
      sum(g.total_score)::int as points,
      count(*)::int as days,
      max(g.finished_at) as last_at,
      sum(coalesce((
        select sum(abs(gu.guess - s.answer))
        from public.guesses gu
        join public.round_results rr on rr.game_id = g.id and rr.round = gu.round
        join public.puzzle_round_secrets s
             on s.puzzle_date = g.puzzle_date and s.round = rr.source_round
        where gu.game_id = g.id
      ), 0))::bigint as distance,
      sum((select count(*) from public.guesses gu where gu.game_id = g.id))::bigint as guesses
    from public.games g
    where g.status in ('complete', 'eliminated')
      -- Since the points began. Games before the epoch keep their scores and
      -- their place in a player's history; they simply do not count here.
      and g.puzzle_date >= public.points_epoch()
      and (not p_friends or exists (
        select 1 from public.my_circle(v_uid) c where c.user_id = g.user_id))
    group by g.user_id
  ),
  scored as (
    select l.*,
           case when l.guesses > 0
                then round(l.distance::numeric / l.guesses)::int else 0 end as avg_off
    from lifetime l
  ),
  ranked as (
    select s.*,
           row_number() over (
             order by s.points desc, s.avg_off asc, s.last_at asc
           ) as rank
    from scored s
  ),
  mine as (select * from ranked where user_id = v_uid),
  field as (select count(*)::int as n from scored)
  select jsonb_build_object(
    'entries', coalesce((
      select jsonb_agg(e order by e.rank)
      from (
        select r.rank,
               coalesce(p.username, 'Player ' || upper(right(r.user_id::text, 4))) as name,
               p.avatar,
               r.points as score,
               r.avg_off,
               r.days as days_played,
               r.user_id = v_uid as is_me,
               r.user_id = v_holder as has_belt
        from ranked r
        join public.profiles p on p.id = r.user_id
        where r.rank <= greatest(1, least(p_limit, 200))
      ) e
    ), '[]'::jsonb),
    'me', (
      select jsonb_build_object(
        'score', m.points,
        'avgOff', m.avg_off,
        'daysPlayed', m.days,
        'rank', m.rank,
        'topPercent', case when (select n from field) >= 20
                           then greatest(1, round(100.0 * m.rank / (select n from field)))::int end
      ) from mine m
    ),
    'beltHolder', (select username from public.profiles where id = v_holder),
    'totalPlayers', (select n from field)
  ) into v_out;

  return v_out;
end;
$$;

/** 0109's, with August starting no earlier than the epoch. */
create or replace function public.season_leaderboard(p_limit integer default 10, p_friends boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid    uuid := auth.uid();
  v_season date;
  v_ends   date;
  v_out    jsonb;
begin
  if v_uid is null then
    return jsonb_build_object('error', 'not_authenticated');
  end if;

  v_season := public.current_season(v_uid);
  v_ends   := (v_season + interval '1 month')::date;

  with played as (
    select
      g.user_id,
      g.total_score,
      g.finished_at,
      coalesce((
        select sum(abs(gu.guess - s.answer))
        from public.guesses gu
        join public.round_results rr on rr.game_id = g.id and rr.round = gu.round
        join public.puzzle_round_secrets s
             on s.puzzle_date = g.puzzle_date and s.round = rr.source_round
        where gu.game_id = g.id
      ), 0)::int as distance,
      (select count(*) from public.guesses gu where gu.game_id = g.id)::int as guesses
    from public.games g
    where g.puzzle_date >= greatest(v_season, public.points_epoch())
      and g.puzzle_date < v_ends
      and g.status in ('complete', 'eliminated')
      and (not p_friends or exists (
        select 1 from public.my_circle(v_uid) c where c.user_id = g.user_id))
  ),
  totals as (
    select
      user_id,
      sum(total_score)::int as points,
      count(*)::int         as days,
      max(finished_at)      as last_at,
      case when sum(guesses) > 0
           then round(sum(distance)::numeric / sum(guesses))::int else 0 end as avg_off
    from played
    group by user_id
  ),
  ranked as (
    select t.*,
           row_number() over (
             order by t.points desc, t.avg_off asc, t.days asc, t.last_at asc
           ) as rank
    from totals t
  ),
  mine as (select * from ranked where user_id = v_uid),
  field as (select count(*)::int as n from totals)
  select jsonb_build_object(
    'season', v_season,
    'endsOn', v_ends,
    'entries', coalesce((
      select jsonb_agg(e order by e.rank)
      from (
        select r.rank,
               coalesce(p.username, 'Player ' || upper(right(r.user_id::text, 4))) as name,
               p.avatar,
               r.points as score,
               r.avg_off,
               r.days,
               r.user_id = v_uid as is_me
        from ranked r
        join public.profiles p on p.id = r.user_id
        where r.rank <= greatest(1, least(p_limit, 200))
      ) e
    ), '[]'::jsonb),
    'me', (
      select jsonb_build_object(
        'score', m.points,
        'avgOff', m.avg_off,
        'days', m.days,
        'rank', m.rank,
        'topPercent', case when (select n from field) >= 20
                           then greatest(1, round(100.0 * m.rank / (select n from field)))::int end
      ) from mine m
    ),
    'totalPlayers', (select n from field)
  ) into v_out;

  return v_out;
end;
$$;

revoke execute on function public.alltime_leaderboard(integer, boolean) from public, anon;
revoke execute on function public.season_leaderboard(integer, boolean)  from public, anon;
grant execute on function public.alltime_leaderboard(integer, boolean) to authenticated;
grant execute on function public.season_leaderboard(integer, boolean)  to authenticated;

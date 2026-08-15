-- Seasons, so somebody who joins in month six can win month seven.
--
-- A cumulative board cannot be climbed: the leader's total only grows, nobody
-- can play harder than a 300-a-day cap, and an equally good player who starts
-- later never closes the gap at all. The fix is to bound how much history
-- counts. A calendar month bounds it, and it resets for everybody at once.
--
-- Calendar months rather than fixed 28-day blocks. February against March is
-- uneven and a winning total will differ between them - but everybody plays
-- the same month, "January's board" is a thing a person can say, and Impossible
-- already resets weekly, so the game keeps one idea about time instead of two.
--
-- The month is the player's own. Somebody in Auckland and somebody in Los
-- Angeles change months at different instants, and current_puzzle_date already
-- decides what day it is for each of them.

create or replace function public.current_season(p_uid uuid)
returns date
language sql
stable
as $$
  select date_trunc('month', public.current_puzzle_date(p_uid))::date;
$$;

revoke execute on function public.current_season(uuid) from public, anon;
grant execute on function public.current_season(uuid) to authenticated;

/**
 * The month's board.
 *
 * Ranked the way every other board is ranked - points, then avg off - so one
 * rule holds at every timescale and the explanation on the screen covers all
 * of them. The whole month is scored in a single pass rather than a function
 * call per row: at ten thousand players that difference is a screen that loads
 * and a screen that times out.
 */
create or replace function public.season_leaderboard(p_limit integer default 10)
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
    where g.puzzle_date >= v_season
      and g.puzzle_date < v_ends
      and g.status in ('complete', 'eliminated')
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

revoke execute on function public.season_leaderboard(integer) from public, anon;
grant execute on function public.season_leaderboard(integer) to authenticated;

-- And all time stops punishing people for playing.
--
-- It ranked total points and then broke ties on fewer days played, which are
-- two rules pointing opposite ways: the metric says more is better and the
-- tiebreak says less is. A player doing exactly what the board asks was
-- demoted for it.
--
-- It breaks on avg off now, like every other board here. Playing more days
-- never costs you anything, and the same sentence explains the second column
-- on all three.

create or replace function public.alltime_leaderboard(p_limit integer default 50)
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

revoke execute on function public.alltime_leaderboard(integer) from public, anon;
grant execute on function public.alltime_leaderboard(integer) to authenticated;

-- The season puts you in a league.
--
-- A rank of #7 says nothing on a board of thirty and nothing at all to somebody
-- who has never seen the board. A league is a thing you are rather than a place
-- you came, it survives a bad day, and it gives the month a shape that a
-- running total does not.
--
--   Bronze    0-199      under a week of playing
--   Silver    200-399    about one week in three
--   Gold      400-599    half the month
--   Platinum  600-799    most of it
--   Diamond   800-999    nearly every day
--   Legend    1000+      every day, played well
--
-- Legend is the only one with a second condition: a thousand points AND forty a
-- day. Every band below it can be reached by turning up, because a daily game
-- should reward turning up - but the top of the ladder should not be a prize
-- for attendance. Forty a day is a real bar: a typical day is around thirty
-- two, and forty means calls that come off and ranges that hold.
--
-- Deliberately not a rating. Clash Royale trophies go down when you lose, which
-- is what makes a trophy count mean something; a monthly sum only goes up. The
-- honest reading of a league here is "how much good play you did this month",
-- and the month resetting is what keeps that from calcifying.

begin;

/**
 * The league a season's play earns.
 *
 * Days are passed in rather than derived so the gate can ask about the rate as
 * well as the total - a hundred points a day for ten days is a different month
 * from thirty a day for thirty, and only one of them is Legend.
 */
create or replace function public.season_league(p_points integer, p_days integer)
returns text
language sql
immutable
as $$
  select case
    when p_points >= 1000
     and p_days > 0
     and p_points::numeric / p_days >= 40 then 'Legend'
    when p_points >= 800 then 'Diamond'
    when p_points >= 600 then 'Platinum'
    when p_points >= 400 then 'Gold'
    when p_points >= 200 then 'Silver'
    else 'Bronze'
  end;
$$;

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
      sum(guesses)::int     as guesses,
      max(finished_at)      as last_at,
      case when sum(guesses) > 0
           then round(sum(distance)::numeric / sum(guesses))::int else 0 end as avg_off
    from played
    group by user_id
  ),
  ranked as (
    select t.*,
           -- The same order the daily board uses since 0131: points, then how
           -- little searching it took, then how near the guesses landed.
           row_number() over (
             order by t.points desc, t.guesses asc, t.avg_off asc, t.last_at asc
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
               public.season_league(r.points, r.days) as league,
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
        'league', public.season_league(m.points, m.days),
        'topPercent', case when (select n from field) >= 20
                           then greatest(1, round(100.0 * m.rank / (select n from field)))::int end
      ) from mine m
    ),
    'totalPlayers', (select n from field)
  ) into v_out;

  return v_out;
end;
$$;

grant execute on function public.season_league(integer, integer) to authenticated;
grant execute on function public.season_leaderboard(integer, boolean) to authenticated;

commit;

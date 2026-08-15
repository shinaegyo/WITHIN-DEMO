-- What a season leaves behind.
--
-- A season that vanishes on the 1st is a strange thing to have competed in.
-- The countdown gives the last week its urgency; this is what makes the
-- finish worth anything afterwards.
--
-- Computed rather than recorded. A results table would need something to write
-- it at the exact moment a month turns over, in every timezone the game has
-- players in - a job that has to run, can fail, and would have to be backfilled
-- for the months that have already happened. The games are already there and
-- they do not change once a day is over, so the finish is derivable forever and
-- there is nothing to keep in step.
--
-- Every month is ranked in one pass, partitioned rather than looped, and only
-- then filtered to yours. Ranking your own months alone would rank you against
-- nobody.

create or replace function public.season_history(p_limit integer default 12)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_now date;
  v_out jsonb;
begin
  if v_uid is null then
    return jsonb_build_object('error', 'not_authenticated');
  end if;

  v_now := public.current_season(v_uid);

  with scored as (
    select
      date_trunc('month', g.puzzle_date)::date as season,
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
    group by 1, 2
  ),
  averaged as (
    select sc.*,
           case when sc.guesses > 0
                then round(sc.distance::numeric / sc.guesses)::int else 0 end as avg_off
    from scored sc
  ),
  ranked as (
    select a.*,
           row_number() over (
             partition by a.season
             order by a.points desc, a.avg_off asc, a.last_at asc
           ) as rank,
           count(*) over (partition by a.season) as players
    from averaged a
  ),
  mine as (
    -- Finished months only. The season in progress has its own board and is
    -- not a result yet.
    select * from ranked
    where user_id = v_uid and season < v_now
    order by season desc
    limit greatest(1, least(p_limit, 60))
  )
  select jsonb_build_object(
    'seasons', coalesce((
      select jsonb_agg(jsonb_build_object(
        'season', m.season,
        'rank', m.rank,
        'players', m.players,
        'points', m.points,
        'days', m.days,
        'avgOff', m.avg_off
      ) order by m.season desc)
      from mine m
    ), '[]'::jsonb),
    -- The line worth putting on a profile: the best you have ever finished,
    -- and which month it was.
    'best', (
      select jsonb_build_object(
        'season', b.season,
        'rank', b.rank,
        'players', b.players,
        'points', b.points
      )
      from mine b
      order by b.rank asc, b.season desc
      limit 1
    ),
    'seasonsPlayed', (select count(*) from mine)
  ) into v_out;

  return v_out;
end;
$$;

revoke execute on function public.season_history(integer) from public, anon;
grant execute on function public.season_history(integer) to authenticated;

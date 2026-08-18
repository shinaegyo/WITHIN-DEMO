-- The roster stops asking for a parameter it does not have.
--
-- 0155 lifted the season window out of season_leaderboard verbatim, and the
-- copy brought a reference to p_friends with it - that function takes a friends
-- flag and this one does not. plpgsql does not check a function body until it
-- runs, so the migration applied without complaint and then every single call
-- came back with: column "p_friends" does not exist. The ladder opened, the
-- roster was empty, and nothing said why.
--
-- Dropped rather than replaced with a parameter of its own. A league is
-- everyone standing in it; a friends-only view of one is a different feature
-- and not this one.

begin;

create or replace function public.league_board(p_league text, p_limit integer default 100)
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
  if p_league is null or p_league not in ('Bronze','Silver','Gold','Platinum','Diamond','Legend') then
    return jsonb_build_object('error', 'unknown_league');
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
      -- No friends filter. 0155 lifted this block out of season_leaderboard
      -- with its p_friends test still in it, naming a parameter this function
      -- does not have - and a plpgsql body is not checked until it runs, so
      -- the migration applied cleanly and every call failed. A league is
      -- everyone in it; there is nothing to filter.
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
  inleague as (
    -- season_league takes both points and days, because Legend is a rate as
    -- well as a total. Asking the same function the board asks is the only way
    -- a roster cannot disagree with the badge on the row that opened it.
    select t.*
    from totals t
    where public.season_league(t.points, t.days) = p_league
  ),
  ranked as (
    select i.*,
           -- Placed within the league, not the season. Somebody looking at
           -- Bronze wants to know where they stand in Bronze; the season rank
           -- is already on the board they came from.
           row_number() over (
             order by i.points desc, i.guesses asc, i.avg_off asc, i.last_at asc
           ) as rank
    from inleague i
  )
  select jsonb_build_object(
    'league', p_league,
    'season', v_season,
    'total', (select count(*) from ranked),
    'entries', coalesce((
      select jsonb_agg(e order by e.rank)
      from (
        select r.rank,
               coalesce(p.username, 'Player ' || upper(right(r.user_id::text, 4))) as name,
               p.avatar,
               r.points as score,
               r.days,
               r.user_id = v_uid as is_me
        from ranked r
        join public.profiles p on p.id = r.user_id
        where r.rank <= greatest(coalesce(p_limit, 100), 1)
      ) e
    ), '[]'::jsonb)
  ) into v_out;

  return v_out;
end;
$$;

revoke execute on function public.league_board(text, integer) from public, anon;
grant  execute on function public.league_board(text, integer) to authenticated;

commit;

-- Should list Bronze, ranked within Bronze, with a total.
select public.league_board('Bronze') -> 'total' as total,
       jsonb_array_length(public.league_board('Bronze') -> 'entries') as rows;

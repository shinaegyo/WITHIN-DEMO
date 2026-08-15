-- Everyone, or the people you actually know.
--
-- "Top 12% of ten thousand" is a true fact about a stranger's morning. "2nd of
-- six, and Sarah passed you yesterday" is a reason to open the app tomorrow.
-- The friends board is the one that works at both ends of the game's life: it
-- is meaningful on day one with four friends, where a global board is an empty
-- room, and it stays meaningful at ten thousand, where a global board is a
-- number nobody can hold.
--
-- Filtered in the query rather than in the client, because the boards return a
-- podium. Filtering ten rows down to the friends in them yields an empty screen
-- almost every time - the field has to be narrowed before anybody is ranked, so
-- that being second among friends is second and not "not in the top ten".
--
-- One flag on all three boards. The window changes, the question does not.

/**
 * You, plus everybody who has accepted you or whom you have accepted.
 *
 * You are in it deliberately: a board of your friends that leaves you out is a
 * board you cannot find yourself on, and every ranking here is about where you
 * sit among them.
 */
create or replace function public.my_circle(p_uid uuid)
returns table (user_id uuid)
language sql
stable
as $$
  select p_uid
  union
  select case when f.requester_id = p_uid then f.addressee_id else f.requester_id end
  from public.friendships f
  where f.status = 'accepted'
    and p_uid in (f.requester_id, f.addressee_id);
$$;

revoke execute on function public.my_circle(uuid) from public, anon;
grant execute on function public.my_circle(uuid) to authenticated;

create or replace function public.daily_leaderboard(p_limit integer default 10, p_friends boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid  uuid := auth.uid();
  v_date date;
  v_out  jsonb;
begin
  if v_uid is null then
    return jsonb_build_object('error', 'not_authenticated');
  end if;

  v_date := public.current_puzzle_date(v_uid);

  with day as (
    select
      g.id, g.user_id, g.total_score, g.finished_at, g.status,
      coalesce((
        select sum(abs(gu.guess - s.answer))
        from public.guesses gu
        join public.round_results rr on rr.game_id = g.id and rr.round = gu.round
        join public.puzzle_round_secrets s
             on s.puzzle_date = g.puzzle_date and s.round = rr.source_round
        where gu.game_id = g.id
      ), 0)::int as distance,
      coalesce((
        select sum(extract(epoch from (r.last_at - r.first_at)))
        from (
          select gu.round, min(gu.created_at) as first_at, max(gu.created_at) as last_at
          from public.guesses gu where gu.game_id = g.id group by gu.round
        ) r
      ), 0)::int as seconds,
      (select count(*) from public.guesses gu where gu.game_id = g.id)::int as guess_count
    from public.games g
    where g.puzzle_date = v_date and g.status in ('complete', 'eliminated')
      and (not p_friends or exists (
        select 1 from public.my_circle(v_uid) c where c.user_id = g.user_id))
  ),
  averaged as (
    select d.*,
           case when d.guess_count > 0
                then round(d.distance::numeric / d.guess_count)::int else 0 end as avg_off
    from day d
  ),
  ranked as (
    select a.*,
           row_number() over (
             order by a.total_score desc, a.avg_off asc, a.seconds asc, a.finished_at asc
           ) as rank
    from averaged a
  ),
  mine as (select * from ranked where user_id = v_uid),
  totals as (select count(*)::int as n from day)
  select jsonb_build_object(
    'puzzleDate', v_date,

    -- The podium. Ten rows, strictly ordered, because being seventh of ten
    -- thousand is worth stating precisely - and ten is small enough that a
    -- list is the right shape for it.
    'entries', coalesce((
      select jsonb_agg(e order by e.rank)
      from (
        select r.rank,
               coalesce(p.username, 'Player ' || upper(right(r.user_id::text, 4))) as name,
               p.avatar,
               r.total_score as score,
               r.distance,
               r.avg_off,
               r.user_id = v_uid as is_me,
               r.status = 'complete' as is_complete,
               (select count(*) from public.round_results rr
                 where rr.game_id = r.id and rr.status = 'won')::int as rounds_won
        from ranked r
        join public.profiles p on p.id = r.user_id
        where r.rank <= greatest(1, least(p_limit, 50))
      ) e
    ), '[]'::jsonb),

    'me', (
      select jsonb_build_object(
        'score', m.total_score,
        'distance', m.distance,
        'avgOff', m.avg_off,
        'guesses', m.guess_count,
        'rank', m.rank,
        -- Withheld until a percentage means something. Under twenty players the
        -- screen shows the position instead, the same rule Rush uses.
        'topPercent', case when (select n from totals) >= 20
                           then greatest(1, round(100.0 * m.rank / (select n from totals)))::int end,
        -- Including you, so it reads as "1,412 players on 280" rather than as a
        -- count of rivals.
        'playersOnScore', (select count(*) from day d2 where d2.total_score = m.total_score)
      ) from mine m
    ),

    -- The shape of the day. Nobody is ranked in it, so it survives any number
    -- of people sharing a score - which is the whole problem this board has.
    'distribution', coalesce((
      select jsonb_agg(jsonb_build_object('score', d.score, 'players', d.players) order by d.score)
      from (
        select total_score as score, count(*) as players from day group by total_score
      ) d
    ), '[]'::jsonb),

    'totalPlayers', (select n from totals),
    'stillPlaying', (select count(*) from public.games g
                     where g.puzzle_date = v_date
                       and g.status = 'playing'
                       and exists (select 1 from public.guesses gu where gu.game_id = g.id))
  ) into v_out;

  return v_out;
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
    where g.puzzle_date >= v_season
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


revoke execute on function public.daily_leaderboard(integer, boolean)   from public, anon;
revoke execute on function public.season_leaderboard(integer, boolean)  from public, anon;
revoke execute on function public.alltime_leaderboard(integer, boolean) from public, anon;
grant execute on function public.daily_leaderboard(integer, boolean)    to authenticated;
grant execute on function public.season_leaderboard(integer, boolean)   to authenticated;
grant execute on function public.alltime_leaderboard(integer, boolean)  to authenticated;

-- The old single-argument versions would otherwise sit alongside these and be
-- chosen for any call that omits the flag, which is every call the app makes
-- until its next deploy reaches a phone.
drop function if exists public.daily_leaderboard(integer);
drop function if exists public.season_leaderboard(integer);
drop function if exists public.alltime_leaderboard(integer);

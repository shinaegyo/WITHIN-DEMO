-- One board, three windows onto it, and one way to look anywhere in it.
--
-- Scrolling, jump-to-me and search are the same mechanism: load a window of
-- ranks around a target. Scrolling targets a position, find-me targets you,
-- search targets whoever was typed. So there is one function and three ways in,
-- rather than three functions that each nearly do the others' job.
--
-- It also folds the three boards into one query. today, season and all time
-- differ only in which dates count, so they are a date range and nothing else -
-- there were three copies of the same scoring logic and this would have been a
-- fourth.
--
-- The rank is computed over the whole field and only then sliced. Ranking a
-- page numbers every page from one, which is the classic version of this bug
-- and looks entirely correct until somebody scrolls.

/** The dates a board covers. All time is every date there has ever been. */
create or replace function public.board_range(p_board text, p_uid uuid)
returns table (lo date, hi date)
language sql
stable
as $$
  select
    case p_board
      when 'today'  then public.current_puzzle_date(p_uid)
      when 'season' then public.current_season(p_uid)
      else '1970-01-01'::date
    end,
    case p_board
      when 'today'  then public.current_puzzle_date(p_uid)
      when 'season' then (public.current_season(p_uid) + interval '1 month' - interval '1 day')::date
      else '9999-12-31'::date
    end;
$$;

/**
 * Every player on a board, scored and ranked.
 *
 * Kept as its own function so the window, the search and the boards themselves
 * all rank identically - a search that disagreed with the list it jumps into
 * would be worse than no search.
 */
create or replace function public.board_standings(
  p_board   text,
  p_friends boolean,
  p_uid     uuid
)
returns table (
  user_id uuid,
  points  integer,
  avg_off integer,
  days    integer,
  rank    bigint
)
language sql
stable
as $$
  with bounds as (select * from public.board_range(p_board, p_uid)),
  played as (
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
      ), 0)::bigint as distance,
      (select count(*) from public.guesses gu where gu.game_id = g.id)::bigint as guesses,
      coalesce((
        select sum(extract(epoch from (r.last_at - r.first_at)))
        from (
          select gu.round, min(gu.created_at) as first_at, max(gu.created_at) as last_at
          from public.guesses gu where gu.game_id = g.id group by gu.round
        ) r
      ), 0)::int as seconds
    from public.games g, bounds b
    where g.puzzle_date between b.lo and b.hi
      and g.status in ('complete', 'eliminated')
      and (not p_friends or exists (
        select 1 from public.my_circle(p_uid) c where c.user_id = g.user_id))
  ),
  totals as (
    select
      p.user_id,
      sum(p.total_score)::int as points,
      count(*)::int           as days,
      sum(p.seconds)::int     as seconds,
      max(p.finished_at)      as last_at,
      case when sum(p.guesses) > 0
           then round(sum(p.distance)::numeric / sum(p.guesses))::int else 0 end as avg_off
    from played p
    group by p.user_id
  )
  select
    t.user_id,
    t.points,
    t.avg_off,
    t.days,
    row_number() over (
      order by t.points desc, t.avg_off asc, t.seconds asc, t.last_at asc
    )
  from totals t;
$$;

/**
 * A slice of a board.
 *
 * p_around centres the slice on that player and ignores p_offset, which is how
 * both find-me and search arrive here. Depth is capped: past five hundred rows
 * nobody is reading names, and an unbounded scan over fifty thousand of them is
 * a query to regret.
 */
create or replace function public.board_window(
  p_board   text default 'today',
  p_friends boolean default false,
  p_around  uuid default null,
  p_offset  integer default 0,
  p_limit   integer default 25
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid   uuid := auth.uid();
  v_lim   int  := greatest(1, least(coalesce(p_limit, 25), 50));
  v_from  int;
  v_out   jsonb;
begin
  if v_uid is null then
    return jsonb_build_object('error', 'not_authenticated');
  end if;
  if p_board not in ('today', 'season', 'alltime') then
    return jsonb_build_object('error', 'unknown_board');
  end if;

  -- Where the window starts. Only this needs the standings up front; the slice
  -- and the count come from one query below.
  if p_around is not null then
    select greatest(1, st.rank::int - 3) into v_from
    from public.board_standings(p_board, p_friends, v_uid) st
    where st.user_id = p_around;

    -- FOUND is a plpgsql built-in and reads as a variable somebody declared,
    -- which is how it bit this codebase once already. The null tells us.
    if v_from is null then
      return jsonb_build_object('error', 'not_on_board');
    end if;
  else
    v_from := greatest(1, coalesce(p_offset, 0) + 1);
  end if;

  -- Five hundred deep and no further.
  v_from := least(v_from, 500);

  with s as (
    select * from public.board_standings(p_board, p_friends, v_uid)
  )
  select jsonb_build_object(
    'board', p_board,
    'friends', p_friends,
    'from', v_from,
    'totalPlayers', (select count(*) from s),
    'entries', coalesce((
      select jsonb_agg(e order by e.rank)
      from (
        select s.rank,
               coalesce(p.username, 'Player ' || upper(right(s.user_id::text, 4))) as name,
               p.avatar,
               s.points as score,
               s.avg_off,
               s.days,
               s.user_id = v_uid as is_me
        from s
        join public.profiles p on p.id = s.user_id
        where s.rank >= v_from and s.rank < least(v_from + v_lim, 501)
      ) e
    ), '[]'::jsonb)
  ) into v_out;

  return v_out;
end;
$$;

/**
 * Somebody's standing, found by name.
 *
 * Exact username, or a friend by the start of theirs. Deliberately not fuzzy
 * over every player: usernames are already public on the board so this leaks
 * nothing, but fuzzy browsing turns a leaderboard into a directory of strangers
 * to go looking for. You can find somebody whose name you know; you cannot go
 * shopping.
 */
create or replace function public.find_player(
  p_name    text,
  p_board   text default 'today',
  p_friends boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid  uuid := auth.uid();
  v_name text := btrim(coalesce(p_name, ''));
  v_id   uuid;
begin
  if v_uid is null then
    return jsonb_build_object('error', 'not_authenticated');
  end if;
  if length(v_name) = 0 then
    return jsonb_build_object('error', 'no_name');
  end if;

  -- A friend by prefix first, so typing three letters finds the person you
  -- actually meant rather than a stranger who owns those letters exactly.
  select p.id into v_id
  from public.profiles p
  join public.my_circle(v_uid) c on c.user_id = p.id
  where p.username ilike v_name || '%'
  order by length(p.username), p.username
  limit 1;

  if v_id is null then
    select p.id into v_id from public.profiles p where lower(p.username) = lower(v_name);
  end if;

  if v_id is null then
    return jsonb_build_object('found', false);
  end if;

  return coalesce((
    select jsonb_build_object(
      'found', true,
      'userId', s.user_id,
      'name', p.username,
      'avatar', p.avatar,
      'rank', s.rank,
      'score', s.points,
      'avgOff', s.avg_off,
      'isMe', s.user_id = v_uid
    )
    from public.board_standings(p_board, p_friends, v_uid) s
    join public.profiles p on p.id = s.user_id
    where s.user_id = v_id
  ), jsonb_build_object('found', true, 'onBoard', false, 'name',
       (select username from public.profiles where id = v_id)));
end;
$$;

revoke execute on function public.board_range(text, uuid)                from public, anon, authenticated;
revoke execute on function public.board_standings(text, boolean, uuid)   from public, anon, authenticated;
revoke execute on function public.board_window(text, boolean, uuid, integer, integer) from public, anon;
revoke execute on function public.find_player(text, text, boolean)       from public, anon;
grant execute on function public.board_window(text, boolean, uuid, integer, integer) to authenticated;
grant execute on function public.find_player(text, text, boolean)        to authenticated;

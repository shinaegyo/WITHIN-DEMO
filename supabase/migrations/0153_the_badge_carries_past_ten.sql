-- The league badge carries past rank ten.
--
-- The season board draws its first ten rows from season_leaderboard and the
-- rest from board_window, and only the first of those two ever selected the
-- league. So the badge column simply stopped at rank ten: cleb, sarah and
-- choiboy wear bronze and everybody below them shows a bare number, as though
-- the ladder ran out.
--
-- Two functions building the same row is the whole cause, and this only closes
-- the gap for the field that went missing. Season alone - the other boards
-- board_window serves have never carried a badge, and the client hides the
-- cell when the league is null, so they are untouched.

begin;

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
               -- The badge the top ten have carried since 0132. The first ten
               -- rows come from season_leaderboard, which selects it; every row
               -- after them comes from here, which did not - so a board that
               -- ranks people by league stopped showing the league at rank
               -- eleven, exactly where it starts being the interesting column.
               --
               -- Season only. The other two boards have never shown a badge and
               -- this is not the change that gives them one; null keeps them
               -- rendering as they do, because the row already hides the cell
               -- when there is no league on it.
               case when p_board = 'season'
                    then public.season_league(s.points, s.days) end as league,
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
revoke execute on function public.board_window(text, boolean, uuid, integer, integer) from public, anon;
grant  execute on function public.board_window(text, boolean, uuid, integer, integer) to authenticated;

commit;

-- Should return rows past ten with a league on them.
select e->>'rank' as rank, e->>'name' as name, e->>'league' as league
  from jsonb_array_elements(
         public.board_window('season', false, null, 10, 5) -> 'entries'
       ) e;

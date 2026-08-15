-- Suggestions from the first keystroke, and strangers by whole name.
--
-- Two characters was a guess and it was the wrong one: a friends list is short,
-- so "j" narrowing it to two people is exactly as useful as "ja", and waiting
-- for a second letter reads as the field being broken.
--
-- And a stranger now appears in the list rather than only on submit - but only
-- on their whole username, never a prefix. That is the same line the search has
-- always drawn: a name typed in full is somebody you already knew, a prefix
-- over fifty thousand players is a directory to go looking through. What
-- changes is that finding them no longer requires guessing that pressing Search
-- would do something the list had not offered.
--
-- Friends sort first, then the exact stranger.

create or replace function public.suggest_players(
  p_prefix  text,
  p_board   text default 'today',
  p_friends boolean default false,
  p_limit   integer default 6
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_q   text := btrim(coalesce(p_prefix, ''));
  v_out jsonb;
begin
  if v_uid is null then
    return jsonb_build_object('error', 'not_authenticated');
  end if;
  if length(v_q) = 0 then
    return jsonb_build_object('players', '[]'::jsonb);
  end if;

  with circle as (
    -- Yourself excluded: you are not somebody you need to look up by name.
    select c.user_id from public.my_circle(v_uid) c where c.user_id <> v_uid
  ),
  friends_matching as (
    select p.id, p.username, p.avatar, 0 as tier
    from public.profiles p
    join circle c on c.user_id = p.id
    where p.username is not null
      and p.username ilike v_q || '%'
  ),
  -- A stranger only on an exact, whole username. Prefixes over everybody are
  -- how a leaderboard becomes a directory to go looking through; a name typed
  -- in full is somebody you already knew.
  stranger as (
    select p.id, p.username, p.avatar, 1 as tier
    from public.profiles p
    where p.username is not null
      and lower(p.username) = lower(v_q)
      and p.id <> v_uid
      and not exists (select 1 from circle c where c.user_id = p.id)
  ),
  matched as (
    select * from (
      select * from friends_matching
      union all
      select * from stranger
    ) u
    order by u.tier, length(u.username), lower(u.username)
    limit greatest(1, least(p_limit, 20))
  ),
  standings as (
    select * from public.board_standings(p_board, p_friends, v_uid)
  )
  select jsonb_build_object(
    'players', coalesce((
      select jsonb_agg(jsonb_build_object(
        'userId', m.id,
        'name', m.username,
        'avatar', m.avatar,
        -- Null when they have not played this board. The row still shows, so
        -- somebody can be found and told they have not played rather than
        -- silently missing from their own friend list.
        'rank', st.rank,
        'score', st.points
      ) order by m.tier, st.rank nulls last, length(m.username))
      from matched m
      left join standings st on st.user_id = m.id
    ), '[]'::jsonb)
  ) into v_out;

  return v_out;
end;
$$;


revoke execute on function public.suggest_players(text, text, boolean, integer) from public, anon;
grant execute on function public.suggest_players(text, text, boolean, integer) to authenticated;

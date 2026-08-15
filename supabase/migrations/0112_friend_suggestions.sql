-- Type-ahead, over your friends only.
--
-- find_player answers "who is jamba" - an exact username, or a friend by the
-- start of theirs. It cannot answer "who starts with ja", which is what a
-- search field wants while somebody is still typing.
--
-- Suggestions come from your circle and nowhere else. At fifty thousand players
-- a prefix over everybody turns two keystrokes into a directory of strangers to
-- go looking for, which is the thing the spec ruled out and the reason the
-- exact-name path exists: you can still find any player whose name you know in
-- full, you just cannot browse for them.
--
-- Their standing comes back with the name, so the row can say "jamba · 3rd"
-- before it is tapped. It ranks through board_standings like everything else,
-- because a suggestion that disagreed with the list it jumps into would be
-- worse than no suggestion.

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
  matched as (
    select p.id, p.username, p.avatar
    from public.profiles p
    join circle c on c.user_id = p.id
    where p.username is not null
      and p.username ilike v_q || '%'
    order by length(p.username), lower(p.username)
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
      ) order by st.rank nulls last, length(m.username))
      from matched m
      left join standings st on st.user_id = m.id
    ), '[]'::jsonb)
  ) into v_out;

  return v_out;
end;
$$;

revoke execute on function public.suggest_players(text, text, boolean, integer) from public, anon;
grant execute on function public.suggest_players(text, text, boolean, integer) to authenticated;

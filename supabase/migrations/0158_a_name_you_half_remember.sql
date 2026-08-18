-- A name you half-remember is findable.
--
-- suggest_players prefix-matched people you were already friends with and made
-- everybody else an exact, whole username - so on the Friends tab, where you
-- go precisely to find somebody you are NOT yet friends with, typing produced
-- nothing until you had spelled the whole name correctly. A search field that
-- answers nothing does not read as a rule. It reads as broken, and the only
-- way left to find out whether somebody existed was to send them a request.
--
-- The rule was there so a leaderboard could not be walked as a directory.
-- The leaderboard already is one: Rank lists every username in full, sorted,
-- to anybody who opens it. Nothing here is newly visible - the same names, in
-- the same app, reachable by typing instead of by scrolling.
--
-- Friends still come first on the same letters, which is the half of the
-- original design worth keeping.

begin;

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
  -- Anybody, on a prefix, friend or not.
  --
  -- 0113 held strangers to an exact whole username so that a leaderboard could
  -- not be walked as a directory. The board already is one: Rank lists every
  -- username in full, sorted, to anybody who opens it. So the rule bought no
  -- privacy and cost the thing it was protecting - somebody who half-remembers
  -- a name had no way to find it, and a search field that answers nothing
  -- reads as broken rather than as principled.
  --
  -- Friends still sort first. That is what the tier column is for, and it is
  -- the part worth keeping: the people you know come above the people you do
  -- not, on the same letters.
  stranger as (
    select p.id, p.username, p.avatar, 1 as tier
    from public.profiles p
    where p.username is not null
      and p.username ilike v_q || '%'
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
grant  execute on function public.suggest_players(text, text, boolean, integer) to authenticated;

commit;

-- Should list the sa- names without either being a friend.
select jsonb_array_length(public.suggest_players('sa', 'season', false, 6) -> 'players') as sa_matches,
       jsonb_array_length(public.suggest_players('j',  'season', false, 6) -> 'players') as j_matches;

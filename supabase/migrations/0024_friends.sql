-- Friends, by mutual consent.
--
-- One row per pair, holding who asked. A pair is only ever stored once, so a
-- friendship cannot end up half-present with the two directions disagreeing.
--
-- Same trust model as the rest of the game: the table is readable only for rows
-- you are part of, and has no insert, update or delete policy at all. Every
-- change goes through a SECURITY DEFINER function that works out who you are
-- from auth.uid() rather than believing an argument. A hostile client holding
-- the publishable key can therefore read its own friendships and nothing else,
-- and cannot fabricate one.

create table if not exists public.friendships (
  requester_id uuid not null references auth.users(id) on delete cascade,
  addressee_id uuid not null references auth.users(id) on delete cascade,
  status       text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at   timestamptz not null default now(),
  responded_at timestamptz,

  primary key (requester_id, addressee_id),
  -- Nobody befriends themselves.
  check (requester_id <> addressee_id)
);

alter table public.friendships enable row level security;

drop policy if exists "read own friendships" on public.friendships;
create policy "read own friendships" on public.friendships
  for select using (auth.uid() in (requester_id, addressee_id));

-- Finding the other direction of a pair is the hot path for every function
-- below.
create index if not exists friendships_addressee_idx
  on public.friendships (addressee_id, status);

/**
 * Resolve a username to its owner. Case-insensitive, because nobody types a
 * friend's capitalisation correctly from memory.
 */
create or replace function public.user_id_for_username(p_username text)
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select id from public.profiles
  where lower(username) = lower(trim(p_username))
  limit 1;
$$;

/**
 * Ask to be friends.
 *
 * If they have already asked you, this accepts instead of creating a second,
 * opposing row — two people reaching for each other at the same time should end
 * up friends, not deadlocked.
 */
create or replace function public.send_friend_request(p_username text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid    uuid := auth.uid();
  v_target uuid;
  v_row    public.friendships%rowtype;
begin
  if v_uid is null then
    return jsonb_build_object('error', 'not_authenticated');
  end if;

  v_target := public.user_id_for_username(p_username);

  if v_target is null then
    return jsonb_build_object('error', 'no_such_user');
  end if;
  if v_target = v_uid then
    return jsonb_build_object('error', 'thats_you');
  end if;

  select * into v_row from public.friendships
  where (requester_id = v_uid and addressee_id = v_target)
     or (requester_id = v_target and addressee_id = v_uid);

  if v_row.requester_id is not null then
    if v_row.status = 'accepted' then
      return jsonb_build_object('status', 'already_friends');
    end if;

    -- They asked first: treat this as the acceptance.
    if v_row.requester_id = v_target then
      update public.friendships
         set status = 'accepted', responded_at = now()
       where requester_id = v_target and addressee_id = v_uid;
      return jsonb_build_object('status', 'accepted');
    end if;

    return jsonb_build_object('status', 'already_requested');
  end if;

  insert into public.friendships (requester_id, addressee_id)
  values (v_uid, v_target);

  return jsonb_build_object('status', 'requested');
end;
$$;

/** Accept or decline a request that was sent to you. */
create or replace function public.respond_friend_request(p_username text, p_accept boolean)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid    uuid := auth.uid();
  v_target uuid;
begin
  if v_uid is null then
    return jsonb_build_object('error', 'not_authenticated');
  end if;

  v_target := public.user_id_for_username(p_username);
  if v_target is null then
    return jsonb_build_object('error', 'no_such_user');
  end if;

  -- Only the addressee may answer, so accepting your own request is impossible.
  if p_accept then
    update public.friendships
       set status = 'accepted', responded_at = now()
     where requester_id = v_target and addressee_id = v_uid and status = 'pending';
  else
    delete from public.friendships
     where requester_id = v_target and addressee_id = v_uid and status = 'pending';
  end if;

  if not found then
    return jsonb_build_object('error', 'no_such_request');
  end if;

  return jsonb_build_object('status', case when p_accept then 'accepted' else 'declined' end);
end;
$$;

/** Remove a friend, or withdraw a request, in either direction. */
create or replace function public.remove_friend(p_username text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid    uuid := auth.uid();
  v_target uuid;
begin
  if v_uid is null then
    return jsonb_build_object('error', 'not_authenticated');
  end if;

  v_target := public.user_id_for_username(p_username);
  if v_target is null then
    return jsonb_build_object('error', 'no_such_user');
  end if;

  delete from public.friendships
  where (requester_id = v_uid and addressee_id = v_target)
     or (requester_id = v_target and addressee_id = v_uid);

  return jsonb_build_object('status', 'removed');
end;
$$;

/** The friends screen: who you are friends with, and who is waiting on whom. */
create or replace function public.friends_state()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    return jsonb_build_object('error', 'not_authenticated');
  end if;

  return jsonb_build_object(
    'friends', coalesce((
      select jsonb_agg(jsonb_build_object('name', name) order by lower(name))
      from (
        select coalesce(p.username, 'Player') as name
        from public.friendships f
        join public.profiles p
          on p.id = case when f.requester_id = v_uid then f.addressee_id else f.requester_id end
        where f.status = 'accepted' and v_uid in (f.requester_id, f.addressee_id)
      ) x
    ), '[]'::jsonb),

    -- Requests waiting on you.
    'incoming', coalesce((
      select jsonb_agg(jsonb_build_object('name', name) order by lower(name))
      from (
        select coalesce(p.username, 'Player') as name
        from public.friendships f
        join public.profiles p on p.id = f.requester_id
        where f.status = 'pending' and f.addressee_id = v_uid
      ) x
    ), '[]'::jsonb),

    -- Requests you are waiting on.
    'outgoing', coalesce((
      select jsonb_agg(jsonb_build_object('name', name) order by lower(name))
      from (
        select coalesce(p.username, 'Player') as name
        from public.friendships f
        join public.profiles p on p.id = f.addressee_id
        where f.status = 'pending' and f.requester_id = v_uid
      ) x
    ), '[]'::jsonb)
  );
end;
$$;

/**
 * Today's board, narrowed to you and your friends.
 *
 * Same shape as daily_leaderboard so the two can share a row on screen. Days
 * still in progress are excluded for the same reason as the global board: a
 * score that climbs mid-round would reshuffle the list under whoever is reading
 * it.
 */
create or replace function public.friends_leaderboard()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid  uuid := auth.uid();
  v_date date;
begin
  if v_uid is null then
    return jsonb_build_object('error', 'not_authenticated');
  end if;

  v_date := public.current_puzzle_date(v_uid);

  return jsonb_build_object(
    'puzzleDate', v_date,
    'entries', coalesce((
      select jsonb_agg(e order by e.rank)
      from (
        select
          rank() over (
            order by g.total_score desc, (g.status = 'complete') desc, g.finished_at asc
          ) as rank,
          coalesce(p.username, 'Player ' || upper(right(g.user_id::text, 4))) as name,
          g.total_score as score,
          g.user_id = v_uid as is_me,
          g.status = 'complete' as is_complete,
          (select count(*) from public.round_results r
            where r.game_id = g.id and r.status = 'won')::int as rounds_won
        from public.games g
        join public.profiles p on p.id = g.user_id
        where g.puzzle_date = v_date
          and g.status in ('complete', 'eliminated')
          and (
            g.user_id = v_uid
            or exists (
              select 1 from public.friendships f
              where f.status = 'accepted'
                and (   (f.requester_id = v_uid and f.addressee_id = g.user_id)
                     or (f.addressee_id = v_uid and f.requester_id = g.user_id))
            )
          )
        order by g.total_score desc, (g.status = 'complete') desc, g.finished_at asc
      ) e
    ), '[]'::jsonb)
  );
end;
$$;

revoke execute on function public.user_id_for_username(text)          from public, anon;
revoke execute on function public.send_friend_request(text)           from public, anon;
revoke execute on function public.respond_friend_request(text, boolean) from public, anon;
revoke execute on function public.remove_friend(text)                 from public, anon;
revoke execute on function public.friends_state()                     from public, anon;
revoke execute on function public.friends_leaderboard()               from public, anon;

grant execute on function public.send_friend_request(text)            to authenticated;
grant execute on function public.respond_friend_request(text, boolean) to authenticated;
grant execute on function public.remove_friend(text)                  to authenticated;
grant execute on function public.friends_state()                      to authenticated;
grant execute on function public.friends_leaderboard()                to authenticated;

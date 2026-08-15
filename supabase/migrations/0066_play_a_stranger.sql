-- Duels against whoever else is here.
--
-- Challenging a friend needs a friend who is awake, which with a small player
-- base means most people open the mode and find nothing to do. Pairing two
-- strangers who both pressed the same button needs neither.
--
-- Presence is the gate, as it is for friend duels: rounds are three minutes
-- long, so a match against somebody who has closed the app is a loss posted to
-- their account before they have seen it. Anyone in the queue who has not
-- checked in for two minutes is simply not there.

create table if not exists public.duel_queue (
  user_id   uuid primary key references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now()
);

alter table public.duel_queue enable row level security;

/**
 * Pair with a waiting stranger, or wait.
 *
 * Reports how many other people are online either way, so the screen can tell
 * the difference between "hold on" and "there is nobody here" - which at this
 * size is the honest and more common answer.
 */
create or replace function public.duel_find_stranger()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid    uuid := auth.uid();
  v_other  uuid;
  v_id     uuid;
  v_online int;
begin
  if v_uid is null then
    return jsonb_build_object('error', 'not_authenticated');
  end if;

  -- Anything already going with a stranger is the thing to return to.
  select d.id into v_id from public.duels d
  where not d.ranked and d.status in ('pending', 'active')
    and v_uid in (d.challenger_id, d.opponent_id)
  limit 1;
  if v_id is not null then
    return jsonb_build_object('status', 'matched', 'duelId', v_id);
  end if;

  select count(*) into v_online from public.profiles p
  where p.id <> v_uid and p.last_seen_at > now() - interval '2 minutes';

  select q.user_id into v_other
  from public.duel_queue q
  join public.profiles p on p.id = q.user_id
  where q.user_id <> v_uid
    and p.last_seen_at > now() - interval '2 minutes'
    and not exists (
      select 1 from public.duels d
      where d.status in ('pending', 'active')
        and q.user_id in (d.challenger_id, d.opponent_id)
    )
  order by q.joined_at
  limit 1;

  if v_other is null then
    insert into public.duel_queue (user_id) values (v_uid)
    on conflict (user_id) do update set joined_at = now();
    return jsonb_build_object('status', 'waiting', 'online', v_online);
  end if;

  delete from public.duel_queue where user_id in (v_uid, v_other);

  -- Accepted on both sides by construction: pressing the button is the accept,
  -- and a stranger has nothing to weigh up before agreeing.
  insert into public.duels (challenger_id, opponent_id, ranked, status, accepted_at)
  values (v_uid, v_other, false, 'active', now())
  returning id into v_id;

  return jsonb_build_object('status', 'matched', 'duelId', v_id);
end;
$$;

create or replace function public.duel_leave_queue()
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
  delete from public.duel_queue where user_id = v_uid;
  return jsonb_build_object('ok', true);
end;
$$;

revoke execute on function public.duel_find_stranger() from public, anon;
revoke execute on function public.duel_leave_queue()   from public, anon;
grant execute on function public.duel_find_stranger() to authenticated;
grant execute on function public.duel_leave_queue()   to authenticated;

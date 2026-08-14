-- Show which friends are around right now.
--
-- A challenge is far more appealing when you know the other person is holding
-- their phone. Without that you are posting into a void and hoping.
--
-- Presence here means "the app checked in within the last two minutes" - a
-- heartbeat, not a socket. It is approximate by design: someone with the tab
-- open but backgrounded will fade out, which is the right answer anyway, since
-- they are not going to accept a challenge.
--
-- Visible only to accepted friends. Nobody else can see when you play.

alter table public.profiles
  add column if not exists last_seen_at timestamptz;

create or replace function public.touch_presence()
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  update public.profiles set last_seen_at = now() where id = auth.uid();
$$;

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
      select jsonb_agg(jsonb_build_object('name', name, 'online', online) order by lower(name))
      from (
        select
          coalesce(p.username, 'Player') as name,
          p.last_seen_at > now() - interval '2 minutes' as online
        from public.friendships f
        join public.profiles p
          on p.id = case when f.requester_id = v_uid then f.addressee_id else f.requester_id end
        where f.status = 'accepted' and v_uid in (f.requester_id, f.addressee_id)
      ) x
    ), '[]'::jsonb),

    'incoming', coalesce((
      select jsonb_agg(jsonb_build_object('name', name) order by lower(name))
      from (
        select coalesce(p.username, 'Player') as name
        from public.friendships f
        join public.profiles p on p.id = f.requester_id
        where f.status = 'pending' and f.addressee_id = v_uid
      ) x
    ), '[]'::jsonb),

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

revoke execute on function public.touch_presence() from public, anon;
revoke execute on function public.friends_state()  from public, anon;
grant execute on function public.touch_presence()  to authenticated;
grant execute on function public.friends_state()   to authenticated;

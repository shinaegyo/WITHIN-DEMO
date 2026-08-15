-- How many people are actually here.
--
-- Duels are online-only on both sides, so the screen's real question is not
-- "who do you want to play" but "is there anybody to play". Until now that was
-- answered only after pressing the button and being put in a queue, which is
-- the wrong order: nobody should have to commit to find out the room is empty.
--
-- A count, not a list. Who else is awake is not anyone's business beyond the
-- friends they already have.

create or replace function public.players_online()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'online', (
      select count(*) from public.profiles p
      where p.id <> auth.uid() and p.last_seen_at > now() - interval '2 minutes'
    )
  );
$$;

revoke execute on function public.players_online() from public, anon;
grant execute on function public.players_online() to authenticated;

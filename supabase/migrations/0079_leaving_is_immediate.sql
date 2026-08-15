-- Going away happens at once, not over two minutes.
--
-- Presence has meant "checked in within the last two minutes", and the app
-- checked in every minute for as long as it was loaded - backgrounded, buried
-- behind other tabs, or sitting on a phone in somebody's pocket. So the green
-- dot meant a copy of the app existed, not that anyone was looking at it, and
-- somebody who had walked away stayed challengeable for a further two minutes.
--
-- A duel round lasts three. Being challenged by a player who left four minutes
-- ago costs a real round to a person who never saw it.
--
-- The window stays as it is. What changes is that leaving says so: the app
-- clears its own presence when it goes to the background, so the dot goes out
-- as the player looks away rather than two minutes later.

create or replace function public.clear_presence()
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  update public.profiles
  set last_seen_at = now() - interval '10 minutes'
  where id = auth.uid();
$$;

revoke execute on function public.clear_presence() from public, anon;
grant execute on function public.clear_presence() to authenticated;

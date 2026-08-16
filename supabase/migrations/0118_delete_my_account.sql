-- A way out.
--
-- Apple has required an in-app account deletion path since 2022 for any app
-- that creates an account, and this one creates a silent anonymous account on
-- first launch - so every player has an account whether they asked for one or
-- not, and every one of them is entitled to remove it. Submitting without this
-- is the most likely way to fail a first review.
--
-- Everything that belongs to a player hangs off auth.users with on delete
-- cascade - profile, games, guesses, stats, climbs, rush and window runs,
-- duels, friendships, push tokens - so removing the row removes the person.
-- Nothing is anonymised and kept: "delete" means the leaderboards lose them
-- too, which is what someone pressing it is asking for.
--
-- The two exceptions are deliberate. A duel's winner_id and the belt holder are
-- set null rather than cascaded, because a duel somebody else played is their
-- record as much as it was the leaver's - the row survives with a blank where
-- the name was.
--
-- auth.users is not writable by the authenticated role, so this runs as its
-- owner. That makes the id it deletes the one thing that must never come from
-- an argument: it takes no parameters at all and reads auth.uid(), so the worst
-- a caller can do is delete themselves.

create or replace function public.delete_my_account()
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    return jsonb_build_object('error', 'not_authenticated');
  end if;

  -- Tokens first and explicitly. The cascade would take them anyway, but a
  -- device that is about to be forgotten should stop being pushed to even if
  -- the delete below fails for any reason.
  delete from public.push_tokens where user_id = v_uid;

  delete from auth.users where id = v_uid;

  return jsonb_build_object('ok', true);
end;
$$;

revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

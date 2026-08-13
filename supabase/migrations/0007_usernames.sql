-- Usernames.
--
-- Needed regardless of which sign-in providers get enabled: the leaderboard
-- currently shows "Player A3F9" for everyone. Claiming a name is deliberately
-- separate from signing in, so an anonymous player can put a real name on the
-- board before deciding whether to create an account.

-- Case-insensitive uniqueness. Without this, "James" and "james" are two
-- different names on the leaderboard, which reads as impersonation.
create unique index if not exists profiles_username_lower_idx
  on public.profiles (lower(username));

create or replace function public.set_username(p_username text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid  uuid := auth.uid();
  v_name text := btrim(p_username);
begin
  if v_uid is null then
    return jsonb_build_object('error', 'not_authenticated');
  end if;

  if char_length(v_name) < 3 or char_length(v_name) > 16 then
    return jsonb_build_object('error', 'bad_length');
  end if;

  -- Letters, digits and underscore only. Keeps the leaderboard readable and
  -- rules out names built from lookalike or invisible characters.
  if v_name !~ '^[A-Za-z0-9_]+$' then
    return jsonb_build_object('error', 'bad_characters');
  end if;

  insert into public.profiles (id, username) values (v_uid, v_name)
  on conflict (id) do update set username = excluded.username;

  return jsonb_build_object('username', v_name);
exception
  when unique_violation then
    return jsonb_build_object('error', 'taken');
end;
$$;

revoke execute on function public.set_username(text) from public, anon;
grant execute on function public.set_username(text) to authenticated;

-- Reports whether a name is free, so the UI can say so before submitting.
create or replace function public.username_available(p_username text)
returns boolean
language sql
security definer
set search_path = public, pg_temp
as $$
  select not exists (
    select 1 from public.profiles where lower(username) = lower(btrim(p_username))
  );
$$;

revoke execute on function public.username_available(text) from public, anon;
grant execute on function public.username_available(text) to authenticated;

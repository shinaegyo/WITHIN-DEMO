-- A locked name should say which name it is.
--
-- name_locked told a player their name was set and never said what it was set
-- to. Everywhere else that is merely unhelpful; on the onboarding screen it is
-- unanswerable. The app asks someone to choose a name precisely because it
-- believes they have none, so a reply of "you already have one" without the
-- name leaves nothing to type and nothing to press - and the one fact that
-- resolves the contradiction is the one fact withheld.
--
-- The name is already read into v_have to make the decision. Returning it costs
-- nothing and it is not a leak: it is the caller's own name, and every name in
-- the game is public on the leaderboard anyway.

create or replace function public.set_username(p_username text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid  uuid := auth.uid();
  v_name text := btrim(p_username);
  v_have text;
  v_when timestamptz;
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

  select username, username_changed_at into v_have, v_when
  from public.profiles where id = v_uid;

  -- Renaming to what you already are is not a change, and should not spend one.
  if v_have is not null and lower(v_have) = lower(v_name) then
    return jsonb_build_object('username', v_have);
  end if;

  if v_have is not null and v_when is not null
     and now() - v_when > interval '24 hours'
     and now() - v_when < interval '365 days' then
    return jsonb_build_object(
      'error', 'name_locked',
      -- What the account is actually called, so a client that got here holding
      -- the wrong idea of who it is talking to can correct itself.
      'username', v_have,
      'nextChangeAt', v_when + interval '365 days'
    );
  end if;

  insert into public.profiles (id, username, username_changed_at)
  values (v_uid, v_name, now())
  on conflict (id) do update set
    username = excluded.username,
    -- The grace day belongs to the first naming, so fixing a typo inside it
    -- does not start the year again from the fix.
    username_changed_at = case
      when public.profiles.username is null then now()
      when now() - public.profiles.username_changed_at <= interval '24 hours'
        then public.profiles.username_changed_at
      else now()
    end;

  return jsonb_build_object('username', v_name);
exception
  when unique_violation then
    return jsonb_build_object('error', 'taken');
end;
$$;

revoke execute on function public.set_username(text) from public, anon;
grant execute on function public.set_username(text) to authenticated;

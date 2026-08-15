-- A name can be changed once a year, and freely for the first day.
--
-- Names were changeable without limit, and a name here is identity: the boards,
-- the friends list, the duel history and every "who beat me" depend on the
-- person being the same person tomorrow. Free renaming makes that unreadable,
-- and it lets somebody shed a reputation or take a rival's look repeatedly.
--
-- Never would be the tidy rule and the wrong one - people mistype, and people
-- pick a name at fourteen they regret at fifteen - so once a year, which is
-- enough to fix a regret and rare enough that nobody loses track of anyone.
--
-- The first day is free. The commonest change anyone will ever want is the typo
-- they spot a minute after signing up, and making them live with it for a year
-- is the kind of rule people leave over.

alter table public.profiles add column if not exists username_changed_at timestamptz;

-- Everyone who already has a name starts their year now rather than being
-- locked out on a clock that was never running.
update public.profiles set username_changed_at = now()
where username is not null and username_changed_at is null;

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

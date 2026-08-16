-- Somewhere to send a daily nudge, and the rule for who gets one.
--
-- A daily game lives or dies on the reminder. Everything else in this app is
-- built for the player who already opened it; this is the only thing that
-- reaches the player who forgot.
--
-- Two rules, and both of them are about not being a nuisance:
--
--   * Nobody is reminded about a day they have already played. The whole point
--     is the person who forgot, and telling somebody who finished at breakfast
--     that their numbers are waiting is how an app gets muted.
--   * The hour is the player's own. A reminder at 09:00 UTC is 01:00 in Los
--     Angeles, and one push at the wrong hour costs the permission forever.
--
-- The sending itself is a scheduled Edge Function - see
-- supabase/functions/daily-reminder. Nothing here talks to Expo; this decides
-- who and the function decides how.

create table if not exists public.push_tokens (
  token       text primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  platform    text not null check (platform in ('ios', 'android', 'web')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists push_tokens_user on public.push_tokens (user_id);

alter table public.push_tokens enable row level security;

-- Read your own; everything else goes through the functions below.
drop policy if exists "read own tokens" on public.push_tokens;
create policy "read own tokens" on public.push_tokens
  for select using (auth.uid() = user_id);

/**
 * When to be reminded, and whether at all.
 *
 * Defaults to on at 19:00 local. A daily game somebody opted into is a fair
 * thing to remind them about, and the settings screen can turn it off - but
 * defaulting to off means the feature does nothing for the people who most
 * need it and never think to look.
 */
alter table public.profiles
  add column if not exists remind_daily boolean not null default true,
  add column if not exists remind_hour  smallint not null default 19
    check (remind_hour between 0 and 23),
  add column if not exists remind_streak boolean not null default true,
  add column if not exists last_reminded_on date;

/** Registers a device. Same token twice is the same device, not two. */
create or replace function public.register_push_token(p_token text, p_platform text)
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
  if p_token is null or length(p_token) < 10 or p_platform not in ('ios','android','web') then
    return jsonb_build_object('error', 'bad_token');
  end if;

  -- A phone handed to somebody else keeps the token and changes owner, so the
  -- conflict updates the user rather than being ignored.
  insert into public.push_tokens (token, user_id, platform)
  values (p_token, v_uid, p_platform)
  on conflict (token) do update
    set user_id = excluded.user_id,
        platform = excluded.platform,
        updated_at = now();

  return jsonb_build_object('ok', true);
end;
$$;

/** Turning it off has to work from the phone that is being bothered. */
create or replace function public.set_reminders(
  p_daily boolean default null,
  p_hour integer default null,
  p_streak boolean default null
)
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
  if p_hour is not null and (p_hour < 0 or p_hour > 23) then
    return jsonb_build_object('error', 'bad_hour');
  end if;

  update public.profiles set
    remind_daily  = coalesce(p_daily, remind_daily),
    remind_hour   = coalesce(p_hour, remind_hour),
    remind_streak = coalesce(p_streak, remind_streak)
  where id = v_uid;

  return (
    select jsonb_build_object(
      'ok', true, 'daily', remind_daily, 'hour', remind_hour, 'streak', remind_streak
    ) from public.profiles where id = v_uid
  );
end;
$$;

/**
 * Who to push, right now.
 *
 * Called by the scheduled function every hour. A player qualifies when it is
 * their chosen hour in their own timezone, they have not been reminded today,
 * and they have not finished today's rounds.
 *
 * The streak line is the one worth sending: somebody on a nine-day run being
 * told they are about to lose it will open the app. Somebody with no streak
 * gets the plain version.
 */
create or replace function public.players_to_remind()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'userId', d.id,
      'tokens', d.tokens,
      'streak', d.streak,
      'title', case when d.streak >= 2 and d.remind_streak
                    then 'Your ' || d.streak || '-day streak ends at midnight'
                    else 'Today''s numbers are up' end,
      'body', case when d.streak >= 2 and d.remind_streak
                   then 'Three rounds is all it takes to keep it.'
                   else 'Three rounds, three numbers. It takes a few minutes.' end
    ))
    from (
      select
        p.id,
        p.remind_streak,
        coalesce(s.current_streak, 0) as streak,
        public.current_puzzle_date(p.id) as today,
        array_agg(t.token) as tokens
      from public.profiles p
      join public.push_tokens t on t.user_id = p.id
      left join public.stats s on s.user_id = p.id
      where p.remind_daily
        and p.username is not null
        -- Their hour, in their zone.
        and extract(hour from (now() at time zone coalesce(p.timezone, 'UTC'))) = p.remind_hour
        -- Once a day at most, whatever else happens.
        and (p.last_reminded_on is null
             or p.last_reminded_on < public.current_puzzle_date(p.id))
        -- And not if they have already played it.
        and not exists (
          select 1 from public.games g
          where g.user_id = p.id
            and g.puzzle_date = public.current_puzzle_date(p.id)
            and g.status in ('complete', 'eliminated')
        )
      group by p.id, p.remind_streak, s.current_streak
    ) d
  ), '[]'::jsonb);
end;
$$;

/** Called back after a send, so nobody is pushed twice in a day. */
create or replace function public.mark_reminded(p_user_ids uuid[])
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.profiles p
  set last_reminded_on = public.current_puzzle_date(p.id)
  where p.id = any(coalesce(p_user_ids, '{}'::uuid[]));
  return jsonb_build_object('ok', true);
end;
$$;

/** Expo tells us when a token is dead. A dead token is not worth keeping. */
create or replace function public.drop_push_tokens(p_tokens text[])
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  delete from public.push_tokens where token = any(coalesce(p_tokens, '{}'::text[]));
  return jsonb_build_object('ok', true);
end;
$$;

-- The player's own settings are the player's. Everything that reads across
-- accounts is for the scheduled function alone, which runs as service_role -
-- an authenticated user must never be able to ask who has not played today.
revoke execute on function public.players_to_remind()        from public, anon, authenticated;
revoke execute on function public.mark_reminded(uuid[])      from public, anon, authenticated;
revoke execute on function public.drop_push_tokens(text[])   from public, anon, authenticated;
revoke execute on function public.register_push_token(text, text) from public, anon;
revoke execute on function public.set_reminders(boolean, integer, boolean) from public, anon;
grant execute on function public.register_push_token(text, text) to authenticated;
grant execute on function public.set_reminders(boolean, integer, boolean) to authenticated;

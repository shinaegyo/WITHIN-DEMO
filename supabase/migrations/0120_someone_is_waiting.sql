-- Waiting you can see, and an invitation that can create the other player.
--
-- Two halves of the same problem. A duel against a stranger needs both people
-- present within a couple of minutes of each other, and with a few dozen
-- players spread across a day that only happens by accident.
--
-- The first half is that waiting is invisible. The queue row already survives
-- leaving the duels screen and presence is a heartbeat from the whole app, so
-- somebody who presses the button and goes off to play Rush is genuinely still
-- matchable - they simply have no way of knowing it, and nothing tells them
-- when it lands. home_status carries it now, so every screen that reads the
-- modes can say so.
--
-- The second half is manufacturing the overlap rather than waiting for it: when
-- somebody joins the queue, invite the people most likely to answer. That is
-- the most intrusive notification this app can send - it arrives unasked, about
-- somebody else's timing - so the rules around it are deliberately mean:
--
--   * Its own switch, off unless asked for. The daily reminder is a different
--     promise and must not be spent on this.
--   * Only to people who have finished a duel before. Nobody's first taste of
--     the game should be a stranger wanting to play them.
--   * One a day at most, and only between 9am and 10pm in their own time.
--   * Never to somebody already in a duel, and never to the person waiting.
--
-- Muting WITHIN takes the daily reminder with it, and that is the one that
-- keeps the game alive. This feature is not worth that trade, so it is built to
-- stay quiet.

alter table public.profiles
  add column if not exists remind_duel boolean not null default false,
  add column if not exists last_duel_ping timestamptz;

/**
 * Who to invite when somebody starts waiting.
 *
 * Returns tokens rather than sending anything; the Edge Function carries it to
 * Expo. Service role only - an authenticated player must never be able to ask
 * the database for a list of other people's devices.
 */
create or replace function public.duel_invitees(p_waiting uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_name text;
begin
  select username into v_name from public.profiles where id = p_waiting;
  if v_name is null then
    return '[]'::jsonb;
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'userId', d.id,
      'tokens', d.tokens,
      'title', 'Someone is up for a duel',
      'body', v_name || ' is waiting for an opponent right now.'
    ))
    from (
      select p.id, array_agg(t.token) as tokens
      from public.profiles p
      join public.push_tokens t on t.user_id = p.id
      where p.remind_duel
        and p.id <> p_waiting
        and p.username is not null
        -- Somewhere between nine in the morning and ten at night, their time.
        and extract(hour from (now() at time zone coalesce(p.timezone, 'UTC'))) between 9 and 21
        -- One a day, whatever else happens.
        and (p.last_duel_ping is null or p.last_duel_ping < now() - interval '20 hours')
        -- They have done this before. A stranger asking for a duel is a strange
        -- first thing to hear from a game you played once.
        and exists (
          select 1 from public.duels x
          where x.status = 'complete' and p.id in (x.challenger_id, x.opponent_id)
        )
        -- And they are free to take it.
        and not exists (
          select 1 from public.duels o
          where o.status in ('pending', 'active') and p.id in (o.challenger_id, o.opponent_id)
        )
      group by p.id
      limit 20
    ) d
  ), '[]'::jsonb);
end;
$$;

/** Called back after a send, so nobody is invited twice in a day. */
create or replace function public.mark_duel_pinged(p_user_ids uuid[])
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.profiles set last_duel_ping = now()
  where id = any(coalesce(p_user_ids, '{}'::uuid[]));
  return jsonb_build_object('ok', true);
end;
$$;

/** Is this player actually in the queue? The Edge Function checks before it sends. */
create or replace function public.is_queued(p_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (select 1 from public.duel_queue q where q.user_id = p_uid);
$$;

/** 0117's home_status, carrying whether you are waiting for an opponent. */
create or replace function public.home_status()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid  uuid := auth.uid();
  v_run  public.endless_runs%rowtype;
  v_date date;
  v_rush public.rush_runs%rowtype;
  v_win  public.window_runs%rowtype;
begin
  if v_uid is null then
    return jsonb_build_object('error', 'not_authenticated');
  end if;

  v_date := public.current_puzzle_date(v_uid);

  select * into v_run from public.endless_runs
  where user_id = v_uid and week_start = public.endless_week(v_uid)
  order by started_at desc limit 1;

  select * into v_rush from public.rush_runs
  where user_id = v_uid and puzzle_date = v_date;

  select * into v_win from public.window_runs
  where user_id = v_uid and puzzle_date = v_date;

  return jsonb_build_object(
    'duelsWaiting', (
      select count(*) from public.duels d
      where not d.ranked
        and v_uid in (d.challenger_id, d.opponent_id)
        and (
          (d.status = 'pending' and d.opponent_id = v_uid)
          or (d.status = 'active' and (
                exists (select 1 from public.duel_progress g
                        where g.duel_id = d.id and g.user_id = v_uid and g.status = 'playing')
                or (public.duel_pick_round(d.id, v_uid) is not null
                    and not exists (select 1 from public.duel_numbers n
                                    where n.duel_id = d.id and n.set_by = v_uid
                                      and n.round = public.duel_pick_round(d.id, v_uid)))
             ))
        )
    ),
    -- Waiting survives leaving the screen, so something other than that screen
    -- has to say it is still going on.
    'queued', public.is_queued(v_uid),
    'ranked', jsonb_build_object(
      'rating', null, 'played', 0, 'queued', false, 'inMatch', false,
      'needsMe', false, 'beltHolder', null, 'iHoldBelt', false
    ),
    'impossible', jsonb_build_object(
      'sessionsLeft', public.endless_sessions_left(v_uid),
      'health', coalesce(v_run.health, 100),
      'summit', v_run.summit_at is not null,
      'lives', coalesce(v_run.lives, 0),
      'level', least(coalesce(v_run.level, 1), public.endless_max_level()),
      'best', greatest(0, least(coalesce(v_run.level, 1), public.endless_max_level() + 1) - 1)
    ),
    'rush', jsonb_build_object(
      'played', v_rush.id is not null and public.rush_left(v_rush) <= 0,
      'running', v_rush.id is not null and public.rush_left(v_rush) > 0,
      'found', coalesce(v_rush.found, 0)
    ),
    'window', jsonb_build_object(
      'played', v_win.submitted_at is not null,
      'started', v_win.id is not null,
      'score', coalesce(v_win.score, 0),
      'inside', coalesce(v_win.score, 0) > 0
    )
  );
end;
$$;

/** The duel switch lives beside the other two. 0115's set_reminders, extended. */
create or replace function public.set_reminders(
  p_daily boolean default null,
  p_hour integer default null,
  p_streak boolean default null,
  p_duel boolean default null
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
    remind_streak = coalesce(p_streak, remind_streak),
    remind_duel   = coalesce(p_duel, remind_duel)
  where id = v_uid;

  return (
    select jsonb_build_object(
      'ok', true, 'daily', remind_daily, 'hour', remind_hour,
      'streak', remind_streak, 'duel', remind_duel
    ) from public.profiles where id = v_uid
  );
end;
$$;

-- The old three-argument signature would be ambiguous against the new one on
-- any call that omits the last parameter, so it goes.
drop function if exists public.set_reminders(boolean, integer, boolean);

revoke execute on function public.duel_invitees(uuid)      from public, anon, authenticated;
revoke execute on function public.mark_duel_pinged(uuid[]) from public, anon, authenticated;
revoke execute on function public.is_queued(uuid)          from public, anon, authenticated;
revoke execute on function public.home_status()            from public, anon;
revoke execute on function public.set_reminders(boolean, integer, boolean, boolean) from public, anon;
grant execute on function public.home_status() to authenticated;
grant execute on function public.set_reminders(boolean, integer, boolean, boolean) to authenticated;

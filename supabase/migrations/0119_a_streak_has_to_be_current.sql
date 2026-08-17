-- A streak you are not on is not a streak.
--
-- recompute_stats measures the last unbroken run of completed days and stores
-- its length. That is right on the day it is written and wrong every day after:
-- somebody who played five days and then stopped keeps current_streak = 5 for a
-- month, because nothing recomputes it until they come back and play - and the
-- one thing that would break the run is the day they did not.
--
-- So the profile said "5 day streak" to a player who had not opened the game
-- since Tuesday, and the reminder at seven in the evening would have told them
-- a five-day run was about to end when it ended days ago.
--
-- The fix is to record when the run ends, not only how long it is. A stored run
-- is somebody's current streak only if it reaches yesterday - yesterday rather
-- than today, because today's puzzle is usually unplayed at the moment somebody
-- looks, and a number that read 0 all morning and 6 after lunch would be a
-- worse lie than the one being fixed.
--
-- Where the correction happens matters. game_state is a two-hundred-line
-- function that has been rewritten six times and reads the stat row wholesale;
-- copying it again to change one line is how the next person inherits seven
-- copies. Instead the stale value is cleared in set_timezone, which every load
-- of the daily calls immediately before game_state - one row, one comparison,
-- already on the path.

alter table public.stats
  add column if not exists streak_ends_on date;

/** The run this player is on, or zero. */
create or replace function public.streak_of(p_uid uuid)
returns integer
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case
    when s.streak_ends_on is null then 0
    when s.streak_ends_on >= public.current_puzzle_date(p_uid) - 1 then coalesce(s.current_streak, 0)
    else 0
  end
  from public.stats s
  where s.user_id = p_uid;
$$;

/** 0015's, with the run's end date recorded beside its length. */
create or replace function public.recompute_stats(p_uid uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_current integer := 0;
  v_max     integer := 0;
  v_ends    date;
begin
  insert into public.stats (user_id) values (p_uid) on conflict (user_id) do nothing;

  -- Only clean completions count toward a run: finished all three rounds, and
  -- no retry used that day.
  with completed as (
    select puzzle_date
    from public.games
    where user_id = p_uid
      and status = 'complete'
      and retries_used = 0
  ),
  grouped as (
    select puzzle_date,
           puzzle_date - (row_number() over (order by puzzle_date))::integer as grp
    from completed
  ),
  runs as (
    select grp, count(*)::integer as len, max(puzzle_date) as ends_on
    from grouped group by grp
  )
  select
    coalesce((select len from runs order by ends_on desc limit 1), 0),
    coalesce((select max(len) from runs), 0),
    (select ends_on from runs order by ends_on desc limit 1)
  into v_current, v_max, v_ends;

  update public.stats s set
    games_played = (select count(*) from public.games g
                    where g.user_id = p_uid and g.status <> 'playing'),
    games_won    = (select count(*) from public.games g
                    where g.user_id = p_uid and g.status = 'complete'),
    total_points = coalesce((select sum(g.total_score) from public.games g
                             where g.user_id = p_uid), 0),
    current_streak = v_current,
    streak_ends_on = v_ends,
    max_streak     = greatest(s.max_streak, v_max),
    last_played_date = (select max(g.puzzle_date) from public.games g
                        where g.user_id = p_uid and g.status <> 'playing')
  where s.user_id = p_uid;
end;
$$;

/**
 * Clears streaks that have already ended.
 *
 * Written to take either one player or all of them. Per-player it runs on the
 * daily load and costs one indexed row; with no argument it is the sweep for a
 * scheduled job, so a card somebody else is looking at is not the last place a
 * dead streak survives.
 */
create or replace function public.expire_streaks(p_uid uuid default null)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_hit integer;
begin
  update public.stats s set current_streak = 0
  where (p_uid is null or s.user_id = p_uid)
    and coalesce(s.current_streak, 0) > 0
    -- Their own midnight, not the server's: a run that broke in Los Angeles
    -- has not broken yet in Auckland.
    and coalesce(s.streak_ends_on, date '1970-01-01')
        < public.current_puzzle_date(s.user_id) - 1;
  get diagnostics v_hit = row_count;
  return v_hit;
end;
$$;

-- Fill in the end dates, or every existing streak reads as broken.
update public.stats s set streak_ends_on = (
  with completed as (
    select puzzle_date from public.games
    where user_id = s.user_id and status = 'complete' and retries_used = 0
  ),
  grouped as (
    select puzzle_date,
           puzzle_date - (row_number() over (order by puzzle_date))::integer as grp
    from completed
  ),
  runs as (select grp, max(puzzle_date) as ends_on from grouped group by grp)
  select ends_on from runs order by ends_on desc limit 1
)
where s.streak_ends_on is null;

-- And clear the ones that are already over, which is the bug as it stands
-- today rather than as it would happen tomorrow.
select public.expire_streaks();

/**
 * 0004's set_timezone, with the streak check added.
 *
 * The client calls this immediately before game_state on every load of the
 * daily, which makes it the one place a correction can sit without a second
 * copy of a large function.
 */
create or replace function public.set_timezone(p_timezone text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  if not exists (select 1 from pg_timezone_names where name = p_timezone) then
    raise exception 'unknown timezone %', p_timezone;
  end if;

  insert into public.profiles (id, timezone) values (auth.uid(), p_timezone)
  on conflict (id) do update set timezone = excluded.timezone;

  -- The timezone is now current, so the day is knowable: if the run ended
  -- before yesterday it is over, and game_state is about to read this row.
  perform public.expire_streaks(auth.uid());
end;
$$;

/**
 * The reminder, which is the worst place for a stale streak: telling somebody
 * their nine-day run ends tonight when it ended a week ago is how an app
 * teaches people to ignore it. 0115's, reading streak_of.
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
        public.streak_of(p.id) as streak,
        array_agg(t.token) as tokens
      from public.profiles p
      join public.push_tokens t on t.user_id = p.id
      where p.remind_daily
        and p.username is not null
        and extract(hour from (now() at time zone coalesce(p.timezone, 'UTC'))) = p.remind_hour
        and (p.last_reminded_on is null
             or p.last_reminded_on < public.current_puzzle_date(p.id))
        and not exists (
          select 1 from public.games g
          where g.user_id = p.id
            and g.puzzle_date = public.current_puzzle_date(p.id)
            and g.status in ('complete', 'eliminated')
        )
      group by p.id, p.remind_streak
    ) d
  ), '[]'::jsonb);
end;
$$;

revoke execute on function public.streak_of(uuid)          from public, anon;
revoke execute on function public.expire_streaks(uuid)     from public, anon, authenticated;
revoke execute on function public.players_to_remind()      from public, anon, authenticated;
revoke execute on function public.set_timezone(text)       from public, anon;
grant execute on function public.streak_of(uuid)   to authenticated;
grant execute on function public.set_timezone(text) to authenticated;

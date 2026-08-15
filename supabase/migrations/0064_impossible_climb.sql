-- Impossible becomes a climb that lasts the week.
--
-- Runs used to restart at the first number, so five a day meant five short
-- sprints and the deep levels were unreachable by construction. The climb now
-- persists: a miss costs a life and puts you back on the same number, not back
-- at the bottom.
--
--   two sessions a day, five lives each
--   the level carries across sessions and across days
--   the whole thing resets on Monday, with new numbers for everyone
--
-- That makes the week's board a record of how far people actually got rather
-- than who had the best ten minutes, and it gives somebody a reason to open the
-- app tomorrow: the climb is where they left it.

alter table public.endless_runs add column if not exists lives smallint not null default 5;
alter table public.endless_runs add column if not exists sessions_used smallint not null default 1;
alter table public.endless_runs add column if not exists session_date date;

update public.endless_runs set session_date = run_date where session_date is null;

/** Sessions a day, and lives inside one. */
create or replace function public.endless_sessions_per_day() returns smallint
language sql immutable as $$ select 2::smallint $$;
create or replace function public.endless_lives_per_session() returns smallint
language sql immutable as $$ select 5::smallint $$;

/**
 * The climb for this week, created on first sight.
 *
 * One row per player per week rather than one per run: the run is the week now,
 * and lives are what a session spends.
 */
create or replace function public.endless_climb(p_uid uuid)
returns public.endless_runs
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_week date := public.endless_week(p_uid);
  v_today date := public.current_puzzle_date(p_uid);
  v_run  public.endless_runs%rowtype;
begin
  select * into v_run from public.endless_runs
  where user_id = p_uid and week_start = v_week
  order by started_at desc limit 1;

  if v_run.id is null then
    insert into public.endless_runs
      (user_id, week_start, run_date, session_date, clue1, lives, sessions_used, status)
    values
      (p_uid, v_week, v_today, v_today,
       public.pick_clue1(public.endless_number(v_week, 1)),
       public.endless_lives_per_session(), 1, 'active')
    returning * into v_run;
  end if;

  return v_run;
end;
$$;

/** Sessions left today: a new day hands back the full allowance. */
create or replace function public.endless_sessions_left(p_uid uuid)
returns integer
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_run   public.endless_runs%rowtype;
  v_today date := public.current_puzzle_date(p_uid);
begin
  select * into v_run from public.endless_runs
  where user_id = p_uid and week_start = public.endless_week(p_uid)
  order by started_at desc limit 1;

  if v_run.id is null then return public.endless_sessions_per_day(); end if;
  if v_run.session_date is distinct from v_today then
    return public.endless_sessions_per_day();
  end if;

  return greatest(0, public.endless_sessions_per_day() - v_run.sessions_used);
end;
$$;

/**
 * Begin a session: five fresh lives, same level.
 *
 * Explicit rather than implicit, so opening the board or glancing at the mode
 * never spends one.
 */
create or replace function public.endless_start_session()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid   uuid := auth.uid();
  v_run   public.endless_runs%rowtype;
  v_today date;
begin
  if v_uid is null then
    return jsonb_build_object('error', 'not_authenticated');
  end if;

  v_run := public.endless_climb(v_uid);
  v_today := public.current_puzzle_date(v_uid);

  -- Already in a session with lives left: carry on rather than restart it.
  if v_run.session_date = v_today and v_run.lives > 0 and v_run.status = 'active' then
    return jsonb_build_object('ok', true, 'resumed', true);
  end if;

  if public.endless_sessions_left(v_uid) <= 0 then
    return jsonb_build_object('error', 'no_sessions_left');
  end if;

  update public.endless_runs set
    lives = public.endless_lives_per_session(),
    attempts_used = 0,
    status = 'active',
    sessions_used = case when session_date = v_today then sessions_used + 1 else 1 end,
    session_date = v_today,
    clue_level = null
  where id = v_run.id;

  return jsonb_build_object('ok', true, 'resumed', false);
end;
$$;

create or replace function public.endless_state()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid  uuid := auth.uid();
  v_week date;
  v_run  public.endless_runs%rowtype;
  v_win  int[];
  v_clue text := null;
  v_show boolean;
begin
  if v_uid is null then
    return jsonb_build_object('error', 'not_authenticated');
  end if;

  v_week := public.endless_week(v_uid);
  v_run  := public.endless_climb(v_uid);

  v_show := (public.endless_attempts(v_run.level) - v_run.attempts_used)
            <= public.endless_clue_at(v_run.level);

  if v_show and v_run.lives > 0 then
    if v_run.clue_level is distinct from v_run.level then
      v_win := public.endless_window(v_run.id, v_run.level);
      update public.endless_runs set
        clue1 = public.live_clue(public.endless_number(v_week, v_run.level), v_win[1], v_win[2]),
        clue_level = v_run.level
      where id = v_run.id
      returning * into v_run;
    end if;
    v_clue := v_run.clue1;
  end if;

  return jsonb_build_object(
    'week', v_week,
    'level', v_run.level,
    'lives', v_run.lives,
    'sessionsLeft', public.endless_sessions_left(v_uid),
    'inSession', v_run.lives > 0 and v_run.session_date = public.current_puzzle_date(v_uid),
    'attemptsUsed', v_run.attempts_used,
    'attemptsAllowed', public.endless_attempts(v_run.level),
    'clue1', v_clue,
    'guesses', coalesce((
      select jsonb_agg(jsonb_build_object(
               'guess', g.guess, 'direction', g.direction, 'tier', g.tier,
               'isCorrect', g.direction = 'correct',
               'isWithin10', abs(g.guess - public.endless_number(v_week, v_run.level)) <= 10
                             and g.direction <> 'correct',
               'isOneAway', abs(g.guess - public.endless_number(v_week, v_run.level)) = 1
             ) order by g.guess_index)
      from public.endless_guesses g
      where g.run_id = v_run.id and g.level = v_run.level
    ), '[]'::jsonb),
    'best', greatest(0, v_run.level - 1)
  );
end;
$$;

/** A guess. Running out of attempts costs a life, not the climb. */
create or replace function public.endless_guess(p_guess integer)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid    uuid := auth.uid();
  v_week   date;
  v_run    public.endless_runs%rowtype;
  v_answer smallint;
  v_dist   integer;
  v_dir    text;
  v_tier   text;
  v_index  smallint;
  v_last   boolean;
  v_next   smallint;
  v_capped boolean := false;
  v_lost   boolean := false;
begin
  if v_uid is null then
    return jsonb_build_object('error', 'not_authenticated');
  end if;
  if p_guess is null or p_guess < 1 or p_guess > 1000 then
    return jsonb_build_object('error', 'out_of_range');
  end if;

  v_week := public.endless_week(v_uid);

  select * into v_run from public.endless_runs
  where user_id = v_uid and week_start = v_week
  order by started_at desc limit 1 for update;

  if v_run.id is null then
    return jsonb_build_object('error', 'no_run');
  end if;
  if v_run.lives <= 0 or v_run.session_date is distinct from public.current_puzzle_date(v_uid) then
    return jsonb_build_object('error', 'no_session');
  end if;

  if exists (select 1 from public.endless_guesses
             where run_id = v_run.id and level = v_run.level and guess = p_guess) then
    return jsonb_build_object('error', 'duplicate_guess');
  end if;

  v_answer := public.endless_number(v_week, v_run.level);
  v_dist := abs(p_guess - v_answer);
  v_dir  := case when v_dist = 0 then 'correct'
                 when p_guess < v_answer then 'below' else 'above' end;
  v_tier := case
    when v_dist = 0    then 'correct'
    when v_dist <= 10  then 'intense'
    when v_dist <= 24  then 'dark'
    when v_dist <= 99  then 'medium'
    when v_dist <= 249 then 'light'
    when v_dist <= 499 then 'distant'
    else 'vast' end;

  v_index := v_run.attempts_used + 1;
  v_last  := v_index >= public.endless_attempts(v_run.level);

  insert into public.endless_guesses (run_id, level, guess_index, guess, direction, tier)
  values (v_run.id, v_run.level, v_index, p_guess, v_dir, v_tier);

  if v_dist = 0 then
    v_next := v_run.level + 1;
    if v_next > 100 then
      v_capped := true;
      update public.endless_runs set level = v_next, attempts_used = v_index, status = 'over'
      where id = v_run.id returning * into v_run;
    else
      update public.endless_runs set level = v_next, attempts_used = 0, clue_level = null
      where id = v_run.id returning * into v_run;
    end if;
  elsif v_last then
    -- The number stands. A life pays for another go at it.
    v_lost := true;
    delete from public.endless_guesses where run_id = v_run.id and level = v_run.level;
    update public.endless_runs set
      lives = greatest(0, lives - 1),
      attempts_used = 0,
      clue_level = null
    where id = v_run.id returning * into v_run;
  else
    update public.endless_runs set attempts_used = v_index
    where id = v_run.id returning * into v_run;
  end if;

  return jsonb_build_object(
    'solved', v_dist = 0,
    'lostLife', v_lost,
    'lives', v_run.lives,
    'sessionOver', v_lost and v_run.lives <= 0,
    'cleared', v_capped,
    'level', v_run.level,
    'attemptsUsed', v_run.attempts_used,
    'attemptsAllowed', public.endless_attempts(least(v_run.level, 100)),
    'guess', jsonb_build_object(
      'guess', p_guess, 'direction', v_dir, 'tier', v_tier,
      'isWithin10', v_dist > 0 and v_dist <= 10,
      'isOneAway',  v_dist = 1,
      'isCorrect',  v_dist = 0
    ),
    'answer', case when v_dist = 0 or v_lost then v_answer end
  );
end;
$$;

/** The week's board reads the climb rather than the best of many runs. */
create or replace function public.endless_leaderboard(p_limit integer default 50)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid  uuid := auth.uid();
  v_week date;
begin
  if v_uid is null then
    return jsonb_build_object('error', 'not_authenticated');
  end if;

  v_week := public.endless_week(v_uid);

  return jsonb_build_object(
    'week', v_week,
    'entries', coalesce((
      select jsonb_agg(e order by e.rank, e.name)
      from (
        select
          rank() over (order by max(r.level - 1) desc) as rank,
          coalesce(p.username, 'Player') as name,
          p.avatar,
          max(r.level - 1) as depth,
          r.user_id = v_uid as is_me
        from public.endless_runs r
        join public.profiles p on p.id = r.user_id
        where r.week_start = v_week
        group by r.user_id, p.username, p.avatar
        having max(r.level - 1) > 0
        order by max(r.level - 1) desc
        limit greatest(1, least(p_limit, 200))
      ) e
    ), '[]'::jsonb)
  );
end;
$$;

revoke execute on function public.endless_sessions_per_day()   from public, anon, authenticated;
revoke execute on function public.endless_lives_per_session()  from public, anon, authenticated;
revoke execute on function public.endless_climb(uuid)          from public, anon, authenticated;
revoke execute on function public.endless_sessions_left(uuid)  from public, anon;
revoke execute on function public.endless_start_session()      from public, anon;
revoke execute on function public.endless_state()              from public, anon;
revoke execute on function public.endless_guess(integer)       from public, anon;
grant execute on function public.endless_start_session() to authenticated;
grant execute on function public.endless_state()         to authenticated;
grant execute on function public.endless_guess(integer)  to authenticated;

/** The home and games rows read the climb, without starting a session. */
create or replace function public.home_status()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid    uuid := auth.uid();
  v_run    public.endless_runs%rowtype;
begin
  if v_uid is null then
    return jsonb_build_object('error', 'not_authenticated');
  end if;

  select * into v_run from public.endless_runs
  where user_id = v_uid and week_start = public.endless_week(v_uid)
  order by started_at desc limit 1;

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
    'ranked', jsonb_build_object(
      'rating', null, 'played', 0, 'queued', false, 'inMatch', false,
      'needsMe', false, 'beltHolder', null, 'iHoldBelt', false
    ),
    'impossible', jsonb_build_object(
      'sessionsLeft', public.endless_sessions_left(v_uid),
      'lives', coalesce(v_run.lives, 0),
      'level', coalesce(v_run.level, 1),
      'best', greatest(0, coalesce(v_run.level, 1) - 1)
    )
  );
end;
$$;

revoke execute on function public.home_status() from public, anon;
grant execute on function public.home_status() to authenticated;

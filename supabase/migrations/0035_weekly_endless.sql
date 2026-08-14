-- Endless becomes a weekly challenge on a shared sequence.
--
-- A private high score is solitaire: you beat six, then eight, then eleven, and
-- after that every run is a grind for +1 against a number nobody else can see.
-- Giving everyone the same sequence for the week turns depth into something
-- comparable - beating a friend's fourteen is the same task, not better luck.
--
-- Which is why this has to run on the server. A sequence generated on the
-- device would sit in the bundle for anyone curious enough to look, and a
-- leaderboard built on numbers the player already has is worth nothing.
--
-- Runs are unlimited. What is ranked is the deepest one, so a bad start costs
-- nothing but the time.

create table if not exists public.endless_runs (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  week_start    date not null,
  level         smallint not null default 1,
  attempts_used smallint not null default 0,
  clue1         text not null,
  clue2         text not null,
  clue2_unlocked boolean not null default false,
  status        text not null default 'active' check (status in ('active', 'over')),
  started_at    timestamptz not null default now(),
  ended_at      timestamptz
);

alter table public.endless_runs enable row level security;

drop policy if exists "read own endless runs" on public.endless_runs;
create policy "read own endless runs" on public.endless_runs
  for select using (auth.uid() = user_id);

create index if not exists endless_runs_week_idx on public.endless_runs (week_start, user_id);

create table if not exists public.endless_guesses (
  run_id      uuid not null references public.endless_runs(id) on delete cascade,
  level       smallint not null,
  guess_index smallint not null,
  guess       smallint not null,
  direction   text not null,
  tier        text not null,
  primary key (run_id, level, guess_index),
  unique (run_id, level, guess)
);

alter table public.endless_guesses enable row level security;

drop policy if exists "read own endless guesses" on public.endless_guesses;
create policy "read own endless guesses" on public.endless_guesses
  for select using (
    exists (select 1 from public.endless_runs r
            where r.id = run_id and r.user_id = auth.uid())
  );

/**
 * The number at a given depth in a given week. Same for everybody, drawn from
 * the week and the level, never sent to a client.
 */
create or replace function public.endless_number(p_week date, p_level integer)
returns smallint
language sql
immutable
as $$
  select (1 + abs(hashtext('within-endless:' || p_week::text || ':' || p_level::text)) % 1000)::smallint;
$$;

/** The rope shortens: seven attempts, losing one every two levels, floor of four. */
create or replace function public.endless_attempts(p_level integer)
returns smallint
language sql
immutable
as $$
  select greatest(4, 7 - ((p_level - 1) / 2))::smallint;
$$;

create or replace function public.endless_week(p_uid uuid)
returns date
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select date_trunc('week', public.current_puzzle_date(p_uid)::timestamp)::date;
$$;

/** The run in progress, or a fresh one. */
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
  v_n    smallint;
begin
  if v_uid is null then
    return jsonb_build_object('error', 'not_authenticated');
  end if;

  v_week := public.endless_week(v_uid);

  select * into v_run from public.endless_runs
  where user_id = v_uid and week_start = v_week and status = 'active'
  order by started_at desc limit 1;

  if v_run.id is null then
    v_n := public.endless_number(v_week, 1);
    insert into public.endless_runs (user_id, week_start, clue1, clue2)
    values (v_uid, v_week, public.pick_clue1(v_n), public.pick_clue2(v_n))
    returning * into v_run;
  end if;

  return jsonb_build_object(
    'week', v_week,
    'level', v_run.level,
    'attemptsUsed', v_run.attempts_used,
    'attemptsAllowed', public.endless_attempts(v_run.level),
    'clue1', v_run.clue1,
    'clue2', case when v_run.clue2_unlocked then v_run.clue2 end,
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
    -- Deepest this week, across every run.
    'best', coalesce((
      select max(level - 1) from public.endless_runs
      where user_id = v_uid and week_start = v_week
    ), 0)
  );
end;
$$;

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
begin
  if v_uid is null then
    return jsonb_build_object('error', 'not_authenticated');
  end if;
  if p_guess is null or p_guess < 1 or p_guess > 1000 then
    return jsonb_build_object('error', 'out_of_range');
  end if;

  v_week := public.endless_week(v_uid);

  select * into v_run from public.endless_runs
  where user_id = v_uid and week_start = v_week and status = 'active'
  order by started_at desc limit 1 for update;

  if v_run.id is null then
    return jsonb_build_object('error', 'no_run');
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
    -- On to the next number, with its own clues.
    v_next := v_run.level + 1;
    update public.endless_runs set
      level = v_next,
      attempts_used = 0,
      clue2_unlocked = false,
      clue1 = public.pick_clue1(public.endless_number(v_week, v_next)),
      clue2 = public.pick_clue2(public.endless_number(v_week, v_next))
    where id = v_run.id returning * into v_run;
  elsif v_last then
    update public.endless_runs set status = 'over', ended_at = now(), attempts_used = v_index
    where id = v_run.id returning * into v_run;
  else
    update public.endless_runs set
      attempts_used = v_index,
      clue2_unlocked = clue2_unlocked or v_dist <= 10
    where id = v_run.id returning * into v_run;
  end if;

  return jsonb_build_object(
    'solved', v_dist = 0,
    'runOver', v_run.status = 'over',
    'level', v_run.level,
    'attemptsUsed', v_run.attempts_used,
    'attemptsAllowed', public.endless_attempts(v_run.level),
    'guess', jsonb_build_object(
      'guess', p_guess, 'direction', v_dir, 'tier', v_tier,
      'isWithin10', v_dist > 0 and v_dist <= 10,
      'isOneAway',  v_dist = 1,
      'isCorrect',  v_dist = 0
    ),
    'answer', case when v_dist = 0 or v_run.status = 'over' then v_answer end
  );
end;
$$;

/** Start a fresh run. The old one is closed where it stands. */
create or replace function public.endless_restart()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid  uuid := auth.uid();
  v_week date;
  v_n    smallint;
begin
  if v_uid is null then
    return jsonb_build_object('error', 'not_authenticated');
  end if;

  v_week := public.endless_week(v_uid);

  update public.endless_runs set status = 'over', ended_at = now()
  where user_id = v_uid and week_start = v_week and status = 'active';

  v_n := public.endless_number(v_week, 1);
  insert into public.endless_runs (user_id, week_start, clue1, clue2)
  values (v_uid, v_week, public.pick_clue1(v_n), public.pick_clue2(v_n));

  return jsonb_build_object('ok', true);
end;
$$;

/** This week's deepest runs. Everyone played the same numbers. */
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
      select jsonb_agg(e order by e.rank)
      from (
        select
          rank() over (order by max(r.level - 1) desc) as rank,
          coalesce(p.username, 'Player') as name,
          max(r.level - 1) as depth,
          r.user_id = v_uid as is_me
        from public.endless_runs r
        join public.profiles p on p.id = r.user_id
        where r.week_start = v_week
        group by r.user_id, p.username
        having max(r.level - 1) > 0
        order by max(r.level - 1) desc
        limit greatest(1, least(p_limit, 200))
      ) e
    ), '[]'::jsonb)
  );
end;
$$;

revoke execute on function public.endless_number(date, integer) from public, anon, authenticated;
revoke execute on function public.endless_attempts(integer)     from public, anon;
revoke execute on function public.endless_week(uuid)            from public, anon;
revoke execute on function public.endless_state()               from public, anon;
revoke execute on function public.endless_guess(integer)        from public, anon;
revoke execute on function public.endless_restart()             from public, anon;
revoke execute on function public.endless_leaderboard(integer)  from public, anon;

grant execute on function public.endless_state()              to authenticated;
grant execute on function public.endless_guess(integer)       to authenticated;
grant execute on function public.endless_restart()            to authenticated;
grant execute on function public.endless_leaderboard(integer) to authenticated;

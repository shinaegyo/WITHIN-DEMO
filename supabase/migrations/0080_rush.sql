-- Rush: three minutes, as many numbers as you can find.
--
-- Every mode here is slow on purpose - seven attempts, one clue, think it
-- through - and none of them has ever asked anyone to hurry. This one is only
-- hurry. It also scales in a way the others do not: "nine in three minutes"
-- means the same thing to eighteen players and to fifty thousand, and a rank
-- among fifty thousand is worth more than a rank among eighteen, where the
-- board reads as an empty room.
--
-- Same numbers for everyone each day, which is what makes the score a
-- comparison rather than a story about luck - and which is also why there is
-- one scored run a day. A second run would be played against numbers already
-- seen, so the board would rank whoever retried most.
--
-- The clock belongs to the server. A timer the client owns is a timer the
-- client can stop, and the whole score is a function of it.

create table if not exists public.rush_runs (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  puzzle_date  date not null,
  started_at   timestamptz not null default now(),
  found        smallint not null default 0,
  -- Which number of the day's sequence they are on.
  position     smallint not null default 1,
  attempts     smallint not null default 0,
  unique (user_id, puzzle_date)
);

alter table public.rush_runs enable row level security;

create table if not exists public.rush_guesses (
  id         bigserial primary key,
  run_id     uuid not null references public.rush_runs(id) on delete cascade,
  position   smallint not null,
  guess      smallint not null,
  direction  text not null,
  tier       text not null,
  created_at timestamptz not null default now()
);

alter table public.rush_guesses enable row level security;

/** Three minutes, and the length of the whole mode. */
create or replace function public.rush_seconds() returns integer
language sql immutable as $$ select 180 $$;

/**
 * The day's sequence. Position 1 is the same number for everyone, and so is
 * position 20 for whoever gets that far.
 */
create or replace function public.rush_number(p_date date, p_position integer)
returns smallint
language sql
immutable
as $$
  select (1 + abs(hashtext('within-rush:' || p_date::text || ':' || p_position::text)) % 1000)::smallint;
$$;

/** Seconds left, or zero. Read from the row, never from the caller. */
create or replace function public.rush_left(p_run public.rush_runs)
returns integer
language sql
stable
as $$
  select greatest(0, public.rush_seconds()
                     - floor(extract(epoch from (now() - p_run.started_at)))::int);
$$;

/**
 * Starts today's run, or returns the one already going.
 *
 * Starting is what spends the day, and it cannot be undone: the clock runs from
 * here whether the app is open or not. That is the mode.
 */
create or replace function public.rush_start()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid  uuid := auth.uid();
  v_date date;
  v_run  public.rush_runs%rowtype;
begin
  if v_uid is null then
    return jsonb_build_object('error', 'not_authenticated');
  end if;

  v_date := public.current_puzzle_date(v_uid);

  select * into v_run from public.rush_runs
  where user_id = v_uid and puzzle_date = v_date;

  if v_run.id is null then
    insert into public.rush_runs (user_id, puzzle_date)
    values (v_uid, v_date)
    returning * into v_run;
    return jsonb_build_object('ok', true, 'resumed', false);
  end if;

  if public.rush_left(v_run) <= 0 then
    return jsonb_build_object('error', 'already_played');
  end if;

  return jsonb_build_object('ok', true, 'resumed', true);
end;
$$;

create or replace function public.rush_state()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid  uuid := auth.uid();
  v_date date;
  v_run  public.rush_runs%rowtype;
begin
  if v_uid is null then
    return jsonb_build_object('error', 'not_authenticated');
  end if;

  v_date := public.current_puzzle_date(v_uid);

  select * into v_run from public.rush_runs
  where user_id = v_uid and puzzle_date = v_date;

  if v_run.id is null then
    return jsonb_build_object(
      'started', false, 'over', false, 'found', 0,
      'secondsLeft', public.rush_seconds(), 'guesses', '[]'::jsonb
    );
  end if;

  return jsonb_build_object(
    'started', true,
    'over', public.rush_left(v_run) <= 0,
    'found', v_run.found,
    'secondsLeft', public.rush_left(v_run),
    -- Only the number in hand. The ones already found are done with.
    'guesses', coalesce((
      select jsonb_agg(jsonb_build_object(
               'guess', g.guess, 'direction', g.direction, 'tier', g.tier,
               'isCorrect', g.direction = 'correct',
               'isWithin10', abs(g.guess - public.rush_number(v_date, v_run.position)) <= 10
                             and g.direction <> 'correct',
               'isOneAway', abs(g.guess - public.rush_number(v_date, v_run.position)) = 1
             ) order by g.id)
      from public.rush_guesses g
      where g.run_id = v_run.id and g.position = v_run.position
    ), '[]'::jsonb)
  );
end;
$$;

/**
 * A guess. Unlimited per number - the clock is the only thing being spent, and
 * a wasted guess costs seconds, which is punishment enough.
 */
create or replace function public.rush_guess(p_guess integer)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid    uuid := auth.uid();
  v_date   date;
  v_run    public.rush_runs%rowtype;
  v_answer smallint;
  v_dist   integer;
  v_dir    text;
  v_tier   text;
begin
  if v_uid is null then
    return jsonb_build_object('error', 'not_authenticated');
  end if;
  if p_guess is null or p_guess < 1 or p_guess > 1000 then
    return jsonb_build_object('error', 'out_of_range');
  end if;

  v_date := public.current_puzzle_date(v_uid);

  select * into v_run from public.rush_runs
  where user_id = v_uid and puzzle_date = v_date
  for update;

  if v_run.id is null then
    return jsonb_build_object('error', 'no_run');
  end if;
  if public.rush_left(v_run) <= 0 then
    return jsonb_build_object('error', 'time_up');
  end if;

  v_answer := public.rush_number(v_date, v_run.position);
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

  insert into public.rush_guesses (run_id, position, guess, direction, tier)
  values (v_run.id, v_run.position, p_guess, v_dir, v_tier);

  if v_dist = 0 then
    update public.rush_runs set
      found = found + 1,
      position = position + 1,
      attempts = attempts + 1
    where id = v_run.id returning * into v_run;
    perform public.award_xp(v_uid, 15);
  else
    update public.rush_runs set attempts = attempts + 1
    where id = v_run.id returning * into v_run;
  end if;

  return jsonb_build_object(
    'solved', v_dist = 0,
    'found', v_run.found,
    'secondsLeft', public.rush_left(v_run),
    'over', public.rush_left(v_run) <= 0,
    'guess', jsonb_build_object(
      'guess', p_guess, 'direction', v_dir, 'tier', v_tier,
      'isWithin10', v_dist > 0 and v_dist <= 10,
      'isOneAway',  v_dist = 1,
      'isCorrect',  v_dist = 0
    ),
    'answer', case when v_dist = 0 then v_answer end
  );
end;
$$;

/** Today's scores. Ties share a rank, as everywhere else. */
create or replace function public.rush_leaderboard(p_limit integer default 50)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid  uuid := auth.uid();
  v_date date;
begin
  if v_uid is null then
    return jsonb_build_object('error', 'not_authenticated');
  end if;

  v_date := public.current_puzzle_date(v_uid);

  return jsonb_build_object(
    'date', v_date,
    'entries', coalesce((
      select jsonb_agg(e order by e.rank, e.name)
      from (
        select
          rank() over (order by r.found desc, r.started_at) as rank,
          p.username as name,
          p.avatar,
          r.found,
          r.user_id = v_uid as is_me
        from public.rush_runs r
        join public.profiles p on p.id = r.user_id
        where r.puzzle_date = v_date
          and p.username is not null
          and r.found > 0
        order by r.found desc, r.started_at
        limit greatest(1, least(p_limit, 200))
      ) e
    ), '[]'::jsonb)
  );
end;
$$;

revoke execute on function public.rush_number(date, integer)   from public, anon, authenticated;
revoke execute on function public.rush_left(public.rush_runs)  from public, anon, authenticated;
revoke execute on function public.rush_seconds()               from public, anon;
revoke execute on function public.rush_start()                 from public, anon;
revoke execute on function public.rush_state()                 from public, anon;
revoke execute on function public.rush_guess(integer)          from public, anon;
revoke execute on function public.rush_leaderboard(integer)    from public, anon;
grant execute on function public.rush_seconds()             to authenticated;
grant execute on function public.rush_start()               to authenticated;
grant execute on function public.rush_state()               to authenticated;
grant execute on function public.rush_guess(integer)        to authenticated;
grant execute on function public.rush_leaderboard(integer)  to authenticated;

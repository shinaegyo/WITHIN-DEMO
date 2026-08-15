-- Window: three probes, then commit to a range.
--
-- Every other mode asks for the number. This one asks how sure you are: three
-- guesses answered with the usual bands, and then a span - 525 to 560 - that
-- the number has to be inside. Narrower scores more. Miss and it is nothing.
--
--   score = 101 - width, when the number is inside
--
-- One rule, and the whole mode sits in it. Three probes leave a range you know
-- is safe; taking it is worth what it is worth, and cutting it in half is worth
-- twice that with everything at stake. That decision is different every day and
-- it is the only place in the game where a player prices their own confidence.
--
-- It is also the app's name. Is it within?

create table if not exists public.window_runs (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  puzzle_date  date not null,
  started_at   timestamptz not null default now(),
  probes_used  smallint not null default 0,
  lo           smallint,
  hi           smallint,
  submitted_at timestamptz,
  score        smallint not null default 0,
  unique (user_id, puzzle_date)
);

alter table public.window_runs enable row level security;

create table if not exists public.window_probes (
  id         bigserial primary key,
  run_id     uuid not null references public.window_runs(id) on delete cascade,
  idx        smallint not null,
  guess      smallint not null,
  direction  text not null,
  tier       text not null,
  created_at timestamptz not null default now()
);

alter table public.window_probes enable row level security;

/** Three. Enough to reach a tight range, few enough that the choice still bites. */
create or replace function public.window_probes_allowed() returns smallint
language sql immutable as $$ select 3::smallint $$;

/** The widest span worth submitting: at 101 the score would be zero anyway. */
create or replace function public.window_max_width() returns smallint
language sql immutable as $$ select 100::smallint $$;

/** The day's number, the same for everyone. */
create or replace function public.window_number(p_date date)
returns smallint
language sql
immutable
as $$
  select (1 + abs(hashtext('within-window:' || p_date::text)) % 1000)::smallint;
$$;

create or replace function public.window_state()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid  uuid := auth.uid();
  v_date date;
  v_run  public.window_runs%rowtype;
begin
  if v_uid is null then
    return jsonb_build_object('error', 'not_authenticated');
  end if;

  v_date := public.current_puzzle_date(v_uid);

  select * into v_run from public.window_runs
  where user_id = v_uid and puzzle_date = v_date;

  if v_run.id is null then
    return jsonb_build_object(
      'started', false, 'submitted', false,
      'probesLeft', public.window_probes_allowed(),
      'probes', '[]'::jsonb, 'maxWidth', public.window_max_width()
    );
  end if;

  return jsonb_build_object(
    'started', true,
    'submitted', v_run.submitted_at is not null,
    'probesLeft', greatest(0, public.window_probes_allowed() - v_run.probes_used),
    'maxWidth', public.window_max_width(),
    'lo', v_run.lo,
    'hi', v_run.hi,
    'width', case when v_run.lo is not null then v_run.hi - v_run.lo + 1 end,
    'score', v_run.score,
    -- Only once it is over, and only then.
    'answer', case when v_run.submitted_at is not null
                   then public.window_number(v_date) end,
    'probes', coalesce((
      select jsonb_agg(jsonb_build_object(
               'guess', p.guess, 'direction', p.direction, 'tier', p.tier,
               'isCorrect', p.direction = 'correct',
               'isWithin10', abs(p.guess - public.window_number(v_date)) <= 10
                             and p.direction <> 'correct',
               'isOneAway', abs(p.guess - public.window_number(v_date)) = 1
             ) order by p.idx)
      from public.window_probes p where p.run_id = v_run.id
    ), '[]'::jsonb)
  );
end;
$$;

/** A probe. Answered like any other guess, and it never ends the round. */
create or replace function public.window_probe(p_guess integer)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid    uuid := auth.uid();
  v_date   date;
  v_run    public.window_runs%rowtype;
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

  insert into public.window_runs (user_id, puzzle_date)
  values (v_uid, v_date)
  on conflict (user_id, puzzle_date) do nothing;

  select * into v_run from public.window_runs
  where user_id = v_uid and puzzle_date = v_date
  for update;

  if v_run.submitted_at is not null then
    return jsonb_build_object('error', 'already_played');
  end if;
  if v_run.probes_used >= public.window_probes_allowed() then
    return jsonb_build_object('error', 'no_probes_left');
  end if;
  if exists (select 1 from public.window_probes
             where run_id = v_run.id and guess = p_guess) then
    return jsonb_build_object('error', 'duplicate_guess');
  end if;

  v_answer := public.window_number(v_date);
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

  insert into public.window_probes (run_id, idx, guess, direction, tier)
  values (v_run.id, v_run.probes_used + 1, p_guess, v_dir, v_tier);

  update public.window_runs r set probes_used = r.probes_used + 1
  where r.id = v_run.id returning r.* into v_run;

  return jsonb_build_object(
    'probesLeft', greatest(0, public.window_probes_allowed() - v_run.probes_used),
    'guess', jsonb_build_object(
      'guess', p_guess, 'direction', v_dir, 'tier', v_tier,
      'isWithin10', v_dist > 0 and v_dist <= 10,
      'isOneAway',  v_dist = 1,
      'isCorrect',  v_dist = 0
    )
  );
end;
$$;

/**
 * The commitment. One span, once, and the day is done either way.
 *
 * A probe that lands on the number does not end the round and does not score by
 * itself - the score is the window, so somebody who finds it still has to say
 * so by submitting a span of one.
 */
create or replace function public.window_submit(p_lo integer, p_hi integer)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid    uuid := auth.uid();
  v_date   date;
  v_run    public.window_runs%rowtype;
  v_answer smallint;
  v_width  integer;
  v_score  integer;
  v_inside boolean;
begin
  if v_uid is null then
    return jsonb_build_object('error', 'not_authenticated');
  end if;
  if p_lo is null or p_hi is null or p_lo < 1 or p_hi > 1000 or p_lo > p_hi then
    return jsonb_build_object('error', 'out_of_range');
  end if;

  v_width := p_hi - p_lo + 1;
  if v_width > public.window_max_width() then
    return jsonb_build_object('error', 'too_wide');
  end if;

  v_date := public.current_puzzle_date(v_uid);

  insert into public.window_runs (user_id, puzzle_date)
  values (v_uid, v_date)
  on conflict (user_id, puzzle_date) do nothing;

  select * into v_run from public.window_runs
  where user_id = v_uid and puzzle_date = v_date
  for update;

  if v_run.submitted_at is not null then
    return jsonb_build_object('error', 'already_played');
  end if;

  v_answer := public.window_number(v_date);
  v_inside := v_answer between p_lo and p_hi;
  v_score := case when v_inside then greatest(0, 101 - v_width) else 0 end;

  update public.window_runs r set
    lo = p_lo, hi = p_hi, submitted_at = now(), score = v_score
  where r.id = v_run.id returning r.* into v_run;

  if v_score > 0 then
    perform public.award_xp(v_uid, v_score);
  end if;

  return jsonb_build_object(
    'inside', v_inside,
    'width', v_width,
    'score', v_score,
    'answer', v_answer
  );
end;
$$;

/** Today's scores. Ties break on the narrower window, then on who committed first. */
create or replace function public.window_leaderboard(p_limit integer default 20)
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
          rank() over (order by r.score desc, (r.hi - r.lo) asc, r.submitted_at asc) as rank,
          p.username as name,
          p.avatar,
          r.score,
          (r.hi - r.lo + 1) as width,
          r.user_id = v_uid as is_me
        from public.window_runs r
        join public.profiles p on p.id = r.user_id
        where r.puzzle_date = v_date
          and r.submitted_at is not null
          and p.username is not null
        order by r.score desc, (r.hi - r.lo) asc, r.submitted_at asc
        limit greatest(1, least(p_limit, 200))
      ) e
    ), '[]'::jsonb)
  );
end;
$$;

revoke execute on function public.window_number(date)            from public, anon, authenticated;
revoke execute on function public.window_probes_allowed()        from public, anon;
revoke execute on function public.window_max_width()             from public, anon;
revoke execute on function public.window_state()                 from public, anon;
revoke execute on function public.window_probe(integer)          from public, anon;
revoke execute on function public.window_submit(integer,integer) from public, anon;
revoke execute on function public.window_leaderboard(integer)    from public, anon;
grant execute on function public.window_probes_allowed()        to authenticated;
grant execute on function public.window_max_width()             to authenticated;
grant execute on function public.window_state()                 to authenticated;
grant execute on function public.window_probe(integer)          to authenticated;
grant execute on function public.window_submit(integer,integer) to authenticated;
grant execute on function public.window_leaderboard(integer)    to authenticated;

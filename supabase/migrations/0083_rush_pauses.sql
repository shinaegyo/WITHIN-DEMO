-- Leaving stops the clock; coming back starts it again.
--
-- One run a day and a clock that never stops meant a phone call cost the whole
-- mode until tomorrow. Nobody will forgive that, and nobody should have to.
--
-- Pausing is recorded rather than trusted: the client says it has gone away and
-- the server writes down when, then adds the gap to a total it subtracts from
-- the elapsed time. A guess cannot arrive while paused, so the pause cannot be
-- used as a place to stand and think with the timer stopped and the board still
-- accepting answers.
--
-- A pause expires after an hour. A run left open forever would otherwise sit
-- there indefinitely and could be resumed against numbers that were today's
-- when it started and are not any more.

alter table public.rush_runs add column if not exists paused_at timestamptz;
alter table public.rush_runs add column if not exists paused_seconds integer not null default 0;

/** The longest a single pause holds the clock before it starts again by itself. */
create or replace function public.rush_max_pause() returns interval
language sql immutable as $$ select interval '1 hour' $$;

/**
 * Seconds left, with paused time given back.
 *
 * While paused the clock reads whatever it read when the player left - the
 * elapsed time is measured to paused_at rather than to now.
 */
create or replace function public.rush_left(p_run public.rush_runs)
returns integer
language sql
stable
as $$
  select greatest(0, public.rush_seconds() - floor(extract(epoch from (
    case
      when p_run.paused_at is not null
       and now() - p_run.paused_at <= public.rush_max_pause()
        then p_run.paused_at - p_run.started_at
      -- A pause that outlived its hour: the clock ran on without them.
      when p_run.paused_at is not null
        then p_run.paused_at - p_run.started_at + (now() - p_run.paused_at - public.rush_max_pause())
      else now() - p_run.started_at
    end
  )))::int + p_run.paused_seconds);
$$;

create or replace function public.rush_pause()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_run public.rush_runs%rowtype;
begin
  if v_uid is null then
    return jsonb_build_object('error', 'not_authenticated');
  end if;

  select * into v_run from public.rush_runs
  where user_id = v_uid and puzzle_date = public.current_puzzle_date(v_uid)
  for update;

  if v_run.id is null then
    return jsonb_build_object('error', 'no_run');
  end if;
  -- Nothing to stop: already stopped, or already finished.
  if v_run.paused_at is not null or public.rush_left(v_run) <= 0 then
    return jsonb_build_object('ok', true, 'secondsLeft', public.rush_left(v_run));
  end if;

  update public.rush_runs set paused_at = now() where id = v_run.id
  returning * into v_run;

  return jsonb_build_object('ok', true, 'secondsLeft', public.rush_left(v_run));
end;
$$;

/** Starts the clock again, and only the client's countdown decides when. */
create or replace function public.rush_resume()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_run public.rush_runs%rowtype;
  v_gap integer;
begin
  if v_uid is null then
    return jsonb_build_object('error', 'not_authenticated');
  end if;

  select * into v_run from public.rush_runs
  where user_id = v_uid and puzzle_date = public.current_puzzle_date(v_uid)
  for update;

  if v_run.id is null then
    return jsonb_build_object('error', 'no_run');
  end if;
  if v_run.paused_at is null then
    return jsonb_build_object('ok', true, 'secondsLeft', public.rush_left(v_run));
  end if;

  -- Only the time actually away, and never more than a pause is allowed to
  -- hold: past that the clock has already been running without them.
  v_gap := least(
    floor(extract(epoch from (now() - v_run.paused_at)))::int,
    floor(extract(epoch from public.rush_max_pause()))::int
  );

  update public.rush_runs set
    paused_seconds = paused_seconds + v_gap,
    paused_at = null
  where id = v_run.id returning * into v_run;

  return jsonb_build_object('ok', true, 'secondsLeft', public.rush_left(v_run));
end;
$$;

/** A guess cannot arrive while the clock is stopped. */
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
  if v_run.paused_at is not null then
    return jsonb_build_object('error', 'paused');
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

  if exists (select 1 from public.rush_guesses g
             where g.run_id = v_run.id and g.position = v_run.position
               and g.guess = p_guess) then
    return jsonb_build_object(
      'solved', false,
      'found', v_run.found,
      'secondsLeft', public.rush_left(v_run),
      'over', public.rush_left(v_run) <= 0,
      'guess', jsonb_build_object(
        'guess', p_guess, 'direction', v_dir, 'tier', v_tier,
        'isWithin10', v_dist > 0 and v_dist <= 10,
        'isOneAway',  v_dist = 1,
        'isCorrect',  false
      ),
      'answer', null
    );
  end if;

  insert into public.rush_guesses (run_id, position, guess, direction, tier)
  values (v_run.id, v_run.position, p_guess, v_dir, v_tier);

  if v_dist = 0 then
    update public.rush_runs r set
      found = r.found + 1,
      position = r.position + 1,
      attempts = r.attempts + 1
    where r.id = v_run.id returning r.* into v_run;

    if v_run.found <= 12 then
      perform public.award_xp(v_uid, 15);
    end if;
  else
    update public.rush_runs r set attempts = r.attempts + 1
    where r.id = v_run.id returning r.* into v_run;
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

/** The state has to say whether the clock is stopped, or nothing can resume. */
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
      'started', false, 'over', false, 'paused', false, 'found', 0,
      'secondsLeft', public.rush_seconds(), 'guesses', '[]'::jsonb
    );
  end if;

  return jsonb_build_object(
    'started', true,
    'over', public.rush_left(v_run) <= 0,
    'paused', v_run.paused_at is not null and public.rush_left(v_run) > 0,
    'found', v_run.found,
    'secondsLeft', public.rush_left(v_run),
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

revoke execute on function public.rush_max_pause()             from public, anon;
revoke execute on function public.rush_left(public.rush_runs)  from public, anon, authenticated;
revoke execute on function public.rush_pause()                 from public, anon;
revoke execute on function public.rush_resume()                from public, anon;
revoke execute on function public.rush_guess(integer)          from public, anon;
revoke execute on function public.rush_state()                 from public, anon;
grant execute on function public.rush_pause()        to authenticated;
grant execute on function public.rush_resume()       to authenticated;
grant execute on function public.rush_guess(integer) to authenticated;
grant execute on function public.rush_state()        to authenticated;

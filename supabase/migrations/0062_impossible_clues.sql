-- Impossible: the clue arrives late, and it is about where you are.
--
-- A clue at the start of a level is a clue about a thousand numbers, which is
-- worth almost nothing and is read as noise. Held back, it lands when the
-- allowance is nearly gone and the player has already narrowed the field - and
-- there it is worth about a guess, which is precisely what the deeper levels
-- take away.
--
--   levels 1-9    the clue is there from the start; nothing is tight yet
--   levels 10-89  it appears for the last three attempts
--   levels 90-100 it appears for the last attempt only
--
-- It is also computed against what the player has already learned rather than
-- against the whole range. Somebody 11-24 away from 107 having guessed 130 is
-- choosing between about a dozen numbers; "the number is odd" halves that, and
-- "it has three digits" tells them nothing they did not know.

/** How many attempts remain before the clue is worth showing. */
create or replace function public.endless_clue_at(p_level integer)
returns smallint
language sql
immutable
as $$
  select (case
    when p_level <= 9  then 99   -- always
    when p_level <= 89 then 3
    else 1
  end)::smallint;
$$;

/**
 * The range the player could still be choosing between, from their own guesses.
 *
 * Every guess carries a direction and a band, and both are already stored, so
 * the window can be rebuilt rather than tracked - which keeps it honest even if
 * a guess is ever inserted by some other path.
 */
create or replace function public.endless_window(p_run uuid, p_level integer)
returns int[]
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_lo int := 1;
  v_hi int := 1000;
  g    record;
  b_lo int;
  b_hi int;
begin
  for g in
    select guess, direction, tier from public.endless_guesses
    where run_id = p_run and level = p_level
  loop
    b_lo := case g.tier when 'intense' then 1 when 'dark' then 11 when 'medium' then 25
                        when 'light' then 100 when 'distant' then 250 else 500 end;
    b_hi := case g.tier when 'intense' then 10 when 'dark' then 24 when 'medium' then 99
                        when 'light' then 249 when 'distant' then 499 else 999 end;

    if g.direction = 'below' then       -- the answer is above the guess
      v_lo := greatest(v_lo, g.guess + b_lo);
      v_hi := least(v_hi, g.guess + b_hi);
    elsif g.direction = 'above' then
      v_hi := least(v_hi, g.guess - b_lo);
      v_lo := greatest(v_lo, g.guess - b_hi);
    end if;
  end loop;

  return array[greatest(1, v_lo), least(1000, v_hi)];
end;
$$;

/**
 * A clue chosen for the window the player is actually in.
 *
 * Kept only if it rules out between a fifth and four fifths of what is left:
 * less is a sentence that changes nothing, more is being handed the answer.
 */
create or replace function public.live_clue(p_answer integer, p_lo integer, p_hi integer)
returns text
language plpgsql
volatile
as $$
declare
  best  text := null;
  best_gap numeric := 1;
  span  int := greatest(1, p_hi - p_lo + 1);
  hits  int;
  share numeric;
  c     record;
begin
  for c in select code from public.clue_coverage loop
    if public.clue_holds(p_answer, c.code) then
      select count(*) into hits from generate_series(p_lo, p_hi) g
      where public.clue_holds(g, c.code);

      share := hits::numeric / span;
      -- Closest to halving the window wins.
      if share between 0.2 and 0.8 and abs(share - 0.5) < best_gap then
        best_gap := abs(share - 0.5);
        best := c.code;
      end if;
    end if;
  end loop;

  -- Nothing discriminates: say something true rather than nothing at all.
  if best is null then
    return public.pick_clue1(p_answer);
  end if;

  return public.clue_text(best);
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
  v_n    smallint;
  v_left int;
  v_win  int[];
  v_clue text := null;
  v_show boolean;
begin
  if v_uid is null then
    return jsonb_build_object('error', 'not_authenticated');
  end if;

  v_week := public.endless_week(v_uid);
  v_left := public.endless_runs_left(v_uid);

  select * into v_run from public.endless_runs
  where user_id = v_uid and week_start = v_week and status = 'active'
  order by started_at desc limit 1;

  if v_run.id is null and v_left > 0 then
    v_n := public.endless_number(v_week, 1);
    insert into public.endless_runs (user_id, week_start, run_date, clue1)
    values (v_uid, v_week, public.current_puzzle_date(v_uid), public.pick_clue1(v_n))
    returning * into v_run;
    v_left := v_left - 1;
  end if;

  if v_run.id is not null then
    -- Shown only once the allowance is nearly gone, and then computed against
    -- the window the player has already narrowed to.
    v_show := (public.endless_attempts(v_run.level) - v_run.attempts_used)
              <= public.endless_clue_at(v_run.level);
    if v_show then
      v_win := public.endless_window(v_run.id, v_run.level);
      v_clue := public.live_clue(public.endless_number(v_week, v_run.level), v_win[1], v_win[2]);
    end if;
  end if;

  return jsonb_build_object(
    'week', v_week,
    'runsLeft', v_left,
    'hasRun', v_run.id is not null,
    'level', coalesce(v_run.level, 1),
    'attemptsUsed', coalesce(v_run.attempts_used, 0),
    'attemptsAllowed', public.endless_attempts(coalesce(v_run.level, 1)),
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
    'best', coalesce((
      select max(level - 1) from public.endless_runs
      where user_id = v_uid and week_start = v_week
    ), 0)
  );
end;
$$;

revoke execute on function public.endless_clue_at(integer)              from public, anon, authenticated;
revoke execute on function public.endless_window(uuid, integer)         from public, anon, authenticated;
revoke execute on function public.live_clue(integer, integer, integer)  from public, anon, authenticated;
revoke execute on function public.endless_state()                       from public, anon;
grant execute on function public.endless_state() to authenticated;

/** The weekly board, with the faces that belong to the names. */
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

revoke execute on function public.endless_leaderboard(integer) from public, anon;
grant execute on function public.endless_leaderboard(integer) to authenticated;

-- The same two clues, alternating. The catalogue was never the problem.
--
-- clue_at_strength narrows to the clues nearest the strength asked for and
-- picks one by hashing the answer, the window and the target. The caller told
-- it one thing to avoid: the family of the clue before. With a pool that two
-- families dominate, that rule does not create variety, it enforces a loop -
-- X, then avoid X so Y, then avoid Y so X is free again, and the hash returns
-- the same X because none of its inputs have changed. The rule meant to stop
-- repetition was the thing producing it.
--
-- Three changes.
--
-- The run remembers the last eight clue CODES and every one is excluded, so a
-- clue cannot come back until eight others have been in front of it. A family
-- is a category; a code is the actual sentence, and the sentence is what the
-- player is reading twice.
--
-- The candidate pool goes from the ten nearest to the twenty-four nearest.
-- Excluding eight codes from a pool of ten can empty it; from twenty-four it
-- cannot.
--
-- And clue_at_strength returns the code alongside the text and the family, so
-- the caller has something to remember. Dropped and recreated rather than
-- overloaded: a five-argument and a six-argument version of the same function
-- is an ambiguity waiting to resolve the wrong way.
--
-- endless_state is 0095's, extracted verbatim, with the recent codes passed in
-- and appended on the way out.

alter table public.endless_runs
  add column if not exists clue_recent text[] not null default '{}';

drop function if exists public.clue_at_strength(integer,integer,integer,numeric,text);

create or replace function public.clue_at_strength(
  p_answer integer,
  p_lo integer,
  p_hi integer,
  p_target numeric default 0.5,
  p_avoid_family text default null,
  p_avoid_codes text[] default '{}'
)
returns text[]
language plpgsql
volatile
as $$
declare
  lo   int := greatest(1, coalesce(p_lo, 1));
  hi   int := least(1000, coalesce(p_hi, 1000));
  span int;
  pick text;
begin
  span := greatest(1, hi - lo + 1);

  with mine as (
    select code from public.clue_members where n = p_answer
  ),
  scored as (
    select m.code,
           (select count(*) from public.clue_members cm
             where cm.code = m.code and cm.n between lo and hi)::numeric / span as share
    from mine m
    where (p_avoid_family is null or public.clue_family(m.code) <> p_avoid_family)
      and not (m.code = any(coalesce(p_avoid_codes, '{}'::text[])))
  ),
  usable as (
    -- Never everything and never nothing: one is a sentence, the other is the
    -- answer handed over.
    select code, share from scored
    where share > 0.05 and share < 0.95
    order by abs(share - p_target), code
    limit 24
  ),
  numbered as (
    select code, row_number() over (order by abs(share - p_target), code) - 1 as i,
           count(*) over () as n
    from usable
  )
  select code into pick from numbered
  where i = abs(hashtext('within-clue:' || p_answer || ':' || lo || ':' || hi || ':' || p_target))
        % greatest(1, (select max(n) from numbered));

  -- Loosened one constraint at a time, weakest first. Repeating a family is a
  -- blemish; repeating the sentence is the bug, so the codes are the last
  -- thing given up.
  if pick is null and p_avoid_family is not null then
    return public.clue_at_strength(p_answer, lo, hi, p_target, null, p_avoid_codes);
  end if;

  if pick is null and coalesce(array_length(p_avoid_codes, 1), 0) > 0 then
    return public.clue_at_strength(p_answer, lo, hi, p_target, null, '{}'::text[]);
  end if;

  if pick is null then
    return array['It is between 1 and 1000.', 'shape', 'span-all'];
  end if;

  return array[public.clue_text(pick), public.clue_family(pick), pick];
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
  v_show boolean;
  v_clue text;
  v_win  int[];
  v_pick text[];
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
      v_pick := public.clue_at_strength(
        public.endless_number(v_week, v_run.level),
        v_win[1], v_win[2],
        public.endless_clue_target(v_run.level),
        v_run.clue_family,
        v_run.clue_recent
      );

      update public.endless_runs set
        clue1 = v_pick[1],
        clue_family = v_pick[2],
        clue_level = v_run.level,
        -- The last eight codes, as a sliding window: append, then drop
        -- everything before the tail.
        clue_recent = array(
          -- with ordinality and an explicit order: a bare unnest happens to
          -- come back in order and is not promised to, and this array is the
          -- whole anti-repeat mechanism.
          select u from unnest(v_run.clue_recent || v_pick[3]) with ordinality t(u, o)
          order by o
          offset greatest(0, coalesce(array_length(v_run.clue_recent, 1), 0) + 1 - 8)
        )
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
    'best', greatest(0, v_run.best_level - 1)
  );
end;
$$;

revoke execute on function public.clue_at_strength(integer,integer,integer,numeric,text,text[])
  from public, anon, authenticated;
revoke execute on function public.endless_state() from public, anon;
grant execute on function public.endless_state() to authenticated;

-- The climb stops handing over near-answers.
--
-- "Its second digit is a 4" leaves ninety numbers of a thousand standing. That
-- is not a clue, it is most of the answer, and the climb was serving them: the
-- target asked for 0.70 and what arrived ranged from 0.09 to 0.73, because
-- clue_at_strength takes the clue nearest the target from the ones the answer
-- happens to belong to, and for many numbers the weakest available is still
-- very strong.
--
-- So the climb now names a floor as well as a target. Nothing below half the
-- field standing, nothing above nine tenths - weak enough to be worth reading,
-- never strong enough to end the level on its own.
--
-- The bounds are parameters with defaults rather than a change to the filter,
-- because clue_at_strength is shared: the daily puzzle generator, both duel
-- clue paths and the climb all call it. Editing the filter in place would have
-- quietly reshaped the daily's clues too, which nobody asked for. Only
-- endless_state passes the new arguments; every other caller keeps 0.05 to
-- 0.95 exactly as before.
--
-- The six-argument signature is dropped first. Adding defaulted parameters to
-- a function creates an overload rather than replacing it, and the old one
-- would then make every five- and six-argument call ambiguous.
--
-- If a number has no clue at all between the bounds, none is shown. That is
-- the honest outcome and the screen already handles a null clue - better a
-- level with nothing than a level with the answer.

begin;

drop function if exists public.clue_at_strength(integer,integer,integer,numeric,text,text[]);

create or replace function public.clue_at_strength(
  p_answer integer,
  p_lo integer,
  p_hi integer,
  p_target numeric default 0.5,
  p_avoid_family text default null,
  p_avoid_codes text[] default '{}',
  p_min_share numeric default 0.05,
  p_max_share numeric default 0.95
)
returns text[]
language plpgsql
volatile
as $fn$
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
    -- answer handed over. The caller may narrow this further - the climb does,
    -- to keep a clue from being most of the answer.
    select code, share from scored
    where share > coalesce(p_min_share, 0.05) and share < coalesce(p_max_share, 0.95)
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
  -- thing given up. The share bounds are never loosened - they are the point.
  if pick is null and p_avoid_family is not null then
    return public.clue_at_strength(p_answer, lo, hi, p_target, null, p_avoid_codes,
                                   p_min_share, p_max_share);
  end if;

  if pick is null and coalesce(array_length(p_avoid_codes, 1), 0) > 0 then
    return public.clue_at_strength(p_answer, lo, hi, p_target, null, '{}'::text[],
                                   p_min_share, p_max_share);
  end if;

  -- Nothing in range. A caller that set a floor gets no clue rather than a
  -- filler sentence; the default callers keep the sentence they always had.
  if pick is null then
    if coalesce(p_min_share, 0.05) > 0.05 then
      return null;
    end if;
    return array['It is between 1 and 1000.', 'shape', 'span-all'];
  end if;

  return array[public.clue_text(pick), public.clue_family(pick), pick];
end;
$fn$;

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
  v_lvl  smallint;
begin
  if v_uid is null then
    return jsonb_build_object('error', 'not_authenticated');
  end if;

  v_week := public.endless_week(v_uid);
  v_run  := public.endless_climb(v_uid);
  v_lvl  := least(v_run.level, public.endless_max_level());

  v_show := (public.endless_attempts(v_lvl) - v_run.attempts_used)
            <= public.endless_clue_at(v_lvl);

  if v_show and v_run.health > 0 and v_run.summit_at is null then
    if v_run.clue_level is distinct from v_run.level then
      v_win := public.endless_window(v_run.id, v_run.level);
      v_pick := public.clue_at_strength(
        public.endless_number(v_week, v_run.level),
        v_win[1], v_win[2],
        public.endless_clue_target(v_run.level),
        v_run.clue_family,
        v_run.clue_recent,
        0.50,   -- nothing that leaves less than half the field standing
        0.90    -- nor anything so weak it is not worth reading
      );

      update public.endless_runs set
        clue1 = v_pick[1],
        clue_family = v_pick[2],
        clue_level = v_run.level,
        clue_recent = array(
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
    'maxLevel', public.endless_max_level(),
    'health', v_run.health,
    'fall', public.endless_fall(v_lvl),
    'summit', v_run.summit_at is not null,
    'guessesUsed', v_run.guesses_used,
    'lives', v_run.lives,
    'sessionsLeft', public.endless_sessions_left(v_uid),
    'inSession', v_run.health > 0 and v_run.summit_at is null
                 and v_run.session_date = public.current_puzzle_date(v_uid),
    'attemptsUsed', v_run.attempts_used,
    'attemptsAllowed', public.endless_attempts(v_lvl),
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

revoke execute on function
  public.clue_at_strength(integer,integer,integer,numeric,text,text[],numeric,numeric)
  from public, anon, authenticated;
revoke execute on function public.endless_state() from public, anon;
grant  execute on function public.endless_state() to authenticated;

commit;

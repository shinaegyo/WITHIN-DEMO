-- Thin air tells you how close, never which way.
--
-- Levels 46 to 60 keep all five guesses and every one of them still reports
-- something - the shade lands immediately, as it does in the Sky. What goes is
-- the arrow.
--
-- Which turns it into a different search rather than a smaller one. With a
-- direction you are narrowing a single interval. Without one, every guess
-- leaves two candidate ranges, one either side, and the level becomes a matter
-- of intersecting sets across probes. That is a different kind of thinking,
-- which is the thing the middle of the climb was missing.
--
-- Modelled before building, against the same measured band widths: a
-- direction-less search needs about one more guess than a normal one - median
-- 7 against 6 - and fails at five attempts roughly 79% of the time against
-- 57%. A real step up and not a cliff; four attempts, for comparison, is 93%.
-- That figure comes from a solver that picks each probe to split the candidate
-- set worst-case-best, so a person will do worse and 79% is a floor.
--
-- Deliberately not withheld: how close. isWithin10 and isOneAway stay true,
-- because closeness is exactly what this tier still gives you. ONE AWAY with
-- no arrow leaves two numbers, which is the puzzle working.
--
-- The tile has no hue in this tier. Blue and red mean "aim up" and "aim down"
-- everywhere else, so reusing either for distance alone would actively
-- mislead, and the palette has two hues on purpose. The colour drains out and
-- intensity carries closeness by itself.
--
-- The true direction is still written to endless_guesses, which has a check
-- constraint on it and which the server needs in order to narrow anything.
-- Only the reply and the board are masked.

begin;

/** Which levels withhold the arrow. Thin air, and only it. */
create or replace function public.endless_hides_direction(p_level integer)
returns boolean
language sql
immutable
as $fn$ select p_level between 46 and 60 $fn$;

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
  v_floor  smallint;
  v_fall   smallint;
  v_heal   smallint := 0;
  v_capped boolean := false;
  v_lost   boolean := false;
  v_died   boolean := false;
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
  if v_run.summit_at is not null then
    return jsonb_build_object('error', 'topped_out');
  end if;
  if v_run.health <= 0 or v_run.session_date is distinct from public.current_puzzle_date(v_uid) then
    return jsonb_build_object('error', 'no_session');
  end if;

  if exists (select 1 from public.endless_guesses
             where run_id = v_run.id and level = v_run.level and guess = p_guess) then
    return jsonb_build_object('error', 'duplicate_guess');
  end if;

  if v_run.sessions_used = 0 then
    update public.endless_runs set sessions_used = 1 where id = v_run.id;
    v_run.sessions_used := 1;
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
  v_fall  := public.endless_fall(v_run.level);

  insert into public.endless_guesses (run_id, level, guess_index, guess, direction, tier)
  values (v_run.id, v_run.level, v_index, p_guess, v_dir, v_tier);

  -- Counted here and nowhere else: the rows above are deleted on a rollback,
  -- and the tiebreak has to remember the guesses that were spent losing.
  update public.endless_runs set guesses_used = guesses_used + 1 where id = v_run.id;

  if v_dist = 0 then
    v_next := v_run.level + 1;
    perform public.award_xp(v_uid, 20 + case when public.arena_floor(v_next) > public.arena_floor(v_run.level)
                                             then 50 else 0 end);
    -- Two guesses or fewer, not three.
    --
    -- The heal was quietly refunding falls. A level you have already failed is
    -- solved on the retry in one or two guesses - you know roughly where the
    -- number is - so at a threshold of three it paid out on almost every
    -- retry. A fall cost 21 and handed 10 back, netting about 13, and the
    -- climb ran nearly twice as fast as it was tuned for: modelled at 96% of
    -- daily players reaching Orbit and 28% topping out, against the 23% and
    -- 0.3% it was built to.
    --
    -- Two still pays on a retry sometimes, which is the point - blocking it
    -- entirely was modelled too and takes the summit to zero. Halving the
    -- refund lands at about 70% reaching Orbit and 5.6% topping out.
    if v_index <= 2 then
      v_heal := least(public.endless_heal(v_run.level), 100 - v_run.health);
    end if;

    if v_next > public.endless_max_level() then
      v_capped := true;
      update public.endless_runs set
        level = v_next,
        best_level = greatest(best_level, v_next),
        attempts_used = v_index,
        health = least(100, health + v_heal),
        status = 'over',
        summit_at = coalesce(summit_at, now())
      where id = v_run.id returning * into v_run;
    else
      update public.endless_runs set
        level = v_next,
        best_level = greatest(best_level, v_next),
        attempts_used = 0,
        clue_level = null,
        health = least(100, health + v_heal)
      where id = v_run.id returning * into v_run;
    end if;
  elsif v_last then
    v_lost := true;

    if v_run.health - v_fall <= 0 then
      v_died := true;
      v_floor := public.endless_checkpoint(greatest(v_run.level, v_run.best_level));
      -- Everything from the floor up, not just the level that was lost: the
      -- climb replays those, and yesterday's guesses would hand them over.
      delete from public.endless_guesses
      where run_id = v_run.id and level >= v_floor;

      update public.endless_runs set
        health = 0,
        lives = 0,
        attempts_used = 0,
        clue_level = null,
        level = v_floor
      where id = v_run.id returning * into v_run;
    else
      delete from public.endless_guesses where run_id = v_run.id and level = v_run.level;
      update public.endless_runs set
        health = health - v_fall,
        lives = greatest(1, ceil((health - v_fall) / 20.0)::smallint),
        attempts_used = 0,
        clue_level = null
      where id = v_run.id returning * into v_run;
    end if;
  else
    update public.endless_runs set attempts_used = v_index
    where id = v_run.id returning * into v_run;
  end if;

  return jsonb_build_object(
    'solved', v_dist = 0,
    'lostLife', v_lost,
    'health', v_run.health,
    'healed', v_heal,
    'fall', v_fall,
    'lives', v_run.lives,
    'sessionOver', v_died,
    'restartsAt', case when v_died then v_run.level end,
    'cleared', v_capped,
    'summit', v_run.summit_at is not null,
    'level', v_run.level,
    'attemptsUsed', v_run.attempts_used,
    'attemptsAllowed', public.endless_attempts(least(v_run.level, public.endless_max_level())),
    'guessesUsed', v_run.guesses_used,
    'guess', jsonb_build_object(
      'guess', p_guess,
      -- Thin air withholds the arrow: how close, never which way. The true
      -- direction is still stored - endless_guesses has a check constraint on
      -- it, and the server needs it to narrow anything - so this masks on the
      -- way out only.
      'direction', case when public.endless_hides_direction(v_run.level) and v_dist > 0
                        then 'hidden' else v_dir end,
      -- Withheld on the way out as well, or the reply would contradict the
      -- board. The proximity flags go with the shade for the same reason: the
      -- tile's label is built from them first.
      'tier', case when public.endless_delays_colour(v_run.level) and v_dist > 0
                   then 'pending' else v_tier end,
      'isWithin10', case when public.endless_delays_colour(v_run.level) and v_dist > 0
                        then false else v_dist > 0 and v_dist <= 10 end,
      'isOneAway',  case when public.endless_delays_colour(v_run.level) and v_dist > 0
                        then false else v_dist = 1 end,
      'isCorrect',  v_dist = 0
    ),
    'answer', case when v_dist = 0 or v_lost then v_answer end
  );
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
        v_run.clue_recent
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
               'guess', g.guess,
               'direction', case
                 when public.endless_hides_direction(v_run.level) and g.direction <> 'correct'
                 then 'hidden' else g.direction end,
               -- Stratosphere holds each colour back by one guess: the newest
               -- tile shows its arrow but not yet its shade, and settles the
               -- moment another guess lands on top of it. Never withheld from
               -- a correct guess - the level is over.
               --
               -- isWithin10 and isOneAway go with it. The tile's label is
               -- built from those flags before it ever looks at the tier, so
               -- leaving them would print WITHIN 10 beside a blank tile and
               -- hand over the one thing being withheld.
               'tier', case when public.endless_pending(v_run, g.guess_index, g.direction)
                            then 'pending' else g.tier end,
               'isCorrect', g.direction = 'correct',
               'isWithin10', case when public.endless_pending(v_run, g.guess_index, g.direction) then false
                                  else abs(g.guess - public.endless_number(v_week, v_run.level)) <= 10
                                       and g.direction <> 'correct' end,
               'isOneAway', case when public.endless_pending(v_run, g.guess_index, g.direction) then false
                                 else abs(g.guess - public.endless_number(v_week, v_run.level)) = 1 end
             ) order by g.guess_index)
      from public.endless_guesses g
      where g.run_id = v_run.id and g.level = v_run.level
    ), '[]'::jsonb),
    'best', greatest(0, v_run.best_level - 1)
  );
end;
$$;

revoke execute on function public.endless_hides_direction(integer) from public, anon, authenticated;
grant  execute on function public.endless_guess(integer) to authenticated;
grant  execute on function public.endless_state()        to authenticated;

commit;

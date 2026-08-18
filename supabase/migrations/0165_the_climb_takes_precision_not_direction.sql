-- Stratosphere stops guessing, and the ladder rises all the way up.
--
-- jpdw2 climbed 31 to 34 in a day and said Stratosphere felt like a guessing
-- game. He was right, and the reason is specific: hiding the arrow removes the
-- one bit a search actually needs. Every band then tells you a distance with
-- two possible sides, so reaching WITHIN 10 leaves nine numbers above and nine
-- below and one guess to pick between them. Skill got you there; a coin
-- decided. I lost a level that exact way while testing - within ten of 63,
-- guessed 57, answer was 66.
--
-- So the arrow comes back everywhere, and the climb takes PRECISION instead.
-- Six shades on the Ground and in the Sky, three in Stratosphere, one in Orbit
-- - you always know which way, and how much you know about the distance is
-- what the altitude costs you. Every guess narrows honestly at every level.
--
-- Measured over eight thousand levels a tier:
--
--   Ground        clue leaves 70%, six shades      5 tries   40.9%
--   Sky           clue leaves 80%, six shades      5 tries   47.0%
--   Stratosphere  arrow, three shades              6 tries   58.6%
--   Thin air      shade a guess late               6 tries   66.8%
--   Orbit         arrow, one shade                 6 tries   73.2%
--
-- Strictly rising Ground to Orbit, which it has never been - Orbit used to sit
-- at 57%, easier than both tiers below it, because it took nothing away. Now
-- it takes the most: you learn which way, and whether you are within ten. That
-- is all.
--
-- Attempts go 5, 5, 6, 6, 6. The middle and top get an extra guess and are
-- still harder, which is the point: they are harder for what they ask, not for
-- how little they allow.
--
-- Ground and Sky are untouched. endless_clue_target already gives them
-- different clue strengths - 0.70 and 0.80 - so they were never the identical
-- pair they looked like from the outside.

begin;

/**
 * How many shades a level is willing to show. Six is the full ladder.
 *
 * Precision is what the climb takes, so this is the dial. Direction is not on
 * it and never will be again.
 */
create or replace function public.endless_shades(p_level integer)
returns smallint
language sql
immutable
as $fn$
  select (case
    when p_level <= 30 then 6   -- Ground and Sky: everything
    when p_level <= 45 then 3   -- Stratosphere: near, middling, far
    when p_level <= 60 then 6   -- Thin air: everything, one guess late
    else 1                      -- Orbit: within ten, or not
  end)::smallint;
$fn$;

/**
 * The shade for a distance at a level, collapsed to that level's scheme.
 *
 * The band names are the client's existing ladder, so a coarse tier reuses the
 * ends of it rather than inventing vocabulary: three shades borrow intense,
 * medium and vast; one borrows intense and vast.
 */
create or replace function public.endless_band(p_level integer, p_dist integer)
returns text
language sql
immutable
as $fn$
  select case
    when p_dist = 0 then 'correct'
    when public.endless_shades(p_level) = 1 then
      case when p_dist <= 10 then 'intense' else 'vast' end
    when public.endless_shades(p_level) = 3 then
      case when p_dist <= 24  then 'intense'
           when p_dist <= 249 then 'medium'
           else 'vast' end
    else
      case when p_dist <= 10  then 'intense'
           when p_dist <= 24  then 'dark'
           when p_dist <= 99  then 'medium'
           when p_dist <= 249 then 'light'
           when p_dist <= 499 then 'distant'
           else 'vast' end
  end;
$fn$;

/**
 * Six above the Sky, five below it.
 *
 * The tiers that ask more get more room to work. They are still the harder
 * ones - Stratosphere fails 59% of the time on six guesses where the Ground
 * fails 41% on five - because what makes them hard is the shade they withhold,
 * not the swings they refuse.
 */
create or replace function public.endless_attempts(p_level integer)
returns smallint
language sql
immutable
as $fn$ select (case when p_level <= 30 then 5 else 6 end)::smallint $fn$;

/**
 * Nothing hides the arrow any more.
 *
 * Kept rather than dropped: endless_guess and endless_state no longer call it,
 * but a client compiled before this migration still expects the shape it
 * produced, and a function that answers "no" is a smaller thing to leave
 * behind than a broken call.
 */
create or replace function public.endless_hides_direction(p_level integer)
returns boolean
language sql
immutable
as $fn$ select false $fn$;

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
  -- The shade a tier is willing to give. Six on the Ground and in the Sky,
  -- three in Stratosphere, one in Orbit - the climb takes precision away, and
  -- never direction, because direction is the bit a search actually needs.
  v_tier := public.endless_band(v_run.level, v_dist);

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
    -- New ground only, and only in two guesses or fewer.
    --
    -- Which attempt matters more than how many guesses, and the two previous
    -- passes at this both missed that. Measured live: of 36 retries every one
    -- landed in one or two guesses, because a failed attempt spends five
    -- narrowing the field and the retry starts already knowing the answer. Any
    -- threshold on guess count therefore pays out on every retry, and the heal
    -- was refunding about half of what a fall cost.
    --
    -- Two ways a level can be already-known, and both are excluded. Falling on
    -- it puts it in failed_levels. Dying and replaying up from a checkpoint
    -- leaves level below best_level, because best_level is a high-water mark
    -- that a rollback does not touch.
    if v_index <= 2
       and v_run.level >= v_run.best_level
       and not (v_run.level = any(coalesce(v_run.failed_levels, '{}'::smallint[])))
    then
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
        failed_levels = (
          select array(select distinct unnest(coalesce(failed_levels, '{}'::smallint[])
                                              || v_run.level::smallint))
        ),
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
      -- The arrow is never withheld now. Hiding it turned the endgame into a
      -- coin flip between the nine numbers above and the nine below.
      'direction', v_dir,
      -- Withheld on the way out as well, or the reply would contradict the
      -- board. The proximity flags go with the shade for the same reason: the
      -- tile's label is built from them first.
      'tier', case when public.endless_delays_colour(v_run.level) and v_dist > 0
                   then 'pending' else v_tier end,
      -- Only where the shades are fine enough to have said it already. In a
      -- tier that reports three bands, WITHIN 10 is finer than the band it
      -- sits in and would hand back the precision the tier just took.
      'isWithin10', case when public.endless_shades(v_run.level) < 6
                          or (public.endless_delays_colour(v_run.level) and v_dist > 0)
                        then false else v_dist > 0 and v_dist <= 10 end,
      'isOneAway',  case when public.endless_shades(v_run.level) < 6
                          or (public.endless_delays_colour(v_run.level) and v_dist > 0)
                        then false else v_dist = 1 end,
      'isCorrect',  v_dist = 0
    ),
    -- Only a solve. A fall used to send the number too, and although no
    -- screen has printed it for a while, it was still sitting in the reply
    -- where anybody with the network tab open could read it - and the same
    -- number is waiting on the retry, so reading it once clears the level for
    -- free. The one place in the game where knowing the answer costs nothing
    -- to use is the one place it was being handed over.
    'answer', case when v_dist = 0 then v_answer end
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
               'direction', g.direction,
               -- Stratosphere holds each colour back by one guess: the newest
               -- tile shows its arrow but not yet its shade, and settles the
               -- moment another guess lands on top of it. Never withheld from
               -- a correct guess - the level is over.
               --
               -- isWithin10 and isOneAway go with it. The tile's label is
               -- built from those flags before it ever looks at the tier, so
               -- leaving them would print WITHIN 10 beside a blank tile and
               -- hand over the one thing being withheld.
               -- Re-banded on read rather than trusted from the row: the
               -- stored tier was computed under whatever scheme was live when
               -- the guess landed, and a tier's shades can change.
               'tier', case when public.endless_pending(v_run, g.guess_index, g.direction)
                            then 'pending'
                            when g.direction = 'correct' then 'correct'
                            else public.endless_band(
                                   v_run.level,
                                   abs(g.guess - public.endless_number(v_week, v_run.level)))
                       end,
               'isCorrect', g.direction = 'correct',
               'isWithin10', case when public.endless_pending(v_run, g.guess_index, g.direction)
                                        or public.endless_shades(v_run.level) < 6 then false
                                  else abs(g.guess - public.endless_number(v_week, v_run.level)) <= 10
                                       and g.direction <> 'correct' end,
               'isOneAway', case when public.endless_pending(v_run, g.guess_index, g.direction)
                                       or public.endless_shades(v_run.level) < 6 then false
                                 else abs(g.guess - public.endless_number(v_week, v_run.level)) = 1 end
             ) order by g.guess_index)
      from public.endless_guesses g
      where g.run_id = v_run.id and g.level = v_run.level
    ), '[]'::jsonb),
    'best', greatest(0, v_run.best_level - 1)
  );
end;
$$;

revoke execute on function public.endless_shades(integer)          from public, anon, authenticated;
revoke execute on function public.endless_band(integer, integer)   from public, anon, authenticated;
revoke execute on function public.endless_attempts(integer)        from public, anon, authenticated;
revoke execute on function public.endless_hides_direction(integer) from public, anon, authenticated;
grant  execute on function public.endless_state()          to authenticated;
grant  execute on function public.endless_guess(integer)   to authenticated;

commit;

-- Shades and attempts by tier. Should read 6/5, 6/5, 3/6, 6/6, 1/6.
select l as level,
       public.endless_shades(l)   as shades,
       public.endless_attempts(l) as tries,
       public.endless_band(l, 8)  as at_8_away,
       public.endless_band(l, 40) as at_40_away
  from unnest(array[5, 20, 35, 50, 70]) l;

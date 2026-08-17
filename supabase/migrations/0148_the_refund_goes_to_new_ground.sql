-- The refund goes to new ground only, and falls get cheaper to pay for it.
--
-- Measured on the live database: 16 levels solved first time against 36 falls,
-- and of the 36 retries that followed, every single one landed in one or two
-- guesses - 1 1 1 1 2 1 1 1 2 1, never a three. A failed attempt spends five
-- guesses narrowing the field, so the retry begins already knowing the answer.
--
-- That is why both previous attempts at this achieved nothing. 0145 moved the
-- threshold from three guesses to two and 0148 was going to halve the amount;
-- neither looks at the axis that separates the two cases. A guess-count rule
-- pays out on every retry at any setting, so the heal was refunding roughly
-- half of what a fall cost, and the pace of the entire climb was fall minus
-- heal rather than fall.
--
-- So the test becomes which attempt, not how many guesses. Two ways a level
-- can already be known and both are excluded: falling on it records it in
-- failed_levels, and dying and replaying up from a checkpoint leaves level
-- below best_level, which a rollback does not touch.
--
-- Alone that is far too harsh - modelled at 2.7% of daily players reaching
-- Orbit, with the week ending at 49, which would hide Thin air and Orbit from
-- almost everyone and waste the tier mechanics entirely. So falls drop from
-- 21-25 to 18-22 to buy the pace back. Together, modelled over thirty thousand
-- weeks: 9, 17, 26, 34, 41, 49, 56 - ending in Thin air, 22% reaching Orbit
-- and 0.22% topping out.
--
-- Orbit% is the number worth steering by. Summit% is a threshold function of
-- pace - 75 levels over 7 days is 10.7 a day, and small changes either side of
-- that flip it wildly - whereas reaching level 61 degrades smoothly and
-- survives a measurement being slightly off.

begin;

-- Levels this run has fallen on. Only ever added to, and never cleared by a
-- day rolling over: knowing where a number is does not expire overnight.
alter table public.endless_runs
  add column if not exists failed_levels smallint[] not null default '{}';

/**
 * What a clean solve pays back. Ten, on new ground only.
 */
create or replace function public.endless_heal(p_level integer)
returns smallint
language sql
immutable
as $fn$ select 10::smallint $fn$;

/**
 * What running out of attempts costs.
 *
 * Cheaper than 21-25 because the refund now almost never fires - a level used
 * to cost fall minus ten and now costs the fall. Lowering it is what keeps the
 * climb moving at roughly nine levels a day instead of seven.
 */
create or replace function public.endless_fall(p_level integer)
returns smallint
language sql
immutable
as $fn$
  select (case
    when p_level <= 15 then 18
    when p_level <= 30 then 19
    when p_level <= 45 then 20
    when p_level <= 60 then 21
    else 22
  end)::smallint;
$fn$;

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

revoke execute on function public.endless_heal(integer) from public, anon, authenticated;
revoke execute on function public.endless_fall(integer) from public, anon, authenticated;
grant  execute on function public.endless_guess(integer) to authenticated;

commit;

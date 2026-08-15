-- Two things: dying costs the climb, and everything you play earns a level.
--
-- Lives were a speed bump. Running out paused you and put you back on the same
-- number, which is no cost at all - so the five of them meant nothing. Losing
-- them all now ends the climb, and the next session starts at the top of the
-- deepest arena you had reached.
--
-- Back to level 1 would have been the pure version and the wrong one: dying at
-- 45 would mean re-clearing forty-four levels you have already proved, which is
-- not difficulty, it is tedium. The arenas become checkpoints instead - you keep
-- what you unlocked and lose what you built inside it.
--
-- And a player level, earned from everything. A game with four modes and one
-- number to show for them makes three of the modes feel like practice; XP is
-- the thing that says all of it counted.

alter table public.endless_runs add column if not exists best_level smallint not null default 1;
update public.endless_runs set best_level = level where level > best_level;

alter table public.profiles add column if not exists xp integer not null default 0;

/** The arena a level belongs to, and where a death sends you back to. */
create or replace function public.arena_floor(p_level integer)
returns smallint
language sql
immutable
as $$
  select (case
    when p_level >= 80 then 80
    when p_level >= 40 then 40
    when p_level >= 20 then 20
    else 1
  end)::smallint;
$$;

/**
 * Player level from experience.
 *
 * Each level costs 250 more than the one before, so the first few arrive
 * quickly - a good day is most of a level - and the later ones take weeks.
 * Cumulative cost of level L is 125·L·(L-1), inverted here.
 */
create or replace function public.player_level(p_xp integer)
returns integer
language sql
immutable
as $$
  select greatest(1, floor((1 + sqrt(1 + (4.0 * greatest(0, p_xp) / 125))) / 2)::int);
$$;

create or replace function public.level_floor(p_level integer)
returns integer
language sql
immutable
as $$
  select (125 * p_level * (p_level - 1))::int;
$$;

/** Adds experience. Every mode calls this; nothing else writes xp. */
create or replace function public.award_xp(p_uid uuid, p_amount integer)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  update public.profiles set xp = xp + greatest(0, p_amount) where id = p_uid;
$$;

-- ---------------------------------------------------------------------------
-- Impossible: a life costs the number, five lives cost the climb.
-- ---------------------------------------------------------------------------

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
  if v_run.lives <= 0 or v_run.session_date is distinct from public.current_puzzle_date(v_uid) then
    return jsonb_build_object('error', 'no_session');
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
    v_next := v_run.level + 1;
    -- Twenty for the number, and fifty more for reaching a new arena.
    perform public.award_xp(v_uid, 20 + case when public.arena_floor(v_next) > public.arena_floor(v_run.level)
                                             then 50 else 0 end);
    if v_next > 100 then
      v_capped := true;
      update public.endless_runs set
        level = v_next, best_level = greatest(best_level, v_next), attempts_used = v_index, status = 'over'
      where id = v_run.id returning * into v_run;
    else
      update public.endless_runs set
        level = v_next, best_level = greatest(best_level, v_next), attempts_used = 0, clue_level = null
      where id = v_run.id returning * into v_run;
    end if;
  elsif v_last then
    v_lost := true;
    delete from public.endless_guesses where run_id = v_run.id and level = v_run.level;

    if v_run.lives <= 1 then
      -- The climb ends here and resumes at the floor of the deepest arena
      -- reached, so nobody replays forty levels they have already beaten.
      v_died := true;
      update public.endless_runs set
        lives = 0,
        attempts_used = 0,
        clue_level = null,
        level = public.arena_floor(v_run.level)
      where id = v_run.id returning * into v_run;
    else
      update public.endless_runs set
        lives = lives - 1, attempts_used = 0, clue_level = null
      where id = v_run.id returning * into v_run;
    end if;
  else
    update public.endless_runs set attempts_used = v_index
    where id = v_run.id returning * into v_run;
  end if;

  return jsonb_build_object(
    'solved', v_dist = 0,
    'lostLife', v_lost,
    'lives', v_run.lives,
    'sessionOver', v_died,
    'restartsAt', case when v_died then v_run.level end,
    'cleared', v_capped,
    'level', v_run.level,
    'attemptsUsed', v_run.attempts_used,
    'attemptsAllowed', public.endless_attempts(least(v_run.level, 100)),
    'guess', jsonb_build_object(
      'guess', p_guess, 'direction', v_dir, 'tier', v_tier,
      'isWithin10', v_dist > 0 and v_dist <= 10,
      'isOneAway',  v_dist = 1,
      'isCorrect',  v_dist = 0
    ),
    'answer', case when v_dist = 0 or v_lost then v_answer end
  );
end;
$$;

/** The board reads the deepest level reached, which a death no longer erases. */
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
          rank() over (order by max(r.best_level - 1) desc) as rank,
          coalesce(p.username, 'Player') as name,
          p.avatar,
          max(r.best_level - 1) as depth,
          r.user_id = v_uid as is_me
        from public.endless_runs r
        join public.profiles p on p.id = r.user_id
        where r.week_start = v_week
        group by r.user_id, p.username, p.avatar
        having max(r.best_level - 1) > 0
        order by max(r.best_level - 1) desc
        limit greatest(1, least(p_limit, 200))
      ) e
    ), '[]'::jsonb)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- The daily and duels pay too.
-- ---------------------------------------------------------------------------

/**
 * A finished day is worth its points, plus fifty for a clean sweep.
 *
 * Hung off the games row rather than written into submit_guess: the day ends in
 * exactly one place, and a trigger cannot be forgotten by whoever edits the
 * scoring next.
 */
create or replace function public.tg_award_day_xp()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_won int;
begin
  if new.status = 'complete' and old.status is distinct from 'complete' then
    select count(*) into v_won from public.round_results
    where game_id = new.id and status = 'won';

    perform public.award_xp(new.user_id,
      greatest(0, new.total_score) + case when v_won = 3 then 50 else 0 end);
  end if;
  return new;
end;
$$;

drop trigger if exists games_award_xp on public.games;
create trigger games_award_xp
after update on public.games
for each row execute function public.tg_award_day_xp();

create or replace function public.resolve_duel(p_duel_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_duel   public.duels%rowtype;
  v_rounds int;
  v_a int := 0;
  v_b int := 0;
  r int;
  w text;
begin
  select * into v_duel from public.duels where id = p_duel_id for update;
  if v_duel.id is null or v_duel.status <> 'active' then return; end if;

  select coalesce(max(round), 0) into v_rounds from public.duel_progress
  where duel_id = p_duel_id;

  if v_rounds = 0 then return; end if;

  for r in 1 .. v_rounds loop
    w := public.duel_round_winner(p_duel_id, r);
    if w is null then return; end if;
    if w = 'a' then v_a := v_a + 1; end if;
    if w = 'b' then v_b := v_b + 1; end if;
  end loop;

  if v_rounds < 3 then return; end if;
  if v_a = v_b and v_rounds = 3 then return; end if;

  update public.duels set
    status = 'complete',
    finished_at = now(),
    winner_id = case
      when v_a > v_b then v_duel.challenger_id
      when v_b > v_a then v_duel.opponent_id
      else null
    end
  where id = p_duel_id
  returning * into v_duel;

  -- Winning is worth more, but turning up is worth something: a duel you lost
  -- was still three rounds of play.
  if v_duel.winner_id is null then
    perform public.award_xp(v_duel.challenger_id, 40);
    perform public.award_xp(v_duel.opponent_id, 40);
  else
    perform public.award_xp(v_duel.winner_id, 80);
    perform public.award_xp(
      case when v_duel.winner_id = v_duel.challenger_id
           then v_duel.opponent_id else v_duel.challenger_id end, 25);
  end if;

  perform public.apply_ranked_result(p_duel_id);
end;
$$;

/** Your level and how far into it you are. */
create or replace function public.xp_state()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'xp', p.xp,
    'level', public.player_level(p.xp),
    'into', p.xp - public.level_floor(public.player_level(p.xp)),
    'needed', public.level_floor(public.player_level(p.xp) + 1)
              - public.level_floor(public.player_level(p.xp))
  )
  from public.profiles p where p.id = auth.uid();
$$;

revoke execute on function public.arena_floor(integer)        from public, anon, authenticated;
revoke execute on function public.player_level(integer)       from public, anon;
revoke execute on function public.level_floor(integer)        from public, anon;
revoke execute on function public.award_xp(uuid, integer)     from public, anon, authenticated;
revoke execute on function public.tg_award_day_xp()           from public, anon, authenticated;
revoke execute on function public.xp_state()                  from public, anon;
revoke execute on function public.endless_guess(integer)      from public, anon;
revoke execute on function public.resolve_duel(uuid)          from public, anon, authenticated;
grant execute on function public.endless_guess(integer) to authenticated;
grant execute on function public.xp_state()             to authenticated;

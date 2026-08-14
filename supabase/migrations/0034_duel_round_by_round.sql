-- Duels resolve a round at a time, with a decider if three are not enough.
--
-- Previously both players ran through all three rounds independently and
-- everything was revealed at the end. That made a duel two solitaire games
-- stapled together: you never knew, while playing round two, whether round one
-- had gone your way.
--
-- Now a round is settled as soon as both have finished it, and neither can move
-- on until then. You see who took each round, and a round both took in the same
-- number of guesses is a tie that counts for neither.
--
-- Three rounds can therefore end level - 1-1 with a tie, or three ties. A
-- fourth round is drawn only in that case, and only once: if the decider also
-- ties, the duel is a draw and nobody is asked to keep going.

alter table public.duel_rounds   drop constraint if exists duel_rounds_round_check;
alter table public.duel_progress drop constraint if exists duel_progress_round_check;
alter table public.duel_guesses  drop constraint if exists duel_guesses_round_check;

alter table public.duel_rounds   add constraint duel_rounds_round_check   check (round between 1 and 4);
alter table public.duel_progress add constraint duel_progress_round_check check (round between 1 and 4);
alter table public.duel_guesses  add constraint duel_guesses_round_check  check (round between 1 and 4);

/** The decider gets five attempts, like the tightest of the three. */
create or replace function public.duel_attempts(p_round integer)
returns smallint
language sql
immutable
as $$
  select (case p_round when 1 then 7 when 2 then 6 else 5 end)::smallint;
$$;

/** Who took a round: 'a' for the challenger, 'b' for the opponent, 'tie'. */
create or replace function public.duel_round_winner(p_duel_id uuid, p_round integer)
returns text
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_duel public.duels%rowtype;
  a_used int; a_won boolean; b_used int; b_won boolean;
begin
  select * into v_duel from public.duels where id = p_duel_id;
  if v_duel.id is null then return null; end if;

  select attempts_used, status = 'won' into a_used, a_won from public.duel_progress
  where duel_id = p_duel_id and user_id = v_duel.challenger_id and round = p_round;
  select attempts_used, status = 'won' into b_used, b_won from public.duel_progress
  where duel_id = p_duel_id and user_id = v_duel.opponent_id and round = p_round;

  -- Not finished by both: nothing decided yet.
  if a_used is null or b_used is null then return null; end if;
  if exists (select 1 from public.duel_progress
             where duel_id = p_duel_id and round = p_round and status = 'playing') then
    return null;
  end if;

  if a_won and (not b_won) then return 'a'; end if;
  if b_won and (not a_won) then return 'b'; end if;
  if a_won and b_won then
    if a_used < b_used then return 'a'; end if;
    if b_used < a_used then return 'b'; end if;
  end if;
  -- Both solved it in the same number, or neither solved it at all.
  return 'tie';
end;
$$;

/**
 * Settle what can be settled.
 *
 * Called after every finished round. It closes the duel when someone is ahead
 * with no rounds left, and draws the decider when three rounds end level.
 */
create or replace function public.resolve_duel(p_duel_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_duel public.duels%rowtype;
  v_rounds int;
  v_a int := 0;
  v_b int := 0;
  r int;
  w text;
  n int;
begin
  select * into v_duel from public.duels where id = p_duel_id for update;
  if v_duel.id is null or v_duel.status <> 'active' then return; end if;

  select max(round) into v_rounds from public.duel_rounds where duel_id = p_duel_id;

  for r in 1 .. v_rounds loop
    w := public.duel_round_winner(p_duel_id, r);
    if w is null then return; end if;         -- a round is still open
    if w = 'a' then v_a := v_a + 1; end if;
    if w = 'b' then v_b := v_b + 1; end if;
  end loop;

  -- Level after three: draw a decider, once.
  if v_a = v_b and v_rounds = 3 then
    loop
      n := 1 + floor(random() * 1000)::int;
      exit when not exists (
        select 1 from public.duel_rounds where duel_id = p_duel_id and answer = n
      );
    end loop;

    insert into public.duel_rounds (duel_id, round, answer, clue1, clue2)
    values (p_duel_id, 4, n, public.pick_clue1(n), public.pick_clue2(n));

    insert into public.duel_progress (duel_id, user_id, round, attempts_allowed)
    values (p_duel_id, v_duel.challenger_id, 4, public.duel_attempts(4)),
           (p_duel_id, v_duel.opponent_id,  4, public.duel_attempts(4));
    return;
  end if;

  update public.duels set
    status = 'complete',
    finished_at = now(),
    winner_id = case
      when v_a > v_b then v_duel.challenger_id
      when v_b > v_a then v_duel.opponent_id
      else null
    end
  where id = p_duel_id;
end;
$$;

/**
 * A guess in a duel.
 *
 * A round cannot be started until the other player has finished the one before,
 * so the two boards stay in step and each round is decided before the next
 * begins.
 */
create or replace function public.duel_guess(p_duel_id uuid, p_guess integer)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid      uuid := auth.uid();
  v_duel     public.duels%rowtype;
  v_other    uuid;
  v_round    int;
  v_prog     public.duel_progress%rowtype;
  v_answer   smallint;
  v_clue2    text;
  v_distance integer;
  v_direction text;
  v_tier     text;
  v_index    smallint;
  v_last     boolean;
begin
  if v_uid is null then
    return jsonb_build_object('error', 'not_authenticated');
  end if;
  if p_guess is null or p_guess < 1 or p_guess > 1000 then
    return jsonb_build_object('error', 'out_of_range');
  end if;

  select * into v_duel from public.duels
  where id = p_duel_id and v_uid in (challenger_id, opponent_id);

  if v_duel.id is null or v_duel.status <> 'active' then
    return jsonb_build_object('error', 'no_such_duel');
  end if;

  v_other := case when v_duel.challenger_id = v_uid then v_duel.opponent_id
                  else v_duel.challenger_id end;

  select min(round) into v_round from public.duel_progress
  where duel_id = p_duel_id and user_id = v_uid and status = 'playing';

  if v_round is null then
    return jsonb_build_object('error', 'already_played');
  end if;

  -- Held at the door until they have caught up.
  if exists (
    select 1 from public.duel_progress
    where duel_id = p_duel_id and user_id = v_other
      and round < v_round and status = 'playing'
  ) then
    return jsonb_build_object('error', 'waiting_for_them');
  end if;

  select * into v_prog from public.duel_progress
  where duel_id = p_duel_id and user_id = v_uid and round = v_round for update;

  if exists (select 1 from public.duel_guesses
             where duel_id = p_duel_id and user_id = v_uid
               and round = v_round and guess = p_guess) then
    return jsonb_build_object('error', 'duplicate_guess');
  end if;

  select answer, clue2 into v_answer, v_clue2 from public.duel_rounds
  where duel_id = p_duel_id and round = v_round;

  v_distance  := abs(p_guess - v_answer);
  v_direction := case when v_distance = 0 then 'correct'
                      when p_guess < v_answer then 'below' else 'above' end;
  v_tier := case
    when v_distance = 0    then 'correct'
    when v_distance <= 10  then 'intense'
    when v_distance <= 24  then 'dark'
    when v_distance <= 99  then 'medium'
    when v_distance <= 249 then 'light'
    when v_distance <= 499 then 'distant'
    else 'vast' end;

  v_index := v_prog.attempts_used + 1;
  v_last  := v_index >= v_prog.attempts_allowed;

  insert into public.duel_guesses (duel_id, user_id, round, guess_index, guess, direction, tier)
  values (p_duel_id, v_uid, v_round, v_index, p_guess, v_direction, v_tier);

  update public.duel_progress set
    attempts_used = v_index,
    clue2_unlocked = clue2_unlocked or v_distance <= 10,
    status = case when v_distance = 0 then 'won'
                  when v_last then 'lost' else 'playing' end
  where duel_id = p_duel_id and user_id = v_uid and round = v_round
  returning * into v_prog;

  if v_prog.status <> 'playing' then
    perform public.resolve_duel(p_duel_id);
  end if;

  return jsonb_build_object(
    'roundStatus', v_prog.status,
    'attemptsUsed', v_prog.attempts_used,
    'attemptsAllowed', v_prog.attempts_allowed,
    'guess', jsonb_build_object(
      'guess', p_guess, 'direction', v_direction, 'tier', v_tier,
      'isWithin10', v_distance > 0 and v_distance <= 10,
      'isOneAway',  v_distance = 1,
      'isCorrect',  v_distance = 0
    ),
    'clue2',  case when v_prog.clue2_unlocked then v_clue2 else null end,
    'answer', case when v_prog.status <> 'playing' then v_answer else null end
  );
end;
$$;

/**
 * One duel, from my side.
 *
 * A settled round shows both attempt counts and who took it. A round still in
 * progress shows neither, so nobody plays against a running commentary.
 */
create or replace function public.duel_state(p_duel_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid    uuid := auth.uid();
  v_duel   public.duels%rowtype;
  v_round  int;
  v_prog   public.duel_progress%rowtype;
  v_other  uuid;
  v_answer smallint;
  v_am_a   boolean;
  v_waiting boolean := false;
begin
  if v_uid is null then
    return jsonb_build_object('error', 'not_authenticated');
  end if;

  select * into v_duel from public.duels
  where id = p_duel_id and v_uid in (challenger_id, opponent_id);

  if v_duel.id is null then
    return jsonb_build_object('error', 'no_such_duel');
  end if;

  v_am_a  := v_duel.challenger_id = v_uid;
  v_other := case when v_am_a then v_duel.opponent_id else v_duel.challenger_id end;

  select min(round) into v_round from public.duel_progress
  where duel_id = p_duel_id and user_id = v_uid and status = 'playing';

  if v_round is not null then
    v_waiting := exists (
      select 1 from public.duel_progress
      where duel_id = p_duel_id and user_id = v_other
        and round < v_round and status = 'playing'
    );

    select * into v_prog from public.duel_progress
    where duel_id = p_duel_id and user_id = v_uid and round = v_round;
    select answer into v_answer from public.duel_rounds
    where duel_id = p_duel_id and round = v_round;
  end if;

  return jsonb_build_object(
    'id', v_duel.id,
    'status', v_duel.status,
    'opponent', (select coalesce(username, 'Player') from public.profiles where id = v_other),
    'waitingForThem', v_waiting,
    'outcome', case
      when v_duel.status <> 'complete' then null
      when v_duel.winner_id is null then 'draw'
      when v_duel.winner_id = v_uid then 'won'
      else 'lost'
    end,
    'round', case when v_round is null or v_waiting then null else jsonb_build_object(
      'round', v_round,
      'attemptsUsed', v_prog.attempts_used,
      'attemptsAllowed', v_prog.attempts_allowed,
      'clue1', (select clue1 from public.duel_rounds where duel_id = p_duel_id and round = v_round),
      'clue2', case when v_prog.clue2_unlocked
                    then (select clue2 from public.duel_rounds
                          where duel_id = p_duel_id and round = v_round) end,
      'guesses', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'guess', g.guess, 'direction', g.direction, 'tier', g.tier,
                 'isCorrect',  g.direction = 'correct',
                 'isWithin10', g.guess <> v_answer and abs(g.guess - v_answer) <= 10,
                 'isOneAway',  abs(g.guess - v_answer) = 1
               ) order by g.guess_index)
        from public.duel_guesses g
        where g.duel_id = p_duel_id and g.user_id = v_uid and g.round = v_round
      ), '[]'::jsonb)
    ) end,
    -- One row per round drawn so far, revealed only once that round is settled.
    'rounds', coalesce((
      select jsonb_agg(jsonb_build_object(
               'round', dr.round,
               'settled', public.duel_round_winner(p_duel_id, dr.round) is not null,
               'result', case public.duel_round_winner(p_duel_id, dr.round)
                           when 'tie' then 'tie'
                           when case when v_am_a then 'a' else 'b' end then 'won'
                           when null then null
                           else 'lost'
                         end,
               'mine', (select attempts_used from public.duel_progress
                         where duel_id = p_duel_id and user_id = v_uid and round = dr.round),
               'mineStatus', (select status from public.duel_progress
                         where duel_id = p_duel_id and user_id = v_uid and round = dr.round),
               'theirs', case when public.duel_round_winner(p_duel_id, dr.round) is not null
                         then (select attempts_used from public.duel_progress
                               where duel_id = p_duel_id and user_id = v_other and round = dr.round) end,
               'theirStatus', case when public.duel_round_winner(p_duel_id, dr.round) is not null
                         then (select status from public.duel_progress
                               where duel_id = p_duel_id and user_id = v_other and round = dr.round) end
             ) order by dr.round)
      from public.duel_rounds dr where dr.duel_id = p_duel_id
    ), '[]'::jsonb)
  );
end;
$$;

revoke execute on function public.duel_round_winner(uuid, integer) from public, anon;
revoke execute on function public.resolve_duel(uuid)               from public, anon, authenticated;
revoke execute on function public.duel_guess(uuid, integer)        from public, anon;
revoke execute on function public.duel_state(uuid)                 from public, anon;
grant execute on function public.duel_guess(uuid, integer) to authenticated;
grant execute on function public.duel_state(uuid)          to authenticated;

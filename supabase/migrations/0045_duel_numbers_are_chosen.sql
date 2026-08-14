-- You choose the number your opponent has to find.
--
-- The server drew three numbers and handed the same ones to both players, which
-- made a duel a fair race and nothing more - neither person had done anything
-- to the other. Choosing the number your opponent hunts is the part that makes
-- it a game between two people: you pick, they pick, and each of you is working
-- on something the other decided.
--
-- Each round is picked fresh, and neither player can guess until both numbers
-- are in. Otherwise whoever picked first would start guessing while the other
-- was still choosing, and the attempt counts that decide the round would be
-- measured against different amounts of thinking time.
--
-- The numbers live in a table with RLS on and no policy at all, the same as the
-- daily secrets: the only way to a number is through a definer function that
-- has already decided you are allowed to know it. Note that the person who set
-- it obviously knows it - that is the point - so nothing here is written as if
-- it were secret from them.

create table if not exists public.duel_numbers (
  duel_id  uuid not null references public.duels(id) on delete cascade,
  round    smallint not null check (round between 1 and 4),
  -- Who has to find it, and who chose it. Always the two sides of one duel.
  for_user uuid not null references auth.users(id) on delete cascade,
  set_by   uuid not null references auth.users(id) on delete cascade,
  answer   smallint not null check (answer between 1 and 1000),
  clue1    text not null,
  set_at   timestamptz not null default now(),

  primary key (duel_id, round, for_user),
  check (for_user <> set_by)
);

alter table public.duel_numbers enable row level security;

-- Duels already in flight keep the numbers the server drew for them, one row
-- per player per round, so nobody loses a match to this change. Those rounds
-- were the same number for both players and are recorded as such.
insert into public.duel_numbers (duel_id, round, for_user, set_by, answer, clue1)
select r.duel_id, r.round, d.challenger_id, d.opponent_id, r.answer, r.clue1
from public.duel_rounds r
join public.duels d on d.id = r.duel_id
on conflict do nothing;

insert into public.duel_numbers (duel_id, round, for_user, set_by, answer, clue1)
select r.duel_id, r.round, d.opponent_id, d.challenger_id, r.answer, r.clue1
from public.duel_rounds r
join public.duels d on d.id = r.duel_id
on conflict do nothing;

/**
 * The round this player still owes a number for, or null.
 *
 * Null covers every reason there is nothing to pick: the duel is over, a round
 * is in progress, or the previous round has not been settled by both sides yet.
 */
create or replace function public.duel_pick_round(p_duel_id uuid, p_uid uuid)
returns integer
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_duel  public.duels%rowtype;
  v_other uuid;
  v_last  int;
  r       int;
begin
  select * into v_duel from public.duels where id = p_duel_id;
  if v_duel.id is null or v_duel.status <> 'active' then return null; end if;
  if p_uid not in (v_duel.challenger_id, v_duel.opponent_id) then return null; end if;

  v_other := case when v_duel.challenger_id = p_uid then v_duel.opponent_id
                  else v_duel.challenger_id end;

  -- Anything still being played means nothing is being picked.
  if exists (select 1 from public.duel_progress
             where duel_id = p_duel_id and status = 'playing') then
    return null;
  end if;

  select coalesce(max(round), 0) into v_last from public.duel_progress
  where duel_id = p_duel_id;

  -- Every round played so far has to be settled before the next is picked.
  for r in 1 .. v_last loop
    if public.duel_round_winner(p_duel_id, r) is null then return null; end if;
  end loop;

  -- Three is the match. A fourth exists only while the duel is level after
  -- three, which is exactly when resolve_duel leaves it active.
  if v_last >= 4 then return null; end if;

  return v_last + 1;
end;
$$;

/** Accepting opens the room. The numbers come from the players, not the server. */
create or replace function public.respond_duel(p_duel_id uuid, p_accept boolean)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid  uuid := auth.uid();
  v_duel public.duels%rowtype;
begin
  if v_uid is null then
    return jsonb_build_object('error', 'not_authenticated');
  end if;

  select * into v_duel from public.duels
  where id = p_duel_id and opponent_id = v_uid and status = 'pending'
  for update;

  if v_duel.id is null then
    return jsonb_build_object('error', 'no_such_challenge');
  end if;

  if not p_accept then
    update public.duels set status = 'declined', finished_at = now() where id = v_duel.id;
    return jsonb_build_object('status', 'declined');
  end if;

  update public.duels set status = 'active', accepted_at = now() where id = v_duel.id;

  return jsonb_build_object('status', 'accepted', 'duelId', v_duel.id);
end;
$$;

/**
 * Set the number your opponent has to find this round.
 *
 * The round only opens once both numbers are in, and both boards are laid out
 * at that moment - so neither player can start guessing while the other is
 * still choosing.
 */
create or replace function public.duel_set_number(p_duel_id uuid, p_number integer)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid   uuid := auth.uid();
  v_duel  public.duels%rowtype;
  v_other uuid;
  v_round int;
begin
  if v_uid is null then
    return jsonb_build_object('error', 'not_authenticated');
  end if;
  if p_number is null or p_number < 1 or p_number > 1000 then
    return jsonb_build_object('error', 'out_of_range');
  end if;

  select * into v_duel from public.duels
  where id = p_duel_id and v_uid in (challenger_id, opponent_id)
  for update;

  if v_duel.id is null or v_duel.status <> 'active' then
    return jsonb_build_object('error', 'no_such_duel');
  end if;

  v_other := case when v_duel.challenger_id = v_uid then v_duel.opponent_id
                  else v_duel.challenger_id end;

  v_round := public.duel_pick_round(p_duel_id, v_uid);
  if v_round is null then
    return jsonb_build_object('error', 'not_picking');
  end if;

  if exists (select 1 from public.duel_numbers
             where duel_id = p_duel_id and round = v_round and set_by = v_uid) then
    return jsonb_build_object('error', 'already_set');
  end if;

  insert into public.duel_numbers (duel_id, round, for_user, set_by, answer, clue1)
  values (p_duel_id, v_round, v_other, v_uid, p_number, public.pick_clue1(p_number));

  -- Both in: the round opens for both at the same moment.
  if (select count(*) from public.duel_numbers
      where duel_id = p_duel_id and round = v_round) = 2 then
    insert into public.duel_progress (duel_id, user_id, round, attempts_allowed)
    values (p_duel_id, v_duel.challenger_id, v_round, public.duel_attempts(v_round)),
           (p_duel_id, v_duel.opponent_id,   v_round, public.duel_attempts(v_round))
    on conflict do nothing;
  end if;

  return jsonb_build_object(
    'ok', true,
    'round', v_round,
    'waitingForThem', (select count(*) from public.duel_numbers
                       where duel_id = p_duel_id and round = v_round) < 2
  );
end;
$$;

/**
 * Settle what can be settled.
 *
 * Rounds now come into existence as they are picked, so the count of rounds
 * played is what decides whether the match is over - not a fixed set drawn up
 * front.
 */
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
    if w is null then return; end if;         -- a round is still open
    if w = 'a' then v_a := v_a + 1; end if;
    if w = 'b' then v_b := v_b + 1; end if;
  end loop;

  -- Not three yet: the next round gets picked.
  if v_rounds < 3 then return; end if;

  -- Level after three, so a fourth is played. The duel stays active and
  -- duel_pick_round opens the decider.
  if v_a = v_b and v_rounds = 3 then return; end if;

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

/** A guess in a duel, against the number the other player chose for you. */
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

  select answer into v_answer from public.duel_numbers
  where duel_id = p_duel_id and round = v_round and for_user = v_uid;

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
    'answer', case when v_prog.status <> 'playing' then v_answer else null end
  );
end;
$$;

/**
 * One duel, from my side.
 *
 * Adds the picking phase: which round wants a number from me, and whether I am
 * waiting on theirs. A settled round shows both attempt counts and who took it;
 * a round still in progress shows neither.
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
  v_pick   int;
  v_mine_set boolean := false;
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

  v_pick := public.duel_pick_round(p_duel_id, v_uid);
  if v_pick is not null then
    v_mine_set := exists (select 1 from public.duel_numbers
                          where duel_id = p_duel_id and round = v_pick and set_by = v_uid);
  end if;

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
    select answer into v_answer from public.duel_numbers
    where duel_id = p_duel_id and round = v_round and for_user = v_uid;
  end if;

  return jsonb_build_object(
    'id', v_duel.id,
    'status', v_duel.status,
    'opponent', (select coalesce(username, 'Player') from public.profiles where id = v_other),
    'waitingForThem', v_waiting,
    -- The picking phase. 'pickRound' is the round wanting a number from me;
    -- once I have set it, I am waiting on theirs.
    'pickRound', v_pick,
    'pickSubmitted', v_mine_set,
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
      'clue1', (select clue1 from public.duel_numbers
                where duel_id = p_duel_id and round = v_round and for_user = v_uid),
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
    -- One row per round that has opened, revealed once that round is settled.
    'rounds', coalesce((
      select jsonb_agg(x order by x.round)
      from (
        select
          dp.round,
          public.duel_round_winner(p_duel_id, dp.round) is not null as settled,
          case public.duel_round_winner(p_duel_id, dp.round)
            when 'tie' then 'tie'
            when case when v_am_a then 'a' else 'b' end then 'won'
            when null then null
            else 'lost'
          end as result,
          (select attempts_used from public.duel_progress
            where duel_id = p_duel_id and user_id = v_uid and round = dp.round) as mine,
          (select status from public.duel_progress
            where duel_id = p_duel_id and user_id = v_uid and round = dp.round) as "mineStatus",
          case when public.duel_round_winner(p_duel_id, dp.round) is not null
               then (select attempts_used from public.duel_progress
                     where duel_id = p_duel_id and user_id = v_other and round = dp.round) end as theirs,
          case when public.duel_round_winner(p_duel_id, dp.round) is not null
               then (select status from public.duel_progress
                     where duel_id = p_duel_id and user_id = v_other and round = dp.round) end as "theirStatus",
          -- The number I set for them, once that round is settled. Mine stays
          -- hidden until the round is over for the same reason as the daily.
          case when public.duel_round_winner(p_duel_id, dp.round) is not null
               then (select answer from public.duel_numbers
                     where duel_id = p_duel_id and round = dp.round and set_by = v_uid) end as "iSet",
          case when public.duel_round_winner(p_duel_id, dp.round) is not null
               then (select answer from public.duel_numbers
                     where duel_id = p_duel_id and round = dp.round and for_user = v_uid) end as "theySet"
        from (select distinct round from public.duel_progress where duel_id = p_duel_id) dp
      ) x
    ), '[]'::jsonb)
  );
end;
$$;

/** The list, with whether this duel is waiting on me for anything. */
create or replace function public.duel_list()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    return jsonb_build_object('error', 'not_authenticated');
  end if;

  return jsonb_build_object('duels', coalesce((
    select jsonb_agg(x order by x.created_at desc)
    from (
      select
        d.id,
        d.status,
        d.created_at,
        d.challenger_id = v_uid as i_challenged,
        coalesce(p.username, 'Player') as opponent,
        (select count(*) from public.duel_progress g
          where g.duel_id = d.id and g.user_id = v_uid and g.status <> 'playing') as my_done,
        (select count(*) from public.duel_progress g
          where g.duel_id = d.id and g.user_id <> v_uid and g.status <> 'playing') as their_done,
        -- A number to pick, or a round to play.
        (public.duel_pick_round(d.id, v_uid) is not null
           and not exists (select 1 from public.duel_numbers n
                           where n.duel_id = d.id
                             and n.round = public.duel_pick_round(d.id, v_uid)
                             and n.set_by = v_uid)) as needs_number,
        exists (select 1 from public.duel_progress g
                where g.duel_id = d.id and g.user_id = v_uid and g.status = 'playing') as needs_play,
        case
          when d.status <> 'complete' then null
          when d.winner_id is null then 'draw'
          when d.winner_id = v_uid then 'won'
          else 'lost'
        end as outcome,
        public.duel_streak(
          v_uid,
          case when d.challenger_id = v_uid then d.opponent_id else d.challenger_id end
        ) as streak
      from public.duels d
      join public.profiles p
        on p.id = case when d.challenger_id = v_uid then d.opponent_id else d.challenger_id end
      where v_uid in (d.challenger_id, d.opponent_id)
        and d.status <> 'declined'
    ) x
  ), '[]'::jsonb));
end;
$$;

revoke execute on function public.duel_pick_round(uuid, uuid)      from public, anon;
revoke execute on function public.duel_set_number(uuid, integer)   from public, anon;
revoke execute on function public.respond_duel(uuid, boolean)      from public, anon;
revoke execute on function public.resolve_duel(uuid)               from public, anon, authenticated;
revoke execute on function public.duel_guess(uuid, integer)        from public, anon;
revoke execute on function public.duel_state(uuid)                 from public, anon;
revoke execute on function public.duel_list()                      from public, anon;
grant execute on function public.duel_set_number(uuid, integer) to authenticated;
grant execute on function public.respond_duel(uuid, boolean)    to authenticated;
grant execute on function public.duel_guess(uuid, integer)      to authenticated;
grant execute on function public.duel_state(uuid)               to authenticated;
grant execute on function public.duel_list()                    to authenticated;

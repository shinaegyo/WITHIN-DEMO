-- Head-to-head duels between friends.
--
-- Both players get the same three numbers and the same 7/6/5 attempts. A round
-- goes to whoever solved it in fewer guesses; equal counts settle nothing. The
-- duel goes to whoever won more rounds, and if that ties, to whoever used fewer
-- guesses overall.
--
-- Numbers are generated rather than chosen by the challenger. In a 1-1000 range
-- with distance bands no number is harder than another, so choosing adds no
-- strategy - but it does add a way to make the duel easier, because people pick
-- memorable numbers and opponents guess round ones early.
--
-- Asynchronous by necessity: two friends will not be at their phones together.
-- Each plays whenever they like and the result resolves when the second
-- finishes. Until then neither can see the other's board, which matters less
-- for the attempt counts than for the numbers themselves.

create table if not exists public.duels (
  id            uuid primary key default gen_random_uuid(),
  challenger_id uuid not null references auth.users(id) on delete cascade,
  opponent_id   uuid not null references auth.users(id) on delete cascade,
  status        text not null default 'pending'
                check (status in ('pending', 'active', 'complete', 'declined')),
  winner_id     uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  accepted_at   timestamptz,
  finished_at   timestamptz,

  check (challenger_id <> opponent_id)
);

alter table public.duels enable row level security;

drop policy if exists "read own duels" on public.duels;
create policy "read own duels" on public.duels
  for select using (auth.uid() in (challenger_id, opponent_id));

create index if not exists duels_opponent_idx on public.duels (opponent_id, status);
create index if not exists duels_challenger_idx on public.duels (challenger_id, status);

-- The answers. RLS on with no policy at all, exactly like the daily secrets:
-- invisible through the API, reachable only inside a definer function.
create table if not exists public.duel_rounds (
  duel_id uuid not null references public.duels(id) on delete cascade,
  round   smallint not null check (round between 1 and 3),
  answer  smallint not null check (answer between 1 and 1000),
  clue1   text not null,
  clue2   text not null,
  primary key (duel_id, round)
);

alter table public.duel_rounds enable row level security;

create table if not exists public.duel_progress (
  duel_id        uuid not null references public.duels(id) on delete cascade,
  user_id        uuid not null references auth.users(id) on delete cascade,
  round          smallint not null check (round between 1 and 3),
  attempts_used  smallint not null default 0,
  attempts_allowed smallint not null,
  status         text not null default 'playing' check (status in ('playing', 'won', 'lost')),
  clue2_unlocked boolean not null default false,
  primary key (duel_id, user_id, round)
);

alter table public.duel_progress enable row level security;

-- Only your own board, and only while the duel is unfinished. Seeing an
-- opponent's rows early would not reveal a number, but it would show how they
-- are doing, and the point of the reveal is that it happens at the end.
drop policy if exists "read own duel progress" on public.duel_progress;
create policy "read own duel progress" on public.duel_progress
  for select using (auth.uid() = user_id);

create table if not exists public.duel_guesses (
  id          uuid primary key default gen_random_uuid(),
  duel_id     uuid not null references public.duels(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  round       smallint not null check (round between 1 and 3),
  guess_index smallint not null,
  guess       smallint not null check (guess between 1 and 1000),
  direction   text not null check (direction in ('below', 'above', 'correct')),
  tier        text not null,
  created_at  timestamptz not null default now(),

  unique (duel_id, user_id, round, guess_index),
  unique (duel_id, user_id, round, guess)
);

alter table public.duel_guesses enable row level security;

drop policy if exists "read own duel guesses" on public.duel_guesses;
create policy "read own duel guesses" on public.duel_guesses
  for select using (auth.uid() = user_id);

/** Attempts for a duel round: the same 7/6/5 shape as a daily, without the twists. */
create or replace function public.duel_attempts(p_round integer)
returns smallint
language sql
immutable
as $$
  select (case p_round when 1 then 7 when 2 then 6 else 5 end)::smallint;
$$;

/** Challenge a friend. Both must already be friends, mutually. */
create or replace function public.challenge_friend(p_username text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid    uuid := auth.uid();
  v_target uuid;
  v_id     uuid;
begin
  if v_uid is null then
    return jsonb_build_object('error', 'not_authenticated');
  end if;

  v_target := public.user_id_for_username(p_username);
  if v_target is null then
    return jsonb_build_object('error', 'no_such_user');
  end if;
  if v_target = v_uid then
    return jsonb_build_object('error', 'thats_you');
  end if;

  if not exists (
    select 1 from public.friendships f
    where f.status = 'accepted'
      and ((f.requester_id = v_uid and f.addressee_id = v_target)
        or (f.addressee_id = v_uid and f.requester_id = v_target))
  ) then
    return jsonb_build_object('error', 'not_friends');
  end if;

  -- One live duel per pair at a time, or the list becomes a pile.
  if exists (
    select 1 from public.duels d
    where d.status in ('pending', 'active')
      and ((d.challenger_id = v_uid and d.opponent_id = v_target)
        or (d.opponent_id = v_uid and d.challenger_id = v_target))
  ) then
    return jsonb_build_object('error', 'duel_already_open');
  end if;

  insert into public.duels (challenger_id, opponent_id)
  values (v_uid, v_target)
  returning id into v_id;

  return jsonb_build_object('status', 'challenged', 'duelId', v_id);
end;
$$;

/** Accept or decline. Accepting is what draws the three numbers. */
create or replace function public.respond_duel(p_duel_id uuid, p_accept boolean)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_duel public.duels%rowtype;
  r int;
  n int;
  picked int[] := '{}';
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

  for r in 1 .. 3 loop
    loop
      n := 1 + floor(random() * 1000)::int;
      exit when not (n = any(picked));
    end loop;
    picked := picked || n;

    insert into public.duel_rounds (duel_id, round, answer, clue1, clue2)
    values (v_duel.id, r, n, public.pick_clue1(n), public.pick_clue2(n));

    -- Both boards are laid out now, so neither player waits on the other to
    -- start.
    insert into public.duel_progress (duel_id, user_id, round, attempts_allowed)
    values (v_duel.id, v_duel.challenger_id, r, public.duel_attempts(r)),
           (v_duel.id, v_duel.opponent_id,  r, public.duel_attempts(r));
  end loop;

  update public.duels set status = 'active', accepted_at = now() where id = v_duel.id;

  return jsonb_build_object('status', 'accepted', 'duelId', v_duel.id);
end;
$$;

/**
 * Settle a duel once both players have finished all three rounds.
 *
 * A round goes to the fewer attempts among solvers; a player who did not solve
 * it counts as worse than anyone who did, and two non-solvers draw. The duel
 * goes to more rounds won, then to fewer attempts overall, then to nobody.
 */
create or replace function public.resolve_duel(p_duel_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_duel public.duels%rowtype;
  v_a uuid; v_b uuid;
  v_a_rounds int := 0; v_b_rounds int := 0;
  v_a_total int := 0;  v_b_total int := 0;
  r int;
  a_used int; a_won boolean; b_used int; b_won boolean;
  a_cost int; b_cost int;
begin
  select * into v_duel from public.duels where id = p_duel_id for update;
  if v_duel.id is null or v_duel.status <> 'active' then
    return;
  end if;

  -- Both sides must be done.
  if exists (
    select 1 from public.duel_progress p
    where p.duel_id = p_duel_id and p.status = 'playing'
  ) then
    return;
  end if;

  v_a := v_duel.challenger_id;
  v_b := v_duel.opponent_id;

  for r in 1 .. 3 loop
    select attempts_used, status = 'won' into a_used, a_won
      from public.duel_progress where duel_id = p_duel_id and user_id = v_a and round = r;
    select attempts_used, status = 'won' into b_used, b_won
      from public.duel_progress where duel_id = p_duel_id and user_id = v_b and round = r;

    -- Not solving costs more than any solve, so a last-attempt win still beats
    -- a miss that used the same number of guesses.
    a_cost := case when a_won then a_used else a_used + 1 end;
    b_cost := case when b_won then b_used else b_used + 1 end;

    v_a_total := v_a_total + a_cost;
    v_b_total := v_b_total + b_cost;

    if a_won and (not b_won or a_used < b_used) then
      v_a_rounds := v_a_rounds + 1;
    elsif b_won and (not a_won or b_used < a_used) then
      v_b_rounds := v_b_rounds + 1;
    end if;
  end loop;

  update public.duels set
    status = 'complete',
    finished_at = now(),
    winner_id = case
      when v_a_rounds > v_b_rounds then v_a
      when v_b_rounds > v_a_rounds then v_b
      when v_a_total < v_b_total   then v_a
      when v_b_total < v_a_total   then v_b
      else null
    end
  where id = p_duel_id;
end;
$$;

/** A guess in a duel. Mirrors the daily, without scoring or streaks. */
create or replace function public.duel_guess(p_duel_id uuid, p_guess integer)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid      uuid := auth.uid();
  v_duel     public.duels%rowtype;
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

  select min(round) into v_round from public.duel_progress
  where duel_id = p_duel_id and user_id = v_uid and status = 'playing';

  if v_round is null then
    return jsonb_build_object('error', 'already_played');
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

revoke execute on function public.duel_attempts(integer)            from public, anon;
revoke execute on function public.challenge_friend(text)            from public, anon;
revoke execute on function public.respond_duel(uuid, boolean)       from public, anon;
revoke execute on function public.resolve_duel(uuid)                from public, anon, authenticated;
revoke execute on function public.duel_guess(uuid, integer)         from public, anon;

grant execute on function public.challenge_friend(text)      to authenticated;
grant execute on function public.respond_duel(uuid, boolean) to authenticated;
grant execute on function public.duel_guess(uuid, integer)   to authenticated;

/** Every duel involving me, with just enough to list them. */
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
        -- Rounds I have finished, so the list can say whose turn it is.
        (select count(*) from public.duel_progress g
          where g.duel_id = d.id and g.user_id = v_uid and g.status <> 'playing') as my_done,
        (select count(*) from public.duel_progress g
          where g.duel_id = d.id and g.user_id <> v_uid and g.status <> 'playing') as their_done,
        case
          when d.status <> 'complete' then null
          when d.winner_id is null then 'draw'
          when d.winner_id = v_uid then 'won'
          else 'lost'
        end as outcome
      from public.duels d
      join public.profiles p
        on p.id = case when d.challenger_id = v_uid then d.opponent_id else d.challenger_id end
      where v_uid in (d.challenger_id, d.opponent_id)
        and d.status <> 'declined'
    ) x
  ), '[]'::jsonb));
end;
$$;

/**
 * One duel, from my side.
 *
 * The opponent's board is withheld until the duel is complete — not because
 * attempt counts would help, but because anything drawn from their rounds is a
 * step closer to leaking the numbers.
 */
create or replace function public.duel_state(p_duel_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid   uuid := auth.uid();
  v_duel  public.duels%rowtype;
  v_round int;
  v_prog  public.duel_progress%rowtype;
  v_other uuid;
begin
  if v_uid is null then
    return jsonb_build_object('error', 'not_authenticated');
  end if;

  select * into v_duel from public.duels
  where id = p_duel_id and v_uid in (challenger_id, opponent_id);

  if v_duel.id is null then
    return jsonb_build_object('error', 'no_such_duel');
  end if;

  v_other := case when v_duel.challenger_id = v_uid then v_duel.opponent_id
                  else v_duel.challenger_id end;

  select min(round) into v_round from public.duel_progress
  where duel_id = p_duel_id and user_id = v_uid and status = 'playing';

  if v_round is not null then
    select * into v_prog from public.duel_progress
    where duel_id = p_duel_id and user_id = v_uid and round = v_round;
  end if;

  return jsonb_build_object(
    'id', v_duel.id,
    'status', v_duel.status,
    'opponent', (select coalesce(username, 'Player') from public.profiles where id = v_other),
    'outcome', case
      when v_duel.status <> 'complete' then null
      when v_duel.winner_id is null then 'draw'
      when v_duel.winner_id = v_uid then 'won'
      else 'lost'
    end,
    'round', case when v_round is null then null else jsonb_build_object(
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
                 'isCorrect', g.direction = 'correct',
                 'isWithin10', false, 'isOneAway', false
               ) order by g.guess_index)
        from public.duel_guesses g
        where g.duel_id = p_duel_id and g.user_id = v_uid and g.round = v_round
      ), '[]'::jsonb)
    ) end,
    'mine', coalesce((
      select jsonb_agg(jsonb_build_object(
               'round', g.round, 'status', g.status, 'attemptsUsed', g.attempts_used)
             order by g.round)
      from public.duel_progress g where g.duel_id = p_duel_id and g.user_id = v_uid
    ), '[]'::jsonb),
    -- Only once it is over.
    'theirs', case when v_duel.status = 'complete' then coalesce((
      select jsonb_agg(jsonb_build_object(
               'round', g.round, 'status', g.status, 'attemptsUsed', g.attempts_used)
             order by g.round)
      from public.duel_progress g where g.duel_id = p_duel_id and g.user_id = v_other
    ), '[]'::jsonb) else '[]'::jsonb end
  );
end;
$$;

revoke execute on function public.duel_list()      from public, anon;
revoke execute on function public.duel_state(uuid) from public, anon;
grant execute on function public.duel_list()       to authenticated;
grant execute on function public.duel_state(uuid)  to authenticated;

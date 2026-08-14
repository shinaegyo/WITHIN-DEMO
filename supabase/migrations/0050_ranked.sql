-- Ranked: the same duel, played for something.
--
-- A ranked match is a duel - both players pick, three rounds and a decider - so
-- there is one engine and one set of rules to reason about. What differs is
-- what happens at the end: a rating moves, and the belt can change hands.
--
-- Rating is Elo, which is the only part of this that has to be zero-sum. What
-- the winner gains the loser drops, so the ladder cannot inflate no matter how
-- much anyone plays. Beating someone far below you is worth almost nothing;
-- beating someone far above is worth a lot. That is the whole point - it stops
-- a ladder in a group this small from being a measure of who played most.
--
-- The belt is the part people will actually chase. One person holds it, it
-- shows against their name, and the only way to get it is to beat whoever has
-- it. It cannot be earned by grinding and losing it costs nothing you built,
-- which is what makes it safe to take from someone you know.

alter table public.duels add column if not exists ranked boolean not null default false;

create index if not exists duels_ranked_idx on public.duels (ranked, status);

-- ------------------------------------------------------------------ rating

create table if not exists public.ranked_stats (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  rating     integer not null default 1000,
  played     integer not null default 0,
  won        integer not null default 0,
  lost       integer not null default 0,
  drawn      integer not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.ranked_stats enable row level security;

-- ------------------------------------------------------------------- queue

-- One row per player looking for a match. Async by design: nine people are
-- never online together, so "queue" here means "willing", not "waiting".
create table if not exists public.ranked_queue (
  user_id   uuid primary key references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now()
);

alter table public.ranked_queue enable row level security;

-- -------------------------------------------------------------------- belt

create table if not exists public.belt (
  only_row   boolean primary key default true check (only_row),
  holder_id  uuid references auth.users(id) on delete set null,
  since      timestamptz,
  taken_from uuid references auth.users(id) on delete set null,

  check (only_row)
);

alter table public.belt enable row level security;

insert into public.belt (only_row) values (true) on conflict do nothing;

/** Rating change for one result. K is larger while a player is still placing. */
create or replace function public.elo_delta(p_mine integer, p_theirs integer,
                                            p_score numeric, p_played integer)
returns integer
language sql
immutable
as $$
  select round(
    (case when p_played < 5 then 40 else 24 end)
    * (p_score - 1.0 / (1.0 + power(10.0, (p_theirs - p_mine) / 400.0)))
  )::integer;
$$;

/** Everyone has a row the moment they need one. */
create or replace function public.ensure_ranked_stats(p_uid uuid)
returns public.ranked_stats
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row public.ranked_stats%rowtype;
begin
  insert into public.ranked_stats (user_id) values (p_uid) on conflict do nothing;
  select * into v_row from public.ranked_stats where user_id = p_uid;
  return v_row;
end;
$$;

/**
 * The belt, if anyone still holds it.
 *
 * A holder who stops playing ranked for a week is not defending it, and a belt
 * nobody can take is just a badge. After that it is vacant and the next winner
 * claims it.
 */
create or replace function public.belt_holder()
returns uuid
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_holder uuid;
  v_last   timestamptz;
begin
  select holder_id into v_holder from public.belt;
  if v_holder is null then return null; end if;

  select max(d.finished_at) into v_last from public.duels d
  where d.ranked and d.status = 'complete'
    and v_holder in (d.challenger_id, d.opponent_id);

  if v_last is null or v_last < now() - interval '7 days' then
    return null;
  end if;

  return v_holder;
end;
$$;

/**
 * Settle a finished ranked match: move the rating, move the belt.
 *
 * Called from resolve_duel the moment a ranked duel completes, and only then,
 * so a rating can never be applied twice to the same match.
 */
create or replace function public.apply_ranked_result(p_duel_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_duel   public.duels%rowtype;
  a        public.ranked_stats%rowtype;
  b        public.ranked_stats%rowtype;
  a_score  numeric;
  a_delta  int;
  b_delta  int;
  v_holder uuid;
  v_loser  uuid;
begin
  select * into v_duel from public.duels where id = p_duel_id;
  if v_duel.id is null or not v_duel.ranked or v_duel.status <> 'complete' then
    return;
  end if;

  a := public.ensure_ranked_stats(v_duel.challenger_id);
  b := public.ensure_ranked_stats(v_duel.opponent_id);

  a_score := case when v_duel.winner_id is null then 0.5
                  when v_duel.winner_id = v_duel.challenger_id then 1.0
                  else 0.0 end;

  a_delta := public.elo_delta(a.rating, b.rating, a_score, a.played);
  b_delta := public.elo_delta(b.rating, a.rating, 1.0 - a_score, b.played);

  update public.ranked_stats set
    rating = greatest(100, rating + a_delta),
    played = played + 1,
    won   = won   + (case when a_score = 1.0 then 1 else 0 end),
    lost  = lost  + (case when a_score = 0.0 then 1 else 0 end),
    drawn = drawn + (case when a_score = 0.5 then 1 else 0 end),
    updated_at = now()
  where user_id = v_duel.challenger_id;

  update public.ranked_stats set
    rating = greatest(100, rating + b_delta),
    played = played + 1,
    won   = won   + (case when a_score = 0.0 then 1 else 0 end),
    lost  = lost  + (case when a_score = 1.0 then 1 else 0 end),
    drawn = drawn + (case when a_score = 0.5 then 1 else 0 end),
    updated_at = now()
  where user_id = v_duel.opponent_id;

  -- A draw settles nothing, so the belt does not move on one.
  if v_duel.winner_id is null then return; end if;

  v_loser  := case when v_duel.winner_id = v_duel.challenger_id
                   then v_duel.opponent_id else v_duel.challenger_id end;
  v_holder := public.belt_holder();

  -- Taken from the holder, or claimed while it is going spare.
  if v_holder is null or v_holder = v_loser then
    update public.belt set
      holder_id = v_duel.winner_id,
      since = now(),
      taken_from = case when v_holder = v_loser then v_loser end;
  end if;
end;
$$;

/**
 * Settle what can be settled, and pay out if the match was ranked.
 *
 * Same as before other than the last line: everything about how a duel is
 * decided stays in one place.
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
  where id = p_duel_id;

  perform public.apply_ranked_result(p_duel_id);
end;
$$;

/** Forfeiting a ranked match costs rating, or it is just a way to dodge one. */
create or replace function public.duel_forfeit(p_duel_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid   uuid := auth.uid();
  v_duel  public.duels%rowtype;
  v_other uuid;
begin
  if v_uid is null then
    return jsonb_build_object('error', 'not_authenticated');
  end if;

  select * into v_duel from public.duels
  where id = p_duel_id and v_uid in (challenger_id, opponent_id)
  for update;

  if v_duel.id is null then
    return jsonb_build_object('error', 'no_such_duel');
  end if;

  v_other := case when v_duel.challenger_id = v_uid then v_duel.opponent_id
                  else v_duel.challenger_id end;

  if v_duel.status = 'pending' then
    update public.duels set status = 'declined', finished_at = now()
    where id = v_duel.id;
    return jsonb_build_object('status', 'withdrawn');
  end if;

  if v_duel.status <> 'active' then
    return jsonb_build_object('error', 'no_such_duel');
  end if;

  update public.duels set
    status = 'complete',
    winner_id = v_other,
    finished_at = now()
  where id = v_duel.id;

  perform public.apply_ranked_result(p_duel_id);

  return jsonb_build_object('status', 'forfeited');
end;
$$;

/**
 * A friendly challenge is no longer blocked by a ranked match against the same
 * person, and the other way round. They are separate games with separate
 * records; one should never lock the other out.
 */
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

  if exists (
    select 1 from public.duels d
    where d.status in ('pending', 'active')
      and not d.ranked
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

/**
 * Look for a ranked match.
 *
 * Pairs with whoever is closest in rating among the people waiting. If nobody
 * is, the player waits instead - with nine of them, "queue" means willing
 * rather than present, and the match starts whenever the second person arrives.
 *
 * A ranked match needs no accepting. Joining the queue is the consent, and a
 * pairing that then sat waiting for someone to press accept would be the
 * slowest possible way to start a game nobody is watching for.
 */
create or replace function public.ranked_find()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid   uuid := auth.uid();
  v_mine  public.ranked_stats%rowtype;
  v_other uuid;
  v_id    uuid;
begin
  if v_uid is null then
    return jsonb_build_object('error', 'not_authenticated');
  end if;

  -- One ranked match at a time. Two would make the rating meaningless while
  -- both were open.
  if exists (
    select 1 from public.duels d
    where d.ranked and d.status = 'active'
      and v_uid in (d.challenger_id, d.opponent_id)
  ) then
    return jsonb_build_object('error', 'ranked_already_open');
  end if;

  v_mine := public.ensure_ranked_stats(v_uid);

  select q.user_id into v_other
  from public.ranked_queue q
  join public.ranked_stats s on s.user_id = q.user_id
  where q.user_id <> v_uid
    and not exists (
      select 1 from public.duels d
      where d.ranked and d.status = 'active'
        and q.user_id in (d.challenger_id, d.opponent_id)
    )
  order by abs(s.rating - v_mine.rating), q.joined_at
  limit 1;

  if v_other is null then
    insert into public.ranked_queue (user_id) values (v_uid)
    on conflict (user_id) do nothing;
    return jsonb_build_object('status', 'queued');
  end if;

  delete from public.ranked_queue where user_id in (v_uid, v_other);

  insert into public.duels (challenger_id, opponent_id, ranked, status, accepted_at)
  values (v_uid, v_other, true, 'active', now())
  returning id into v_id;

  return jsonb_build_object('status', 'matched', 'duelId', v_id);
end;
$$;

create or replace function public.ranked_leave_queue()
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
  delete from public.ranked_queue where user_id = v_uid;
  return jsonb_build_object('ok', true);
end;
$$;

/** Everything the ranked screen needs in one call. */
create or replace function public.ranked_state()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid    uuid := auth.uid();
  v_mine   public.ranked_stats%rowtype;
  v_holder uuid;
begin
  if v_uid is null then
    return jsonb_build_object('error', 'not_authenticated');
  end if;

  v_mine   := public.ensure_ranked_stats(v_uid);
  v_holder := public.belt_holder();

  return jsonb_build_object(
    'rating', v_mine.rating,
    'played', v_mine.played,
    'won', v_mine.won,
    'lost', v_mine.lost,
    'drawn', v_mine.drawn,
    'placing', v_mine.played < 5,
    'rank', (select count(*) + 1 from public.ranked_stats s
             where s.played > 0 and s.rating > v_mine.rating),
    'of', (select count(*) from public.ranked_stats where played > 0),
    'queued', exists (select 1 from public.ranked_queue where user_id = v_uid),
    'waiting', (select count(*) from public.ranked_queue where user_id <> v_uid),
    'beltHolder', (select username from public.profiles where id = v_holder),
    'iHoldBelt', v_holder = v_uid,
    'match', (
      select jsonb_build_object(
               'id', d.id,
               'opponent', (select username from public.profiles
                            where id = case when d.challenger_id = v_uid
                                            then d.opponent_id else d.challenger_id end)
             )
      from public.duels d
      where d.ranked and d.status = 'active'
        and v_uid in (d.challenger_id, d.opponent_id)
      limit 1
    ),
    'board', coalesce((
      select jsonb_agg(x order by x.rank, x.name)
      from (
        select
          rank() over (order by s.rating desc) as rank,
          p.username as name,
          s.rating,
          s.won,
          s.lost,
          s.user_id = v_uid as is_me,
          s.user_id = v_holder as has_belt
        from public.ranked_stats s
        join public.profiles p on p.id = s.user_id
        where s.played > 0
        order by s.rating desc
        limit 50
      ) x
    ), '[]'::jsonb)
  );
end;
$$;

revoke execute on function public.elo_delta(integer, integer, numeric, integer) from public, anon, authenticated;
revoke execute on function public.ensure_ranked_stats(uuid)   from public, anon, authenticated;
revoke execute on function public.apply_ranked_result(uuid)   from public, anon, authenticated;
revoke execute on function public.belt_holder()               from public, anon;
revoke execute on function public.ranked_find()               from public, anon;
revoke execute on function public.ranked_leave_queue()        from public, anon;
revoke execute on function public.ranked_state()              from public, anon;
grant execute on function public.ranked_find()        to authenticated;
grant execute on function public.ranked_leave_queue() to authenticated;
grant execute on function public.ranked_state()       to authenticated;

/** The list, now saying which duels are ranked so the two can be kept apart. */
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
        d.ranked,
        d.challenger_id = v_uid as i_challenged,
        coalesce(p.username, 'Player') as opponent,
        (select count(*) from public.duel_progress g
          where g.duel_id = d.id and g.user_id = v_uid and g.status <> 'playing') as my_done,
        (select count(*) from public.duel_progress g
          where g.duel_id = d.id and g.user_id <> v_uid and g.status <> 'playing') as their_done,
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

revoke execute on function public.duel_list() from public, anon;
grant execute on function public.duel_list() to authenticated;

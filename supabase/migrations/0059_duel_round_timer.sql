-- Three minutes a round, and challenges only to people who are here.
--
-- A duel could sit open for days: someone set a number, the other person never
-- came back, and the match was a notification neither of them could act on. A
-- clock makes a round a thing that happens rather than a thing that is pending.
--
-- Three minutes from the moment the round opens - which is when both numbers
-- are in, so it starts at the same instant for both players. Running out is
-- exactly like running out of attempts: the round is lost and the other person
-- takes it.
--
-- The clock is the server's. A timer counted on the phone is a suggestion, and
-- the phone belongs to one of the two people it would be judging.
--
-- Challenges now need the other person to be online, for the same reason: a
-- three-minute round sent to somebody who is asleep is a loss posted to their
-- account before they have seen it.

alter table public.duel_progress
  add column if not exists started_at timestamptz not null default now();

/** Seconds left in a round, or null when it is not being played. */
create or replace function public.duel_seconds_left(p_duel_id uuid, p_uid uuid, p_round integer)
returns integer
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select greatest(0, 180 - extract(epoch from now() - p.started_at))::int
  from public.duel_progress p
  where p.duel_id = p_duel_id and p.user_id = p_uid and p.round = p_round
    and p.status = 'playing';
$$;

/**
 * Close any round whose three minutes are up.
 *
 * Called wherever a duel is read or written, so the clock runs without a
 * scheduler: a player opening the screen settles their own expired round, and
 * their opponent's, which is the only way a timer can matter to somebody who
 * has closed the app.
 */
create or replace function public.duel_expire_rounds(p_duel_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.duel_progress set
    status = 'lost',
    attempts_used = attempts_allowed
  where duel_id = p_duel_id
    and status = 'playing'
    and started_at < now() - interval '180 seconds';

  if found then
    perform public.resolve_duel(p_duel_id);
  end if;
end;
$$;

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

  -- Anything already out of time is settled before this guess is considered.
  perform public.duel_expire_rounds(p_duel_id);

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
    'secondsLeft', public.duel_seconds_left(p_duel_id, v_uid, v_round),
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

/** Reading a duel also settles anything that ran out while nobody was looking. */
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

  perform public.duel_expire_rounds(p_duel_id);

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
    'ranked', v_duel.ranked,
    'opponent', (select coalesce(username, 'Player') from public.profiles where id = v_other),
    'opponentOnline', (select last_seen_at > now() - interval '2 minutes'
                       from public.profiles where id = v_other),
    'waitingForThem', v_waiting,
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
      'secondsLeft', public.duel_seconds_left(p_duel_id, v_uid, v_round),
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
                     where duel_id = p_duel_id and user_id = v_other and round = dp.round) end as "theirStatus"
        from (select distinct round from public.duel_progress where duel_id = p_duel_id) dp
      ) x
    ), '[]'::jsonb)
  );
end;
$$;

/** A challenge goes to somebody who is actually here to play it. */
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

  -- Rounds are three minutes long, so a challenge to somebody who has closed
  -- the app is a loss posted to their account before they have seen it.
  if not exists (
    select 1 from public.profiles
    where id = v_target and last_seen_at > now() - interval '2 minutes'
  ) then
    return jsonb_build_object('error', 'not_online');
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

revoke execute on function public.duel_seconds_left(uuid, uuid, integer) from public, anon;
revoke execute on function public.duel_expire_rounds(uuid) from public, anon, authenticated;
revoke execute on function public.duel_guess(uuid, integer) from public, anon;
revoke execute on function public.duel_state(uuid)          from public, anon;
revoke execute on function public.challenge_friend(text)    from public, anon;
grant execute on function public.duel_guess(uuid, integer) to authenticated;
grant execute on function public.duel_state(uuid)          to authenticated;
grant execute on function public.challenge_friend(text)    to authenticated;

-- Random duels that actually happen.
--
-- There is a ranked queue in here already (0050): you join it, somebody else
-- joins it, and the two of you are matched. It has never worked and cannot,
-- because it needs two people waiting at the same moment - and with a few dozen
-- players spread across the day, two people are never in it at once. A queue is
-- a mechanism for a crowd.
--
-- A duel does not need one. Nobody plays a duel simultaneously anyway: you set
-- their number, they set yours, and each of you guesses whenever you next open
-- the app. So a random duel is just a duel where the server picks who, and it
-- lands in the other player's list exactly like a challenge from a friend.
--
-- Who gets picked matters more than the randomness. Three rules:
--
--   * They have to be playing. Somebody who last opened the game in July gets a
--     challenge that rots, and the person who sent it learns the feature is
--     broken.
--   * Nobody gets swamped. The fewest open challenges first, so the same
--     obliging player is not everybody's opponent.
--   * Never twice at once. An open duel with somebody means they are not a
--     candidate until it finishes.

alter table public.duels
  add column if not exists random_match boolean not null default false;

/**
 * Somebody to duel, or nothing.
 *
 * Ordered by open challenges first and randomness second, so the pick is fair
 * rather than merely arbitrary - among equally idle opponents it is a coin
 * toss, but a player already holding three challenges is behind one holding
 * none.
 */
create or replace function public.random_opponent(p_uid uuid)
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p.id
  from public.profiles p
  join public.stats s on s.user_id = p.id
  where p.id <> p_uid
    and p.username is not null
    -- Playing, not merely registered.
    and s.last_played_date >= public.current_puzzle_date(p_uid) - 10
    and not exists (
      select 1 from public.duels d
      where d.status in ('pending', 'active')
        and not d.ranked
        and ((d.challenger_id = p_uid and d.opponent_id = p.id)
          or (d.opponent_id = p_uid and d.challenger_id = p.id))
    )
  order by (
    select count(*) from public.duels d2
    where d2.opponent_id = p.id and d2.status = 'pending'
  ), random()
  limit 1;
$$;

/**
 * Challenge whoever the server picks.
 *
 * Deliberately the same shape as challenge_friend, and it writes the same row:
 * a pending duel the other player accepts or declines in their own time. The
 * only difference is the flag, so both screens can say where it came from - a
 * challenge from a stranger with no explanation is a small mystery, and this
 * is a game people play next to their friends.
 */
create or replace function public.challenge_random()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid    uuid := auth.uid();
  v_target uuid;
  v_id     uuid;
  v_name   text;
begin
  if v_uid is null then
    return jsonb_build_object('error', 'not_authenticated');
  end if;

  -- One at a time. Firing off six random challenges is how a dozen strangers
  -- each get a duel from the same person on the same afternoon.
  if (select count(*) from public.duels d
      where d.challenger_id = v_uid and d.status = 'pending' and d.random_match) >= 2 then
    return jsonb_build_object('error', 'random_pending');
  end if;

  v_target := public.random_opponent(v_uid);
  if v_target is null then
    return jsonb_build_object('error', 'nobody_free');
  end if;

  insert into public.duels (challenger_id, opponent_id, random_match)
  values (v_uid, v_target, true)
  returning id into v_id;

  select username into v_name from public.profiles where id = v_target;

  return jsonb_build_object('status', 'challenged', 'duelId', v_id, 'opponent', v_name);
end;
$$;

/** 0045's duel_list, carrying where the duel came from. */
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
        d.random_match,
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

revoke execute on function public.random_opponent(uuid) from public, anon, authenticated;
revoke execute on function public.challenge_random()    from public, anon;
revoke execute on function public.duel_list()           from public, anon;
grant execute on function public.challenge_random() to authenticated;
grant execute on function public.duel_list()        to authenticated;

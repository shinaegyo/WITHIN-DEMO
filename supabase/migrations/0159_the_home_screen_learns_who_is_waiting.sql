-- The home screen learns who is waiting, not how many.
--
-- home_status returned duelsWaiting as a count, so the most a home screen
-- could say about somebody challenging you was "1 waiting", in a third of a
-- tile, under the word Duel. Nobody is challenged by a number.
--
-- duelWaiting carries the same predicate as the count, resolved to one row:
-- the duel id, and the person on the other side of it with their avatar. The
-- id is there so pressing Play opens that duel rather than a list to go
-- looking through.
--
-- Pending sorts first. Somebody who has asked and had no answer is waiting on
-- you differently from a game already under way, and it is the one the screen
-- should name.
--
-- duelsWaiting stays exactly as it was; the tile still counts.

begin;

create or replace function public.home_status()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid  uuid := auth.uid();
  v_run  public.endless_runs%rowtype;
  v_has  uuid;
  v_date date;
  v_rush public.rush_runs%rowtype;
begin
  if v_uid is null then
    return jsonb_build_object('error', 'not_authenticated');
  end if;

  v_date := public.current_puzzle_date(v_uid);

  -- Through endless_climb, but only for somebody who already has a run.
  --
  -- The morning's health is handed out in endless_climb, and this function read
  -- the row directly - so on a new day the home row, the Games row and the
  -- climb board all reported yesterday's number until the player pressed Start.
  -- Not a lockout, since Start re-reads through endless_climb; it just meant the
  -- health shown was a day old at the moment somebody was deciding whether to
  -- play.
  --
  -- The existence check is not a micro-optimisation. endless_climb inserts a run
  -- when it finds none, and the leaderboard lists every run of the week with a
  -- username against it - so calling this unconditionally would put everybody
  -- who opened the app onto the Impossible board at level zero. Looking is not
  -- climbing, as 0070 has it. No row means no climb, and the coalesces below
  -- carry the untouched defaults exactly as before.
  select id into v_has from public.endless_runs
  where user_id = v_uid and week_start = public.endless_week(v_uid)
  order by started_at desc limit 1;

  if v_has is not null then
    v_run := public.endless_climb(v_uid);
  end if;

  select * into v_rush from public.rush_runs
  where user_id = v_uid and puzzle_date = v_date;

  return jsonb_build_object(
    'duelsWaiting', (
      select count(*) from public.duels d
      where not d.ranked
        and v_uid in (d.challenger_id, d.opponent_id)
        and (
          (d.status = 'pending' and d.opponent_id = v_uid)
          or (d.status = 'active' and (
                exists (select 1 from public.duel_progress g
                        where g.duel_id = d.id and g.user_id = v_uid and g.status = 'playing')
                or (public.duel_pick_round(d.id, v_uid) is not null
                    and not exists (select 1 from public.duel_numbers n
                                    where n.duel_id = d.id and n.set_by = v_uid
                                      and n.round = public.duel_pick_round(d.id, v_uid)))
             ))
        )
    ),
    -- The one waiting, by name.
    --
    -- duelsWaiting is a count, and a count is what the home screen had to work
    -- with: "1 waiting" on a third of a tile. Nobody is challenged by a
    -- number. Same predicate as the count above, one row, whoever is on the
    -- other side of it - so the screen can say who, and open their duel
    -- without a round trip to find out which one it meant.
    --
    -- Pending first: somebody who has asked and had no answer is waiting on
    -- you differently from a game already under way.
    'duelWaiting', (
      select jsonb_build_object(
        'duelId', d.id,
        'name', coalesce(p.username, 'Player ' || upper(right(p.id::text, 4))),
        'avatar', p.avatar,
        'pending', d.status = 'pending'
      )
      from public.duels d
      join public.profiles p
        on p.id = case when d.challenger_id = v_uid then d.opponent_id else d.challenger_id end
      where not d.ranked
        and v_uid in (d.challenger_id, d.opponent_id)
        and (
          (d.status = 'pending' and d.opponent_id = v_uid)
          or (d.status = 'active' and (
                exists (select 1 from public.duel_progress g
                        where g.duel_id = d.id and g.user_id = v_uid and g.status = 'playing')
                or (public.duel_pick_round(d.id, v_uid) is not null
                    and not exists (select 1 from public.duel_numbers n
                                    where n.duel_id = d.id and n.set_by = v_uid
                                      and n.round = public.duel_pick_round(d.id, v_uid)))
             ))
        )
      order by (d.status = 'pending') desc, d.created_at desc
      limit 1
    ),
    -- Waiting survives leaving the screen, so something other than that screen
    -- has to say it is still going on.
    'queued', public.is_queued(v_uid),
    'ranked', jsonb_build_object(
      'rating', null, 'played', 0, 'queued', false, 'inMatch', false,
      'needsMe', false, 'beltHolder', null, 'iHoldBelt', false
    ),
    'impossible', jsonb_build_object(
      'sessionsLeft', public.endless_sessions_left(v_uid),
      -- Whether today's climb is already open, which is what the button
      -- actually wants to know. sessionsLeft only ever answered the near-enough
      -- question - it flips on the first guess of a day, so a session opened
      -- and not yet guessed in reads as closed.
      'inSession', coalesce(v_run.session_date = v_date
                            and v_run.health > 0
                            and v_run.summit_at is null, false),
      'health', coalesce(v_run.health, 100),
      'summit', v_run.summit_at is not null,
      'lives', coalesce(v_run.lives, 0),
      'level', least(coalesce(v_run.level, 1), public.endless_max_level()),
      'best', greatest(0, least(coalesce(v_run.level, 1), public.endless_max_level() + 1) - 1)
    ),
    'rush', jsonb_build_object(
      'played', v_rush.id is not null and public.rush_left(v_rush) <= 0,
      'running', v_rush.id is not null and public.rush_left(v_rush) > 0,
      'found', coalesce(v_rush.found, 0)
    )
  );
end;
$$;

grant execute on function public.home_status() to authenticated;

commit;

-- Shape check. Null when nobody is waiting on you, which is the common case.
select public.home_status() -> 'duelWaiting' as duel_waiting;

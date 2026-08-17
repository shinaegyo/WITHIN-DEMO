-- The session counter goes, and the home row hands out the morning's health.
--
-- sessions_used never counts past one. endless_guess sets it to 1 on the first
-- guess of a day and nothing ever moves it again, so endless_sessions_left has
-- returned 1 of 2 for every player since the counter went in, whatever anybody
-- did. The two-a-day cap has never once bound.
--
-- Nothing is quietly broken by that, but five places on the client branch on
-- sessionsLeft = 0, and all five of those branches are dead code: the home row
-- can never say a climb is in progress, the Games row says "ready" to somebody
-- with an empty bar, and the board's Climb button never reads Resume. Every one
-- of them is really asking one of two questions - is today already open, and is
-- there health left - so they are given those directly.
--
-- The cap is removed rather than repaired. A limit on how much somebody may
-- play is the one thing this mode is not supposed to have; health ends a day
-- and nothing else does. sessionsLeft stays in the payload so older clients
-- keep parsing, and stays pinned above zero so their dead branches stay dead
-- rather than firing wrongly. inSession is the replacement.
--
-- Second thing, same function. home_status read endless_runs directly rather
-- than going through endless_climb, which is where the day's health is handed
-- out - so on a new morning the home row, the Games row and the Impossible
-- board all reported yesterday's number until the player pressed Start. Not a
-- lockout: Start re-reads through endless_climb and works fine. It just meant
-- the health shown was a day old at exactly the moment somebody was deciding
-- whether to play. 0136 said both callers came through endless_climb. Only
-- endless_state did.

begin;

create or replace function public.endless_start_session()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid    uuid := auth.uid();
  v_run    public.endless_runs%rowtype;
  v_today  date;
  v_newday boolean;
begin
  if v_uid is null then
    return jsonb_build_object('error', 'not_authenticated');
  end if;

  v_run := public.endless_climb(v_uid);
  v_today := public.current_puzzle_date(v_uid);

  if v_run.summit_at is not null then
    return jsonb_build_object('error', 'topped_out');
  end if;

  if v_run.session_date = v_today and v_run.health > 0 and v_run.status = 'active' then
    return jsonb_build_object('ok', true, 'resumed', true);
  end if;

  v_newday := v_run.session_date is distinct from v_today;

  -- The bar is empty and today has already given what it gives. Ending the day
  -- here is the point: the old code handed over a fresh hundred on every new
  -- session, so the fall that emptied the bar cost nothing at all.
  if v_run.health <= 0 then
    return jsonb_build_object('error', 'no_health');
  end if;

  -- No session cap. It never bound in the first place - sessions_used is set
  -- to 1 by the first guess of a day and nothing ever moves it again, so
  -- endless_sessions_left has always returned 1 of 2 whatever anybody did -
  -- and it should not bind: health is the day's limit and nothing else is
  -- meant to ration how much somebody plays. Removing the check makes what
  -- the code does match what it has always done.

  -- The board for this level belongs to the session that just ended.
  delete from public.endless_guesses
  where run_id = v_run.id and level = v_run.level;

  update public.endless_runs set
    attempts_used = 0,
    status = 'active',
    -- Only on a new day. Resetting this on every session start made
    -- endless_sessions_left recompute against zero every time, so the two-a-day
    -- limit never once bound - and each of those unlimited sessions used to
    -- arrive with a full bar.
    sessions_used = case when v_newday then 0 else sessions_used end,
    session_date = v_today,
    clue_level = null
  where id = v_run.id;

  return jsonb_build_object('ok', true, 'resumed', false, 'health', v_run.health);
end;
$$;

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
      -- actually wants to know. sessionsLeft cannot answer it: the counter is
      -- set to 1 on the first guess of a day and never moves again, so it never
      -- reaches zero and the board never said "Resume".
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

grant execute on function public.endless_start_session() to authenticated;
grant execute on function public.home_status()           to authenticated;

commit;

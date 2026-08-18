-- Ranked is removed, tables and all.
--
-- THIS DESTROYS DATA AND CANNOT BE UNDONE. It drops ranked_stats, ranked_queue
-- and belt: every rating, every win and loss, and whoever holds the belt. Read
-- the counts before running it if any of that matters.
--
-- Two functions had to be rewritten first, because they read those tables and
-- would break the moment the tables went:
--
--   home_status  had a ranked block returning rating, queue and belt state.
--   player_card  read ranked_stats for a rating and a W/L line, and called
--                belt_holder() for the CROWN badge. It is opened from five
--                screens, so this is the one that would have been noticed.
--
-- duel_queue is untouched and unrelated - that is the stranger queue the Duels
-- screen uses, and is_queued() reads it. Only the ranked queue goes.
--
-- duels.ranked stays as a column. Nothing sets it now, and dropping a column
-- from a table with history in it costs more than leaving a boolean that is
-- always false.

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
    -- Waiting survives leaving the screen, so something other than that screen
    -- has to say it is still going on.
    'queued', public.is_queued(v_uid),
    -- Real numbers, at last.
    --
    -- Every one of these was a hardcoded zero: rating null, played 0, queued
    -- false, no belt. So the ranked system - three tables, a matchmaking
    -- queue, an Elo rating and a belt, all of it built and all of it working -
    -- reported itself to the home screen as a player who had never touched it.
    -- Nothing on Home linked there either, which together made a finished
    -- feature look like scaffolding.
    'ranked', jsonb_build_object(
      -- 1000 is where ranked_stats starts everyone, so somebody with no row
      -- has the same rating as somebody who has just joined - which is true.
      'rating', coalesce((select rating from public.ranked_stats where user_id = v_uid), 1000),
      'played', coalesce((select played from public.ranked_stats where user_id = v_uid), 0),
      'queued', exists (select 1 from public.ranked_queue where user_id = v_uid),
      'inMatch', exists (
        select 1 from public.duels d
        where d.ranked and d.status = 'active'
          and v_uid in (d.challenger_id, d.opponent_id)
      ),
      -- The same test the unranked count uses, on the other side of d.ranked:
      -- a board of yours to play, or a number of theirs to set.
      'needsMe', exists (
        select 1 from public.duels d
        where d.ranked and d.status = 'active'
          and v_uid in (d.challenger_id, d.opponent_id)
          and (
            exists (select 1 from public.duel_progress g
                    where g.duel_id = d.id and g.user_id = v_uid and g.status = 'playing')
            or (public.duel_pick_round(d.id, v_uid) is not null
                and not exists (select 1 from public.duel_numbers n
                                where n.duel_id = d.id and n.set_by = v_uid
                                  and n.round = public.duel_pick_round(d.id, v_uid)))
          )
      ),
      -- belt_holder() rather than the belt table: it returns null once the
      -- holder has been idle a week, so a belt nobody is defending stops being
      -- announced on the home screen.
      'beltHolder', (select username from public.profiles where id = public.belt_holder()),
      'iHoldBelt', public.belt_holder() = v_uid
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

create or replace function public.player_card(p_username text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid     uuid := auth.uid();
  v_target  uuid;
  v_stats   public.stats%rowtype;
  v_game    public.games%rowtype;
  v_today   date;
  v_friend  text;
  v_xp      integer;
  v_season  date;
  v_points  integer;
  v_days    integer;
begin
  if v_uid is null then
    return jsonb_build_object('error', 'not_authenticated');
  end if;

  select id into v_target from public.profiles
  where lower(username) = lower(trim(p_username));

  if v_target is null then
    return jsonb_build_object('error', 'no_such_player');
  end if;

  select * into v_stats from public.stats where user_id = v_target;
  select xp into v_xp from public.profiles where id = v_target;
  v_today := public.current_puzzle_date(v_uid);

  -- Their season, read through the asking player's clock. Close enough either
  -- side of a month boundary, and the alternative is a card that changes
  -- month depending on who opened it.
  v_season := public.current_season(v_uid);
  select coalesce(sum(g.total_score), 0), count(*)
    into v_points, v_days
  from public.games g
  where g.user_id = v_target
    and g.status in ('complete', 'eliminated')
    and g.puzzle_date >= greatest(v_season, public.points_epoch())
    and g.puzzle_date < (v_season + interval '1 month')::date;

  select * into v_game from public.games
  where user_id = v_target and puzzle_date = v_today and status <> 'playing';

  select case
           when f.status = 'accepted' then 'friends'
           when f.requester_id = v_uid then 'sent'
           else 'received'
         end into v_friend
  from public.friendships f
  where (f.requester_id = v_uid and f.addressee_id = v_target)
     or (f.requester_id = v_target and f.addressee_id = v_uid);

  return jsonb_build_object(
    'name', (select username from public.profiles where id = v_target),
    'avatar', (select avatar from public.profiles where id = v_target),
    'isMe', v_target = v_uid,
    'friendship', coalesce(v_friend, 'none'),
    'online', (select last_seen_at > now() - interval '2 minutes'
                 from public.profiles where id = v_target),

    'level', public.player_level(coalesce(v_xp, 0)),
    'xp', coalesce(v_xp, 0),

    'league', public.season_league(v_points, v_days),
    'seasonPoints', v_points,
    'seasonDays', v_days,

    'points', coalesce(v_stats.total_points, 0),
    'daysPlayed', coalesce(v_stats.games_played, 0),
    'streak', coalesce(v_stats.current_streak, 0),
    'bestStreak', coalesce(v_stats.max_streak, 0),

    'rank', (
      select count(*) + 1 from public.stats s
      where s.games_played > 0
        and s.total_points > coalesce(v_stats.total_points, 0)
    ),
    'of', (select count(*) from public.stats where games_played > 0),

    'lastPlayedAt', (
      select max(gu.created_at) from public.guesses gu
      join public.games g2 on g2.id = gu.game_id
      where g2.user_id = v_target
    ),

    'today', case when v_game.id is not null
                  then jsonb_build_object('score', v_game.total_score) end,

    'todayRounds', case when v_game.id is not null then coalesce((
      select jsonb_agg(jsonb_build_object(
               'round', r.round,
               'status', r.status,
               'score', r.score
             ) order by r.round)
      from public.round_results r
      where r.game_id = v_game.id and r.status <> 'playing'
    ), '[]'::jsonb) end,

    'impossible', (
      select max(rr.best_level - 1) from public.endless_runs rr
      where rr.user_id = v_target and rr.week_start = public.endless_week(v_uid)
    ),

    -- The climb in full, because the board now keeps its numbers behind a tap.
    -- `impossible` above is left exactly as it was so nothing already reading
    -- it has to change; this sits beside it.
    'climb', (
      select jsonb_build_object(
        'level',   rr.best_level - 1,
        'guesses', rr.guesses_used,
        'topped',  rr.summit_at is not null
      )
      from public.endless_runs rr
      where rr.user_id = v_target and rr.week_start = public.endless_week(v_uid)
      order by rr.started_at desc limit 1
    ),

    'duels', case when v_target = v_uid then null else jsonb_build_object(
      'won',   (select count(*) from public.duels d
                 where d.status = 'complete' and d.winner_id = v_uid
                   and (d.challenger_id, d.opponent_id) in ((v_uid, v_target), (v_target, v_uid))),
      'lost',  (select count(*) from public.duels d
                 where d.status = 'complete' and d.winner_id = v_target
                   and (d.challenger_id, d.opponent_id) in ((v_uid, v_target), (v_target, v_uid))),
      'drawn', (select count(*) from public.duels d
                 where d.status = 'complete' and d.winner_id is null
                   and (d.challenger_id, d.opponent_id) in ((v_uid, v_target), (v_target, v_uid))),
      'streak', 0
    ) end
  );
end;
$$;

drop function if exists public.ranked_state();
drop function if exists public.ranked_find();
drop function if exists public.ranked_leave_queue();
drop function if exists public.belt_holder();

drop table if exists public.ranked_queue;
drop table if exists public.ranked_stats;
drop table if exists public.belt;

grant execute on function public.home_status()      to authenticated;
grant execute on function public.player_card(text)  to authenticated;

commit;

-- Should return no rows.
select table_name from information_schema.tables
 where table_schema = 'public' and table_name in ('ranked_stats','ranked_queue','belt');

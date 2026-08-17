-- A player card without the league is a card missing the thing people ask.
--
-- The card already carries a level, a lifetime total and a streak, and none of
-- those answers "how are they doing this month" - which is now the question the
-- game is built around. The league is one line and it is the one worth reading.
--
-- Computed the same way the season board computes it, from the same two
-- numbers, through the same function - so a card and a board can never disagree
-- about which league somebody is in.

begin;

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
  v_rank    public.ranked_stats%rowtype;
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
  select * into v_rank  from public.ranked_stats where user_id = v_target;
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
    'hasBelt', public.belt_holder() = v_target,

    'level', public.player_level(coalesce(v_xp, 0)),
    'xp', coalesce(v_xp, 0),

    'league', public.season_league(v_points, v_days),
    'seasonPoints', v_points,
    'seasonDays', v_days,

    'points', coalesce(v_stats.total_points, 0),
    'daysPlayed', coalesce(v_stats.games_played, 0),
    'streak', coalesce(v_stats.current_streak, 0),
    'bestStreak', coalesce(v_stats.max_streak, 0),

    'ranked', case when v_rank.played > 0 then jsonb_build_object(
      'rating', v_rank.rating,
      'won', v_rank.won,
      'lost', v_rank.lost
    ) end,

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

grant execute on function public.player_card(text) to authenticated;

commit;

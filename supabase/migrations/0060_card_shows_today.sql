-- A card shows how their day actually went.
--
-- Tapping somebody on today's board told you their lifetime total, which is not
-- what you were curious about: you were looking at today's score and wondering
-- where it came from. Three rounds, each won or lost, each with what it was
-- worth, answers that in one line.
--
-- Only for a day they have finished, the same rule the board itself follows. A
-- day in progress stays theirs until it is over.

create or replace function public.player_card(p_username text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid    uuid := auth.uid();
  v_target uuid;
  v_stats  public.stats%rowtype;
  v_rank   public.ranked_stats%rowtype;
  v_game   public.games%rowtype;
  v_today  date;
  v_friend text;
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
  v_today := public.current_puzzle_date(v_uid);

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
    'isMe', v_target = v_uid,
    'friendship', coalesce(v_friend, 'none'),
    'online', (select last_seen_at > now() - interval '2 minutes'
                 from public.profiles where id = v_target),
    'hasBelt', public.belt_holder() = v_target,

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

    -- One entry per round of a finished day: whether they got it, and what it
    -- paid. Never the number, and never a round still being played.
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
      select max(rr.level - 1) from public.endless_runs rr
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
      'streak', public.duel_streak(v_uid, v_target)
    ) end
  );
end;
$$;

revoke execute on function public.player_card(text) from public, anon;
grant execute on function public.player_card(text) to authenticated;

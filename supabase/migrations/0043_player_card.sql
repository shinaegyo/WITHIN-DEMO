-- Look someone up from a board or a friends list.
--
-- Every name in this game is currently a dead end: you can see that somebody is
-- above you and nothing about how they got there. A card answers the two things
-- worth knowing - how much they have scored and how long they have kept it
-- going - and gives the friends and duels buttons somewhere sensible to live.
--
-- What it deliberately does not carry: anything about a day still in progress.
-- Today's score appears only once their day is finished, the same rule the
-- daily leaderboard already follows, so nobody can watch a rival's round unfold
-- from the outside.
--
-- Lifetime totals, streaks and how recently someone played are already public on
-- the all-time board. This shows the same numbers for one person rather than
-- exposing anything new.

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
  v_today := public.current_puzzle_date(v_uid);

  -- 'none', 'pending' either way, or 'friends'.
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

    'points', coalesce(v_stats.total_points, 0),
    'daysPlayed', coalesce(v_stats.games_played, 0),
    'streak', coalesce(v_stats.current_streak, 0),
    'bestStreak', coalesce(v_stats.max_streak, 0),

    -- Where they sit on the all-time board, so the number has a scale.
    'rank', (
      select count(*) + 1 from public.stats s
      where s.games_played > 0
        and (s.total_points > coalesce(v_stats.total_points, 0)
             or (s.total_points = coalesce(v_stats.total_points, 0)
                 and s.games_played < coalesce(v_stats.games_played, 0)))
    ),
    'of', (select count(*) from public.stats where games_played > 0),

    'lastPlayedAt', (
      select max(gu.created_at) from public.guesses gu
      join public.games g2 on g2.id = gu.game_id
      where g2.user_id = v_target
    ),

    -- Only a day they have finished. A day in progress stays theirs.
    'today', (
      select jsonb_build_object('score', g.total_score)
      from public.games g
      where g.user_id = v_target
        and g.puzzle_date = v_today
        and g.status <> 'playing'
    ),

    -- This week's Impossible, which is the same climb for everyone.
    'impossible', (
      select max(r.level - 1) from public.endless_runs r
      where r.user_id = v_target and r.week_start = public.endless_week(v_uid)
    ),

    -- The head-to-head, from the asker's side.
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

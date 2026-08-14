-- People on the same score get the same rank.
--
-- Every board ranked by score and then by a tiebreak - days played, who
-- finished first - so two players on 150 came out 3rd and 4th. The number
-- beside a name is the thing people read, and it was quietly telling one of
-- them they had lost a contest that never happened.
--
-- Ties now share a rank and the next player skips: ten people on 14th are all
-- 14th, and the next is 25th. Standard competition ranking, and the only
-- honest way to number a board where the score is all that counts.
--
-- The tiebreaks stay in the ORDER BY. Something has to decide who is printed
-- first, and finishing earlier is as good a reason as any - it just no longer
-- changes the rank.

create or replace function public.daily_leaderboard(p_limit integer default 50)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid  uuid := auth.uid();
  v_date date;
begin
  if v_uid is null then
    return jsonb_build_object('error', 'not_authenticated');
  end if;

  v_date := public.current_puzzle_date(v_uid);

  return jsonb_build_object(
    'puzzleDate', v_date,
    'entries', coalesce((
      select jsonb_agg(e order by e.rank, e.name)
      from (
        select
          rank() over (order by g.total_score desc) as rank,
          coalesce(p.username, 'Player ' || upper(right(g.user_id::text, 4))) as name,
          g.total_score as score,
          g.user_id = v_uid as is_me,
          g.status = 'complete' as is_complete,
          (select count(*) from public.round_results r
            where r.game_id = g.id and r.status = 'won')::int as rounds_won
        from public.games g
        join public.profiles p on p.id = g.user_id
        where g.puzzle_date = v_date
          and g.status in ('complete', 'eliminated')
        order by g.total_score desc, (g.status = 'complete') desc, g.finished_at asc
        limit greatest(1, least(p_limit, 200))
      ) e
    ), '[]'::jsonb),
    'totalPlayers', (select count(*) from public.games
                     where puzzle_date = v_date
                       and status in ('complete', 'eliminated')),
    -- Part-way through, and has actually guessed at least once.
    'stillPlaying', (select count(*) from public.games g
                     where g.puzzle_date = v_date
                       and g.status = 'playing'
                       and exists (select 1 from public.guesses gu where gu.game_id = g.id))
  );
end;
$$;

create or replace function public.friends_leaderboard()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid  uuid := auth.uid();
  v_date date;
begin
  if v_uid is null then
    return jsonb_build_object('error', 'not_authenticated');
  end if;

  v_date := public.current_puzzle_date(v_uid);

  return jsonb_build_object(
    'puzzleDate', v_date,
    'entries', coalesce((
      select jsonb_agg(e order by e.rank, e.name)
      from (
        select
          rank() over (order by g.total_score desc) as rank,
          coalesce(p.username, 'Player ' || upper(right(g.user_id::text, 4))) as name,
          g.total_score as score,
          g.user_id = v_uid as is_me,
          g.status = 'complete' as is_complete,
          (select count(*) from public.round_results r
            where r.game_id = g.id and r.status = 'won')::int as rounds_won
        from public.games g
        join public.profiles p on p.id = g.user_id
        where g.puzzle_date = v_date
          and g.status in ('complete', 'eliminated')
          and (
            g.user_id = v_uid
            or exists (
              select 1 from public.friendships f
              where f.status = 'accepted'
                and (   (f.requester_id = v_uid and f.addressee_id = g.user_id)
                     or (f.addressee_id = v_uid and f.requester_id = g.user_id))
            )
          )
        order by g.total_score desc, (g.status = 'complete') desc, g.finished_at asc
      ) e
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.alltime_leaderboard(p_limit integer default 100)
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

  return jsonb_build_object(
    'entries', coalesce((
      select jsonb_agg(e order by e.rank, e.name)
      from (
        select
          rank() over (order by s.total_points desc) as rank,
          coalesce(p.username, 'Player ' || upper(right(s.user_id::text, 4))) as name,
          s.total_points as score,
          s.games_played as days_played,
          s.max_streak   as best_streak,
          s.user_id = v_uid as is_me,
          (select max(gu.created_at)
             from public.guesses gu
             join public.games g2 on g2.id = gu.game_id
            where g2.user_id = s.user_id) as last_played_at
        from public.stats s
        join public.profiles p on p.id = s.user_id
        where s.games_played > 0
        order by s.total_points desc, s.games_played asc
        limit greatest(1, least(p_limit, 200))
      ) e
    ), '[]'::jsonb),
    'totalPlayers', (select count(*) from public.stats where games_played > 0)
  );
end;
$$;

-- And the card, which counts the players above someone to place them. Counting
-- everyone with more points is exactly the same rule as rank() - so a card and
-- the board it was opened from now agree.
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

    -- Only a day they have finished. A day in progress stays theirs.
    'today', (
      select jsonb_build_object('score', g.total_score)
      from public.games g
      where g.user_id = v_target
        and g.puzzle_date = v_today
        and g.status <> 'playing'
    ),

    'impossible', (
      select max(r.level - 1) from public.endless_runs r
      where r.user_id = v_target and r.week_start = public.endless_week(v_uid)
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

revoke execute on function public.daily_leaderboard(integer)   from public, anon;
revoke execute on function public.friends_leaderboard()        from public, anon;
revoke execute on function public.alltime_leaderboard(integer) from public, anon;
revoke execute on function public.player_card(text)            from public, anon;
grant execute on function public.daily_leaderboard(integer)   to authenticated;
grant execute on function public.friends_leaderboard()        to authenticated;
grant execute on function public.alltime_leaderboard(integer) to authenticated;
grant execute on function public.player_card(text)            to authenticated;

-- The belt has to be visible where people look.
--
-- It only appeared on the ranked screen, which is the one place you already
-- know who holds it. A trophy nobody sees is a database row: the whole reason
-- it works is that everyone knows who has it, so it belongs next to a name on
-- the boards and on the card you open when you tap someone.

create or replace function public.alltime_leaderboard(p_limit integer default 100)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid    uuid := auth.uid();
  v_holder uuid;
begin
  if v_uid is null then
    return jsonb_build_object('error', 'not_authenticated');
  end if;

  v_holder := public.belt_holder();

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
          s.user_id = v_holder as has_belt,
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
    'beltHolder', (select username from public.profiles where id = v_holder),
    'totalPlayers', (select count(*) from public.stats where games_played > 0)
  );
end;
$$;

/** The card, now carrying the belt and the ranked record. */
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

    -- Null until they have played a ranked match, so the card can stay quiet
    -- about a mode somebody has never touched.
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

revoke execute on function public.alltime_leaderboard(integer) from public, anon;
revoke execute on function public.player_card(text)            from public, anon;
grant execute on function public.alltime_leaderboard(integer) to authenticated;
grant execute on function public.player_card(text)            to authenticated;

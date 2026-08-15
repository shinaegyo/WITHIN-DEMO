-- 881 is not a number anybody can read.
--
-- The podium shows total distance - every guess summed against its answer -
-- and it is the right thing to ORDER by and the wrong thing to print. It has
-- no scale a player can hold: 881 is meaningless without knowing how many
-- guesses went into it, it grows with the number of guesses so a longer day
-- looks worse than it was, and it is better when smaller, which is the one
-- property a bare number on a leaderboard cannot communicate.
--
-- The average does all three jobs. "73 off" is how far a typical guess landed
-- from the answer, it does not grow with the length of the day, and against a
-- column headed AVG OFF the direction is obvious.
--
-- The ordering does not change - it stays on the total, which measures the
-- whole day rather than a per-guess rate. Within a single score the two order
-- almost identically anyway, because the same score means roughly the same
-- number of guesses.

create or replace function public.daily_leaderboard(p_limit integer default 10)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid  uuid := auth.uid();
  v_date date;
  v_out  jsonb;
begin
  if v_uid is null then
    return jsonb_build_object('error', 'not_authenticated');
  end if;

  v_date := public.current_puzzle_date(v_uid);

  with day as (
    select
      g.id, g.user_id, g.total_score, g.finished_at, g.status,
      coalesce((
        select sum(abs(gu.guess - s.answer))
        from public.guesses gu
        join public.round_results rr on rr.game_id = g.id and rr.round = gu.round
        join public.puzzle_round_secrets s
             on s.puzzle_date = g.puzzle_date and s.round = rr.source_round
        where gu.game_id = g.id
      ), 0)::int as distance,
      coalesce((
        select sum(extract(epoch from (r.last_at - r.first_at)))
        from (
          select gu.round, min(gu.created_at) as first_at, max(gu.created_at) as last_at
          from public.guesses gu where gu.game_id = g.id group by gu.round
        ) r
      ), 0)::int as seconds,
      (select count(*) from public.guesses gu where gu.game_id = g.id)::int as guess_count
    from public.games g
    where g.puzzle_date = v_date and g.status in ('complete', 'eliminated')
  ),
  ranked as (
    select d.*,
           row_number() over (
             order by d.total_score desc, d.distance asc, d.seconds asc, d.finished_at asc
           ) as rank
    from day d
  ),
  mine as (select * from ranked where user_id = v_uid),
  totals as (select count(*)::int as n from day)
  select jsonb_build_object(
    'puzzleDate', v_date,

    -- The podium. Ten rows, strictly ordered, because being seventh of ten
    -- thousand is worth stating precisely - and ten is small enough that a
    -- list is the right shape for it.
    'entries', coalesce((
      select jsonb_agg(e order by e.rank)
      from (
        select r.rank,
               coalesce(p.username, 'Player ' || upper(right(r.user_id::text, 4))) as name,
               p.avatar,
               r.total_score as score,
               r.distance,
               -- Shown instead of the total. See the note above.
               case when r.guess_count > 0
                    then round(r.distance::numeric / r.guess_count)::int else 0 end as avg_off,
               r.user_id = v_uid as is_me,
               r.status = 'complete' as is_complete,
               (select count(*) from public.round_results rr
                 where rr.game_id = r.id and rr.status = 'won')::int as rounds_won
        from ranked r
        join public.profiles p on p.id = r.user_id
        where r.rank <= greatest(1, least(p_limit, 50))
      ) e
    ), '[]'::jsonb),

    'me', (
      select jsonb_build_object(
        'score', m.total_score,
        'distance', m.distance,
        'avgOff', case when m.guess_count > 0
                       then round(m.distance::numeric / m.guess_count)::int else 0 end,
        'guesses', m.guess_count,
        'rank', m.rank,
        -- Withheld until a percentage means something. Under twenty players the
        -- screen shows the position instead, the same rule Rush uses.
        'topPercent', case when (select n from totals) >= 20
                           then greatest(1, round(100.0 * m.rank / (select n from totals)))::int end,
        -- Including you, so it reads as "1,412 players on 280" rather than as a
        -- count of rivals.
        'playersOnScore', (select count(*) from day d2 where d2.total_score = m.total_score)
      ) from mine m
    ),

    -- The shape of the day. Nobody is ranked in it, so it survives any number
    -- of people sharing a score - which is the whole problem this board has.
    'distribution', coalesce((
      select jsonb_agg(jsonb_build_object('score', d.score, 'players', d.players) order by d.score)
      from (
        select total_score as score, count(*) as players from day group by total_score
      ) d
    ), '[]'::jsonb),

    'totalPlayers', (select n from totals),
    'stillPlaying', (select count(*) from public.games g
                     where g.puzzle_date = v_date
                       and g.status = 'playing'
                       and exists (select 1 from public.guesses gu where gu.game_id = g.id))
  ) into v_out;

  return v_out;
end;
$$;

revoke execute on function public.daily_leaderboard(integer) from public, anon;
grant execute on function public.daily_leaderboard(integer) to authenticated;

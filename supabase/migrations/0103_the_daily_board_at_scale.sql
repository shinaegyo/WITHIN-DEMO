-- The daily board, built for ten thousand rather than eighteen.
--
-- Scores run 0 to 300 in steps of ten, so at any real size thousands share
-- every one of them. "1,400 players in 1st place" is unreadable and "you are
-- #4,127" is worse, and breaking the tie fixes neither - it swaps an ugly
-- number for a discouraging one. See docs/daily-leaderboard.md.
--
-- So the board answers "did I do well today" instead of "what number am I":
-- a percentile, the count of people on your exact score, and the distribution.
-- A strict order is kept only where it is worth having, which is the top ten.
--
-- The podium's tiebreak, in order:
--
--   1. points
--   2. total distance - every guess summed against the answer it was aimed at,
--      lowest first. 342 reached via 350, 344, 342 is better play than the same
--      score reached via 500, 200, 342, and this is the one axis that measures
--      it. Free to compute: every guess is already stored.
--   3. time - the sum of each round's own duration, first guess to last. Not
--      wall-clock from when the day opened, which would punish somebody for
--      starting round one and coming back at lunch.
--
-- Time sits third deliberately. You only ever race somebody you have already
-- tied on both score and precision, so nobody plays fast to climb.
--
-- What this does not do is tiebreak on attempts used, which the old version
-- did. Round score is a function of attempts - 100 for the first, down to 40
-- for the seventh - so two players on the same score used the same attempts by
-- definition. It was the same information twice, and it did nothing.

-- One pass over the day, rather than a function call per row.
--
-- game_distance joins guesses for one game; calling it inside an ORDER BY over
-- every game of the day is ten thousand of those joins for one screen, and a
-- clue picker that did the same shape of thing took Impossible down in
-- production. So the day is scored once into a CTE and everything reads from
-- that.
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
      ), 0)::int as seconds
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

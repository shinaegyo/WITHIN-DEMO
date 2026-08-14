-- Say how many people are still mid-day.
--
-- The board only lists days that have finished, which is deliberate: a score
-- that is still climbing would reshuffle the standings under whoever is reading
-- them, and it would show how far through a round a rival is. But that made the
-- count read as "only two people played today" when it meant "two people have
-- got through all three rounds", and a player who knew three friends had opened
-- the app saw a number that looked simply wrong.
--
-- Reporting the in-progress count alongside it explains the figure without
-- changing what is ranked.
--
-- Someone who opened the app and made no guess is not counted. A game row is
-- created the moment the day is loaded, so counting rows would report people
-- who only glanced at it as though they were playing.

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
      select jsonb_agg(e order by e.rank)
      from (
        select
          rank() over (
            order by g.total_score desc,
                     (g.status = 'complete') desc,
                     g.finished_at asc
          ) as rank,
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

revoke execute on function public.daily_leaderboard(integer) from public, anon;
grant execute on function public.daily_leaderboard(integer) to authenticated;

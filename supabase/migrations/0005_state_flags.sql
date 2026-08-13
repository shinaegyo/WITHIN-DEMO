-- Return the per-guess feedback flags from game_state.
--
-- Restoring an interrupted game rebuilt each row from its stored tier, but
-- "intense" covers everything within 10, so a guess that was ONE AWAY came
-- back labelled WITHIN 10. The distance isn't stored on purpose — it must
-- never reach the client — but this function already holds the answer, so it
-- can derive the flags without persisting anything extra.

create or replace function public.game_state()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid    uuid := auth.uid();
  v_date   date;
  v_game   public.games%rowtype;
  v_clue1  text;
  v_clue2  text;
  v_answer smallint;
  v_stats  public.stats%rowtype;
begin
  if v_uid is null then
    return jsonb_build_object('error', 'not_authenticated');
  end if;

  insert into public.profiles (id) values (v_uid) on conflict (id) do nothing;
  insert into public.stats (user_id) values (v_uid) on conflict (user_id) do nothing;

  v_date := public.current_puzzle_date(v_uid);

  select clue1 into v_clue1 from public.puzzles where puzzle_date = v_date;
  if v_clue1 is null then
    return jsonb_build_object('error', 'no_puzzle_today');
  end if;

  select answer, clue2 into v_answer, v_clue2
  from public.puzzle_answers where puzzle_date = v_date;

  select * into v_game from public.games
  where user_id = v_uid and puzzle_date = v_date;

  select * into v_stats from public.stats where user_id = v_uid;

  return jsonb_build_object(
    'puzzleDate',   v_date,
    'clue1',        v_clue1,
    'maxAttempts',  7,
    'status',       coalesce(v_game.status, 'playing'),
    'attemptsUsed', coalesce(v_game.attempts_used, 0),
    'score',        coalesce(v_game.score, 0),
    'clue2',        case when coalesce(v_game.clue2_unlocked, false) then v_clue2 else null end,
    'answer',       case when v_game.status in ('won', 'lost') then v_answer else null end,
    'guesses', coalesce((
      select jsonb_agg(jsonb_build_object(
               'guess',      g.guess,
               'direction',  g.direction,
               'tier',       g.tier,
               -- Derived here rather than stored: the raw distance stays server side.
               'isCorrect',  g.direction = 'correct',
               'isWithin10', g.guess <> v_answer and abs(g.guess - v_answer) <= 10,
               'isOneAway',  abs(g.guess - v_answer) = 1
             ) order by g.guess_index)
      from public.guesses g where g.game_id = v_game.id
    ), '[]'::jsonb),
    'stats', jsonb_build_object(
      'currentStreak', coalesce(v_stats.current_streak, 0),
      'maxStreak',     coalesce(v_stats.max_streak, 0),
      'gamesPlayed',   coalesce(v_stats.games_played, 0),
      'gamesWon',      coalesce(v_stats.games_won, 0),
      'totalPoints',   coalesce(v_stats.total_points, 0)
    )
  );
end;
$$;

revoke execute on function public.game_state() from public, anon;
grant execute on function public.game_state() to authenticated;

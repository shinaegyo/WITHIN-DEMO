-- A perfect day is 60, and the app has been saying 300 since this morning.
--
-- 0121 cut the round ladder to 20 down to 5 but left game_state announcing a
-- maximum of 300, because the number was written into the function rather than
-- derived from the ladder. Nothing on screen shows a denominator so it went
-- unnoticed - except in the one place it travels: every shared result has been
-- going out as "12/300", which reads as a catastrophe rather than a decent day.
--
-- 0030's game_state, with the one number corrected. The multiplier stays, so a
-- bonus day still announces its own ceiling.

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
  v_round  public.round_results%rowtype;
  v_clue1  text;
  v_clue2  text;
  v_answer smallint;
  v_stats  public.stats%rowtype;
  v_reveal boolean;
  v_id     text;
  v_spec   jsonb;
  v_clue_mode text;
  v_mult   numeric;
  v_show_clue2 boolean;
begin
  if v_uid is null then
    return jsonb_build_object('error', 'not_authenticated');
  end if;

  insert into public.profiles (id) values (v_uid) on conflict (id) do nothing;
  insert into public.stats (user_id) values (v_uid) on conflict (user_id) do nothing;

  v_date      := public.current_puzzle_date(v_uid);
  v_id        := public.day_modifier(v_date);
  v_spec      := public.modifier_spec(v_id);
  v_clue_mode := coalesce(v_spec->>'clue', 'normal');
  v_mult      := coalesce((v_spec->>'mult')::numeric, 1);

  if not exists (select 1 from public.puzzle_rounds where puzzle_date = v_date) then
    perform public.generate_puzzle_days(v_date, 1);
  end if;

  v_game := public.ensure_game(v_uid, v_date);

  select * into v_round from public.round_results
  where game_id = v_game.id and round = v_game.current_round;

  select clue1 into v_clue1 from public.puzzle_rounds
  where puzzle_date = v_date and round = v_round.source_round;

  select answer, clue2 into v_answer, v_clue2 from public.puzzle_round_secrets
  where puzzle_date = v_date and round = v_round.source_round;

  select * into v_stats from public.stats where user_id = v_uid;

  v_reveal := v_round.status <> 'playing' or v_game.gave_up;

  v_show_clue2 := case v_clue_mode
    when 'none'  then false
    when 'blind' then false
    when 'early' then true
    else v_round.clue2_unlocked
  end;

  return jsonb_build_object(
    'puzzleDate',   v_date,
    'puzzleNumber', (v_date - date '2026-08-11') + 1,
    -- The day's twist or bonus, named by the server so there is one list.
    'modifier', jsonb_build_object(
      'id',     v_id,
      'kind',   coalesce(v_spec->>'kind', 'standard'),
      'label',  coalesce(v_spec->>'label', ''),
      'detail', coalesce(v_spec->>'detail', '')
    ),
    'maxScore',     round(60 * v_mult),
    'dayStatus',    v_game.status,
    'currentRound', v_game.current_round,
    'totalRounds',  3,
    'totalScore',   v_game.total_score,
    'retriesUsed',  v_game.retries_used,
    'gaveUp',       v_game.gave_up,
    'canRetry',     v_game.status = 'eliminated' and not v_game.gave_up,
    'round', jsonb_build_object(
      'round',          v_round.round,
      'status',         v_round.status,
      'attemptsUsed',   v_round.attempts_used,
      'attemptsAllowed', v_round.attempts_allowed,
      'score',          v_round.score,
      'retried',        v_round.retried,
      -- A blind day withholds the opening clue as well.
      'clue1',          case when v_clue_mode = 'blind' then null else v_clue1 end,
      'clue2',          case when v_show_clue2 then v_clue2 else null end,
      'answer',         case when v_reveal then v_answer else null end,
      'guesses', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'guess', g.guess, 'direction', g.direction, 'tier', g.tier,
                 'isCorrect',  g.direction = 'correct',
                 'isWithin10', g.guess <> v_answer and abs(g.guess - v_answer) <= 10,
                 'isOneAway',  abs(g.guess - v_answer) = 1
               ) order by g.guess_index)
        from public.guesses g
        where g.game_id = v_game.id and g.round = v_round.round
      ), '[]'::jsonb)
    ),
    'rounds', coalesce((
      select jsonb_agg(jsonb_build_object(
               'round', r.round, 'status', r.status,
               'score', r.score, 'attemptsUsed', r.attempts_used,
               'attemptsAllowed', r.attempts_allowed, 'retried', r.retried,
               'marks', coalesce((
                 select jsonb_agg(g2.direction order by g2.guess_index)
                 from public.guesses g2
                 where g2.game_id = v_game.id and g2.round = r.round
               ), '[]'::jsonb)
             ) order by r.round)
      from public.round_results r where r.game_id = v_game.id
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

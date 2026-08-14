-- A missed round costs that round and nothing else.
--
-- Losing round 1 stopped the whole day scoring, and in practice that meant
-- people who could not solve the first number finished the day on zero however
-- well they played the other two. The rule was meant to make a day feel like
-- one continuous run; what it actually did was tell somebody twelve minutes in
-- that the rest of their evening could not matter.
--
-- Each round is now scored on how it went. Miss round 1, solve round 2 on the
-- second attempt, and that is ninety points - the day is worth what you found
-- rather than what you found before your first mistake.
--
-- The day still ends when three rounds are played, and a streak still needs all
-- three finished, so nothing about turning up every day changes.

create or replace function public.submit_guess(p_guess integer)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid       uuid := auth.uid();
  v_date      date;
  v_game      public.games%rowtype;
  v_round     public.round_results%rowtype;
  v_answer    smallint;
  v_clue2     text;
  v_distance  integer;
  v_direction text;
  v_tier      text;
  v_index     smallint;
  v_score     smallint := 0;
  v_next_allowed smallint;
  v_order     smallint[];
  v_last_attempt boolean;
  v_spec      jsonb;
  v_mult      numeric;
  v_clue_mode text;
  v_unlock    integer;
  v_keep      boolean;
  v_nopen     boolean;
  v_show_clue2 boolean;
  v_broken    boolean;
begin
  if v_uid is null then
    return jsonb_build_object('error', 'not_authenticated');
  end if;
  if p_guess is null or p_guess < 1 or p_guess > 1000 then
    return jsonb_build_object('error', 'out_of_range');
  end if;

  insert into public.profiles (id) values (v_uid) on conflict (id) do nothing;
  insert into public.stats (user_id) values (v_uid) on conflict (user_id) do nothing;

  v_date      := public.current_puzzle_date(v_uid);
  v_spec      := public.modifier_spec(public.day_modifier(v_date));
  v_mult      := coalesce((v_spec->>'mult')::numeric, 1);
  v_clue_mode := coalesce(v_spec->>'clue', 'normal');
  v_unlock    := coalesce((v_spec->>'unlock')::int, 10);
  v_keep      := coalesce((v_spec->>'keep')::boolean, false);
  v_nopen     := coalesce((v_spec->>'nopen')::boolean, false);

  v_game := public.ensure_game(v_uid, v_date);

  select * into v_game from public.games where id = v_game.id for update;

  if v_game.status <> 'playing' then
    return jsonb_build_object('error',
      case when v_game.status = 'eliminated' then 'eliminated' else 'already_played' end);
  end if;

  select * into v_round from public.round_results
  where game_id = v_game.id and round = v_game.current_round;

  if v_round.status <> 'playing' then
    return jsonb_build_object('error', 'round_over');
  end if;

  if exists (select 1 from public.guesses
             where game_id = v_game.id and round = v_round.round and guess = p_guess) then
    return jsonb_build_object('error', 'duplicate_guess');
  end if;

  select answer, clue2 into v_answer, v_clue2 from public.puzzle_round_secrets
  where puzzle_date = v_date and round = v_round.source_round;

  if v_answer is null then
    return jsonb_build_object('error', 'no_puzzle_today');
  end if;

  -- Nothing carries forward. A round is scored on how it went, and a miss
  -- earlier in the day has no say in it.
  v_broken := false;

  v_distance  := abs(p_guess - v_answer);
  v_direction := case when v_distance = 0 then 'correct'
                      when p_guess < v_answer then 'below' else 'above' end;
  v_tier := case
    when v_distance = 0    then 'correct'
    when v_distance <= 10  then 'intense'
    when v_distance <= 24  then 'dark'
    when v_distance <= 99  then 'medium'
    when v_distance <= 249 then 'light'
    when v_distance <= 499 then 'distant'
    else 'vast' end;

  v_index := v_round.attempts_used + 1;
  v_last_attempt := v_index >= v_round.attempts_allowed;

  insert into public.guesses (game_id, round, guess_index, guess, direction, tier)
  values (v_game.id, v_round.round, v_index, p_guess, v_direction, v_tier);

  update public.round_results set
    attempts_used  = v_index,
    clue2_unlocked = clue2_unlocked or v_distance <= v_unlock,
    status = (case when v_distance = 0 then 'won'
                   when v_last_attempt then 'lost'
                   else 'playing' end)::public.round_status,
    -- Rounded, because a multiplier can be fractional.
    score = (case when v_distance = 0 and not retried and not v_broken
                  then round(public.score_for_attempt(v_index) * v_mult) else 0 end)::smallint
  where game_id = v_game.id and round = v_round.round
  returning * into v_round;

  if v_round.status <> 'playing' then
    v_score := v_round.score;

    v_next_allowed := public.attempts_for_round(v_round.round + 1, v_date);
    if v_round.status = 'won' and v_last_attempt and not v_nopen then
      v_next_allowed := greatest(3, v_next_allowed - 1)::smallint;
    end if;

    if v_round.round = 3 then
      update public.games set
        status = 'complete',
        total_score = total_score + v_score,
        finished_at = now()
      where id = v_game.id returning * into v_game;
    else
      v_order := public.round_order(v_uid, v_date);

      update public.games set
        total_score = total_score + v_score,
        current_round = current_round + 1,
        attempts_allowed = v_next_allowed
      where id = v_game.id returning * into v_game;

      insert into public.round_results (game_id, round, source_round, attempts_allowed)
      values (v_game.id, v_game.current_round, v_order[v_game.current_round], v_next_allowed)
      on conflict (game_id, round) do nothing;
    end if;
  end if;

  v_show_clue2 := case v_clue_mode
    when 'none'  then false
    when 'blind' then false
    when 'early' then true
    else v_round.clue2_unlocked
  end;

  return jsonb_build_object(
    'dayStatus',    v_game.status,
    'currentRound', v_game.current_round,
    'totalScore',   v_game.total_score,
    'roundStatus',  v_round.status,
    'attemptsUsed', v_round.attempts_used,
    'attemptsAllowed', v_round.attempts_allowed,
    'roundScore',   v_round.score,
    'retried',      v_round.retried,
    'scoringOver',  false,
    'nextAttemptsAllowed', v_next_allowed,
    'canRetry',     false,
    'guess', jsonb_build_object(
      'guess', p_guess, 'direction', v_direction, 'tier', v_tier,
      'isWithin10', v_distance > 0 and v_distance <= 10,
      'isOneAway',  v_distance = 1,
      'isCorrect',  v_distance = 0
    ),
    'clue2',  case when v_show_clue2 then v_clue2 else null end,
    'answer', case when v_round.status <> 'playing' then v_answer else null end
  );
end;
$$;

-- Impossible: a longer runway before the rope shortens.
--
-- Attempts fell every two levels, which meant the interesting part of a run -
-- the deep numbers - was reached with almost nothing left. The steps are now
-- rarer and further apart: eight for the first nine numbers, seven to the
-- thirty-ninth, six to the eighty-ninth, five for the last stretch.
create or replace function public.endless_attempts(p_level integer)
returns smallint
language sql
immutable
as $$
  select (case
    when p_level <= 9  then 8
    when p_level <= 39 then 7
    when p_level <= 89 then 6
    else 5
  end)::smallint;
$$;

revoke execute on function public.submit_guess(integer)     from public, anon;
revoke execute on function public.endless_attempts(integer)  from public, anon;
grant execute on function public.submit_guess(integer) to authenticated;

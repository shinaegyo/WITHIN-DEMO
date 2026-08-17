-- The easy clue stops paying like the hard ones.
--
-- Choosing a clue was a decision with no cost: all three paid the same, so once
-- somebody works out that "where it sits" is the easiest to act on they pick it
-- every day and round two collapses back into a search with a hint.
--
-- Where-it-sits fences the number between two round hundreds. It is the least
-- work and the most immediately useful, so it now tops out at 12 instead of 16.
-- Digits and factors are scattered through the range and take working out, and
-- they keep the full ladder. The trade is the round: take the clue you can use
-- and cap yourself, or take the one you have to think about and keep the top.
--
-- A perfect day is still 70 - the ceiling belongs to the clues that earn it.

begin;

-- The old one-argument signature has to go before the two-argument version can
-- exist: a defaulted parameter would leave both callable and every call site
-- ambiguous.
drop function if exists public.daily_clue_pay(integer);

create or replace function public.daily_clue_pay(p_index integer, p_kind text default null)
returns integer
language sql
immutable
as $$
  select case
    when p_kind = 'where'
      then (array[12, 10, 9, 8, 7, 6])[least(greatest(coalesce(p_index, 1), 1), 6)]
    else (array[16, 14, 12, 10, 8, 6])[least(greatest(coalesce(p_index, 1), 1), 6)]
  end;
$$;

-- Recreated only to pass the clue kind through to the pay.
create or replace function public.submit_guess(p_guess integer)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid    uuid := auth.uid();
  v_date   date;
  v_game   public.games%rowtype;
  v_r      public.round_results%rowtype;
  v_answer smallint;
  v_dist   integer;
  v_dir    text;
  v_tier   text;
  v_index  smallint;
  v_score  smallint := 0;
  v_last   boolean;
  v_over   boolean := false;
begin
  if v_uid is null then return jsonb_build_object('error', 'not_authenticated'); end if;
  if p_guess is null or p_guess < 1 or p_guess > 1000 then
    return jsonb_build_object('error', 'out_of_range');
  end if;

  insert into public.profiles (id) values (v_uid) on conflict (id) do nothing;
  insert into public.stats (user_id) values (v_uid) on conflict (user_id) do nothing;

  v_date := public.current_puzzle_date(v_uid);
  v_game := public.ensure_game(v_uid, v_date);
  select * into v_game from public.games where id = v_game.id for update;

  if v_game.status <> 'playing' then return jsonb_build_object('error', 'already_played'); end if;

  select * into v_r from public.round_results
  where game_id = v_game.id and round = v_game.current_round;

  if v_r.status <> 'playing' then return jsonb_build_object('error', 'round_over'); end if;
  -- Round one will not take a guess until the shot is called.
  if v_r.round = 1 and v_r.called is null then
    return jsonb_build_object('error', 'call_first');
  end if;
  -- Nor round two until a clue has been chosen.
  if v_r.round = 2 and v_r.clue_text is null then
    return jsonb_build_object('error', 'choose_clue');
  end if;
  if v_r.round = 3 and v_r.attempts_used >= public.daily_attempts(3) then
    return jsonb_build_object('error', 'probes_spent');
  end if;

  if exists (select 1 from public.guesses
             where game_id = v_game.id and round = v_r.round and guess = p_guess) then
    return jsonb_build_object('error', 'duplicate_guess');
  end if;

  select answer into v_answer from public.puzzle_round_secrets
  where puzzle_date = v_game.puzzle_date and round = v_r.source_round;

  v_dist := abs(p_guess - v_answer);
  v_dir  := case when v_dist = 0 then 'correct'
                 when p_guess < v_answer then 'below' else 'above' end;
  v_tier := case
    when v_dist = 0    then 'correct'
    when v_dist <= 10  then 'intense'
    when v_dist <= 24  then 'dark'
    when v_dist <= 99  then 'medium'
    when v_dist <= 249 then 'light'
    when v_dist <= 499 then 'distant'
    else 'vast' end;

  v_index := v_r.attempts_used + 1;
  v_last  := v_index >= v_r.attempts_allowed;

  insert into public.guesses (game_id, round, guess_index, guess, direction, tier)
  values (v_game.id, v_r.round, v_index, p_guess, v_dir, v_tier);

  update public.round_results set attempts_used = v_index
  where game_id = v_game.id and round = v_r.round;

  -- Round three never ends on a guess. The probes are free and the bet is the
  -- only thing that scores.
  if v_r.round = 3 then
    return jsonb_build_object(
      'round', 3, 'roundStatus', 'playing', 'dayStatus', 'playing',
      'probesLeft', public.daily_attempts(3) - v_index,
      'guess', jsonb_build_object('guess', p_guess, 'direction', v_dir, 'tier', v_tier,
        'isWithin10', v_dist > 0 and v_dist <= 10, 'isOneAway', v_dist = 1, 'isCorrect', v_dist = 0)
    );
  end if;

  if v_dist = 0 then
    v_over := true;
    if v_r.round = 1 then
      v_score := case when v_index <= v_r.called
                      then public.daily_call_pay(v_r.called)
                      else public.daily_late_pay() end;
    else
      v_score := public.daily_clue_pay(v_index, v_r.clue_kind);
    end if;
  elsif v_last then
    v_over := true;
    v_score := public.score_floor();
  end if;

  if v_over then
    update public.round_results
      set status = (case when v_dist = 0 then 'won' else 'lost' end)::public.round_status,
          score = v_score
    where game_id = v_game.id and round = v_r.round;

    update public.games set
      total_score = total_score + v_score,
      current_round = least(3, v_r.round + 1),
      attempts_allowed = public.daily_attempts(least(3, v_r.round + 1))
    where id = v_game.id
    returning * into v_game;
  end if;

  return jsonb_build_object(
    'round', v_r.round,
    'roundStatus', case when not v_over then 'playing' when v_dist = 0 then 'won' else 'lost' end,
    'dayStatus', v_game.status,
    'roundScore', v_score,
    'totalScore', v_game.total_score,
    'attemptsUsed', v_index,
    'attemptsAllowed', v_r.attempts_allowed,
    'currentRound', v_game.current_round,
    'guess', jsonb_build_object('guess', p_guess, 'direction', v_dir, 'tier', v_tier,
      'isWithin10', v_dist > 0 and v_dist <= 10, 'isOneAway', v_dist = 1, 'isCorrect', v_dist = 0),
    'answer', case when v_over then v_answer end
  );
end;
$$;

grant execute on function public.daily_clue_pay(integer, text) to authenticated;
grant execute on function public.submit_guess(integer) to authenticated;

commit;

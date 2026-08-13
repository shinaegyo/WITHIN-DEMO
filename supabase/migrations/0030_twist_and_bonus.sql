-- The two special days become a Twist and a Bonus.
--
-- One of the week's two marked days makes the game harder, the other makes it
-- kinder, and each is drawn from its own pool. That reads better than a single
-- undifferentiated "modifier", and it means a week always contains one of each
-- rather than, by chance, two gifts or two punishments.
--
-- Every variant is a set of parameters rather than its own branch of logic.
-- There are seven knobs; the pools below are data. Adding a variant is one row
-- and touches no game code, which is the only way a list this long stays
-- trustworthy.
--
--   mult    score multiplier
--   att     attempts added to every round
--   flat    every round gets exactly this many attempts (overrides att)
--   clue    normal | early | none | blind
--   unlock  distance at which the bonus clue unlocks
--   keep    scoring survives a missed round
--   nopen   the last-attempt penalty is suspended
--
-- Labels live here too. Holding fifty strings on the client as well would mean
-- two lists to keep in step, and the client's would be the one that rotted.

create or replace function public.modifier_spec(p_id text)
returns jsonb
language sql
immutable
as $$
  select case p_id

    -- ---------- BONUSES ----------
    when 'double'        then '{"kind":"bonus","label":"Double points","detail":"Every round scores twice.","mult":2}'
    when 'triple'        then '{"kind":"bonus","label":"Triple points","detail":"Every round scores three times.","mult":3}'
    when 'half_again'    then '{"kind":"bonus","label":"Points and a half","detail":"Every round scores 50% more.","mult":1.5}'
    when 'extra_1'       then '{"kind":"bonus","label":"Extra attempt","detail":"One more guess in every round.","att":1}'
    when 'extra_2'       then '{"kind":"bonus","label":"Two extra attempts","detail":"Two more guesses in every round.","att":2}'
    when 'flat_7'        then '{"kind":"bonus","label":"Seven all day","detail":"Every round gives seven attempts, including the last.","flat":7}'
    when 'flat_8'        then '{"kind":"bonus","label":"Eight all day","detail":"Every round gives eight attempts.","flat":8}'
    when 'early_bonus'   then '{"kind":"bonus","label":"Both clues","detail":"The bonus clue is open from your first guess.","clue":"early"}'
    when 'unlock_25'     then '{"kind":"bonus","label":"Clue at 25","detail":"The bonus clue unlocks within 25 instead of 10.","unlock":25}'
    when 'unlock_50'     then '{"kind":"bonus","label":"Clue at 50","detail":"The bonus clue unlocks within 50 instead of 10.","unlock":50}'
    when 'unlock_100'    then '{"kind":"bonus","label":"Clue at 100","detail":"The bonus clue unlocks within 100 instead of 10.","unlock":100}'
    when 'forgiving'     then '{"kind":"bonus","label":"Forgiving day","detail":"A missed round does not stop the day scoring.","keep":true}'
    when 'no_penalty'    then '{"kind":"bonus","label":"No penalty","detail":"Solving on your last attempt costs you nothing.","nopen":true}'
    when 'safe_double'   then '{"kind":"bonus","label":"Double and forgiving","detail":"Twice the points, and a missed round does not end the scoring.","mult":2,"keep":true}'
    when 'safe_extra'    then '{"kind":"bonus","label":"Extra and forgiving","detail":"One more guess a round, and a miss does not end the scoring.","att":1,"keep":true}'
    when 'generous_open' then '{"kind":"bonus","label":"Open handed","detail":"Both clues from the start, and one more guess a round.","clue":"early","att":1}'
    when 'double_open'   then '{"kind":"bonus","label":"Rich and open","detail":"Both clues from the start, and double points.","clue":"early","mult":2}'
    when 'long_double'   then '{"kind":"bonus","label":"Long and rich","detail":"Seven attempts every round, and double points.","flat":7,"mult":2}'
    when 'clue_and_keep' then '{"kind":"bonus","label":"Clue at 25, forgiving","detail":"The bonus clue unlocks within 25, and a miss does not end the scoring.","unlock":25,"keep":true}'
    when 'triple_short'  then '{"kind":"bonus","label":"Triple, no penalty","detail":"Three times the points, and no cost for a last-attempt solve.","mult":3,"nopen":true}'
    when 'wide_open'     then '{"kind":"bonus","label":"Wide open","detail":"Both clues, eight attempts a round.","clue":"early","flat":8}'
    when 'kind_week'     then '{"kind":"bonus","label":"Kind day","detail":"Two more guesses a round and no last-attempt penalty.","att":2,"nopen":true}'
    when 'clue_rich'     then '{"kind":"bonus","label":"Clue rich","detail":"The bonus clue unlocks within 50, and points are doubled.","unlock":50,"mult":2}'
    when 'second_wind'   then '{"kind":"bonus","label":"Second wind","detail":"Seven attempts a round and a miss does not end the scoring.","flat":7,"keep":true}'
    when 'everything'    then '{"kind":"bonus","label":"Everything day","detail":"Both clues, an extra guess, and double points.","clue":"early","att":1,"mult":2}'

    -- ---------- TWISTS ----------
    when 'no_bonus'      then '{"kind":"twist","label":"No bonus clue","detail":"The second clue stays locked, however close you get.","clue":"none"}'
    when 'blind'         then '{"kind":"twist","label":"Blind day","detail":"No clues at all. Only the numbers answer you.","clue":"blind"}'
    when 'tight_1'       then '{"kind":"twist","label":"One fewer","detail":"One less guess in every round.","att":-1}'
    when 'tight_2'       then '{"kind":"twist","label":"Two fewer","detail":"Two less guesses in every round.","att":-2}'
    when 'flat_5'        then '{"kind":"twist","label":"Five all day","detail":"Every round gives five attempts, including the first.","flat":5}'
    when 'flat_4'        then '{"kind":"twist","label":"Four all day","detail":"Every round gives four attempts.","flat":4}'
    when 'unlock_5'      then '{"kind":"twist","label":"Clue at 5","detail":"The bonus clue only unlocks within 5.","unlock":5}'
    when 'unlock_3'      then '{"kind":"twist","label":"Clue at 3","detail":"The bonus clue only unlocks within 3.","unlock":3}'
    when 'half'          then '{"kind":"twist","label":"Half points","detail":"Every round scores half.","mult":0.5}'
    when 'thin_air'      then '{"kind":"twist","label":"Thin air","detail":"No bonus clue, and one less guess a round.","clue":"none","att":-1}'
    when 'short_blind'   then '{"kind":"twist","label":"Short and blind","detail":"No clues, five attempts a round.","clue":"blind","flat":5}'
    when 'hard_half'     then '{"kind":"twist","label":"Lean day","detail":"Half points and one less guess a round.","mult":0.5,"att":-1}'
    when 'no_clue_five'  then '{"kind":"twist","label":"Locked and lean","detail":"No bonus clue, five attempts a round.","clue":"none","flat":5}'
    when 'tight_late'    then '{"kind":"twist","label":"Late clue, lean","detail":"The bonus clue only unlocks within 5, and one less guess a round.","unlock":5,"att":-1}'
    when 'sudden'        then '{"kind":"twist","label":"Sudden","detail":"Four attempts a round, no bonus clue.","flat":4,"clue":"none"}'
    when 'blind_half'    then '{"kind":"twist","label":"Blind and lean","detail":"No clues, half points.","clue":"blind","mult":0.5}'
    when 'narrow'        then '{"kind":"twist","label":"Narrow","detail":"Five attempts a round and the bonus clue only within 5.","flat":5,"unlock":5}'
    when 'stingy'        then '{"kind":"twist","label":"Stingy","detail":"Half points and no bonus clue.","mult":0.5,"clue":"none"}'
    when 'brittle'       then '{"kind":"twist","label":"Brittle","detail":"Two less guesses a round and the bonus clue only within 5.","att":-2,"unlock":5}'
    when 'iron'          then '{"kind":"twist","label":"Iron day","detail":"Four attempts a round.","flat":4}'
    when 'cold'          then '{"kind":"twist","label":"Cold","detail":"No clues, and one less guess a round.","clue":"blind","att":-1}'
    when 'sparse'        then '{"kind":"twist","label":"Sparse","detail":"The bonus clue only unlocks within 3, and half points.","unlock":3,"mult":0.5}'
    when 'flint'         then '{"kind":"twist","label":"Flint","detail":"Five attempts a round, half points.","flat":5,"mult":0.5}'
    when 'quiet'         then '{"kind":"twist","label":"Quiet","detail":"No bonus clue, and the day is worth half.","clue":"none","mult":0.5}'
    when 'severe'        then '{"kind":"twist","label":"Severe","detail":"Four attempts a round, no clues at all.","flat":4,"clue":"blind"}'

    else '{"kind":"standard","label":"","detail":""}'
  end::jsonb;
$$;

/** Every bonus id, in a fixed order so the draw is stable. */
create or replace function public.bonus_ids()
returns text[]
language sql
immutable
as $$
  select array[
    'double','triple','half_again','extra_1','extra_2','flat_7','flat_8','early_bonus',
    'unlock_25','unlock_50','unlock_100','forgiving','no_penalty','safe_double','safe_extra',
    'generous_open','double_open','long_double','clue_and_keep','triple_short','wide_open',
    'kind_week','clue_rich','second_wind','everything'
  ];
$$;

create or replace function public.twist_ids()
returns text[]
language sql
immutable
as $$
  select array[
    'no_bonus','blind','tight_1','tight_2','flat_5','flat_4','unlock_5','unlock_3','half',
    'thin_air','short_blind','hard_half','no_clue_five','tight_late','sudden','blind_half',
    'narrow','stingy','brittle','iron','cold','sparse','flint','quiet','severe'
  ];
$$;

/**
 * Which special day this is, if any: the earlier of the week's two marked days
 * is the Twist, the later is the Bonus.
 */
create or replace function public.day_modifier(p_date date)
returns text
language sql
immutable
as $$
  with w as (
    select date_trunc('week', p_date::timestamp)::date as monday
  ),
  picks as (
    select
      abs(hashtext('within-week-a:' || monday::text)) % 7 as a,
      (abs(hashtext('within-week-a:' || monday::text)) % 7
       + 1
       + abs(hashtext('within-week-b:' || monday::text)) % 6) % 7 as b
    from w
  ),
  ordered as (
    select least(a, b) as twist_day, greatest(a, b) as bonus_day from picks
  ),
  d as (
    select (p_date - (select monday from w)) as offset_in_week
  )
  select case
    when (select offset_in_week from d) = (select twist_day from ordered)
      then (public.twist_ids())[1 + abs(hashtext('within-twist:' || p_date::text)) % 25]
    when (select offset_in_week from d) = (select bonus_day from ordered)
      then (public.bonus_ids())[1 + abs(hashtext('within-bonus:' || p_date::text)) % 25]
    else 'standard'
  end;
$$;

/** Attempts for a round, after the day's parameters. */
create or replace function public.attempts_for_round(p_round integer, p_date date)
returns smallint
language sql
stable
as $$
  with spec as (select public.modifier_spec(public.day_modifier(p_date)) as s)
  select greatest(3, coalesce(
    (select (s->>'flat')::int from spec),
    (case p_round when 1 then 7 when 2 then 6 else 5 end)
      + coalesce((select (s->>'att')::int from spec), 0)
  ))::smallint;
$$;

revoke execute on function public.modifier_spec(text)                from public, anon;
revoke execute on function public.bonus_ids()                        from public, anon;
revoke execute on function public.twist_ids()                        from public, anon;
revoke execute on function public.day_modifier(date)                 from public, anon;
revoke execute on function public.attempts_for_round(integer, date)  from public, anon;

-- ---------------------------------------------------------------------------
-- The game reads the day's parameters rather than testing for named days.
-- ---------------------------------------------------------------------------

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

  -- A miss stops the day scoring, unless the day is a forgiving one.
  v_broken := (not v_keep) and exists (
    select 1 from public.round_results
    where game_id = v_game.id and round < v_round.round and status = 'lost'
  );

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
    'scoringOver',  v_broken or (v_round.status = 'lost' and not v_keep),
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

revoke execute on function public.submit_guess(integer) from public, anon;
grant execute on function public.submit_guess(integer) to authenticated;

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
    'maxScore',     round(300 * v_mult),
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

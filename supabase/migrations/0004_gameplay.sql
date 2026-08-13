-- Server-authoritative gameplay.
--
-- Both functions are SECURITY DEFINER: they run as the owner, so they can read
-- puzzle_answers even though the caller never can. Two rules make that safe:
--
--   1. The player is taken from auth.uid(), never from an argument. A caller
--      cannot act as somebody else by passing a different id.
--   2. The answer is only ever returned once the game is actually over.
--
-- All validation lives here rather than in the app, so a modified client gains
-- nothing: it can only ask "here is a number", and the database decides.

-- ------------------------------------------------------------- submit_guess

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
  v_answer    smallint;
  v_clue2     text;
  v_distance  integer;
  v_direction text;
  v_tier      text;
  v_index     smallint;
  v_status    public.game_status;
  v_score     smallint := 0;
begin
  if v_uid is null then
    return jsonb_build_object('error', 'not_authenticated');
  end if;

  if p_guess is null or p_guess < 1 or p_guess > 1000 then
    return jsonb_build_object('error', 'out_of_range');
  end if;

  insert into public.profiles (id) values (v_uid) on conflict (id) do nothing;
  insert into public.stats (user_id) values (v_uid) on conflict (user_id) do nothing;

  v_date := public.current_puzzle_date(v_uid);

  -- Claim today's game. The unique(user_id, puzzle_date) constraint means two
  -- racing requests can't both create one.
  insert into public.games (user_id, puzzle_date)
  values (v_uid, v_date)
  on conflict (user_id, puzzle_date) do nothing;

  select * into v_game from public.games
  where user_id = v_uid and puzzle_date = v_date
  for update;

  if v_game.id is null then
    return jsonb_build_object('error', 'no_puzzle_today');
  end if;

  if v_game.status <> 'playing' then
    return jsonb_build_object('error', 'already_played');
  end if;

  if exists (select 1 from public.guesses where game_id = v_game.id and guess = p_guess) then
    return jsonb_build_object('error', 'duplicate_guess');
  end if;

  select answer, clue2 into v_answer, v_clue2
  from public.puzzle_answers where puzzle_date = v_date;

  if v_answer is null then
    return jsonb_build_object('error', 'no_puzzle_today');
  end if;

  v_distance := abs(p_guess - v_answer);

  v_direction := case
    when v_distance = 0 then 'correct'
    when p_guess < v_answer then 'below'
    else 'above'
  end;

  v_tier := case
    when v_distance = 0  then 'correct'
    when v_distance <= 10 then 'intense'
    when v_distance <= 24 then 'dark'
    when v_distance <= 99 then 'medium'
    else 'light'
  end;

  v_index := v_game.attempts_used + 1;

  insert into public.guesses (game_id, guess_index, guess, direction, tier)
  values (v_game.id, v_index, p_guess, v_direction, v_tier);

  if v_distance = 0 then
    v_status := 'won';
    v_score  := public.score_for_attempt(v_index);
  elsif v_index >= 7 then
    v_status := 'lost';
  else
    v_status := 'playing';
  end if;

  update public.games set
    attempts_used  = v_index,
    clue2_unlocked = clue2_unlocked or v_distance <= 10,
    status         = v_status,
    score          = v_score,
    finished_at    = case when v_status = 'playing' then null else now() end
  where id = v_game.id
  returning * into v_game;

  return jsonb_build_object(
    'puzzleDate',   v_date,
    'status',       v_status,
    'attemptsUsed', v_index,
    'maxAttempts',  7,
    'score',        v_score,
    'guess', jsonb_build_object(
      'guess',      p_guess,
      'direction',  v_direction,
      'tier',       v_tier,
      'isWithin10', v_distance > 0 and v_distance <= 10,
      'isOneAway',  v_distance = 1,
      'isCorrect',  v_distance = 0
    ),
    -- Only handed over once earned...
    'clue2', case when v_game.clue2_unlocked then v_clue2 else null end,
    -- ...and the answer only once the game can no longer be played.
    'answer', case when v_status = 'playing' then null else v_answer end
  );
end;
$$;

-- --------------------------------------------------------------- game_state

-- Everything the app needs to render today, including restoring a game that
-- was interrupted. Same disclosure rules as above.
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
               'guess', g.guess, 'direction', g.direction, 'tier', g.tier
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

-- ---------------------------------------------------------------- timezone

-- Players may set their timezone, but only their own, and only to a name
-- Postgres recognises — a bogus value would break puzzle date arithmetic.
create or replace function public.set_timezone(p_timezone text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  if not exists (select 1 from pg_timezone_names where name = p_timezone) then
    raise exception 'unknown timezone %', p_timezone;
  end if;

  insert into public.profiles (id, timezone) values (auth.uid(), p_timezone)
  on conflict (id) do update set timezone = excluded.timezone;
end;
$$;

-- Anonymous visitors get nothing; only a signed-in session may play.
revoke execute on function public.submit_guess(integer) from public, anon;
revoke execute on function public.game_state() from public, anon;
revoke execute on function public.set_timezone(text) from public, anon;

grant execute on function public.submit_guess(integer) to authenticated;
grant execute on function public.game_state() to authenticated;
grant execute on function public.set_timezone(text) to authenticated;

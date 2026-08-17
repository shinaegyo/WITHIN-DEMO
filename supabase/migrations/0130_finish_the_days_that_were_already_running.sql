-- The rounds that were never created, and a case that fell through.
--
-- The old ensure_game made each round_results row as the round started. The new
-- one makes all three up front, which is right - but every game already in
-- flight when 0124 ran has only the rounds it had reached. Finish round one and
-- game_state looks for round two, finds nothing, and returns a round of nulls.
--
-- The nulls then read as a bet, because
--
--   case v_r.round when 1 then 'cold' when 2 then 'clue' else 'bet' end
--
-- has no arm for null and an else that catches it. The player is shown a card
-- saying OUTSIDE, "the number was ", "you named null" - for a round three they
-- have not reached, of a game that is still on round two.
--
-- Three fixes: ensure_game tops up whatever is missing, the case names round
-- three instead of catching everything, and today's in-flight games are
-- backfilled now rather than on next open.
--
-- Source rounds are paired with the rounds that lack them rather than set to
-- r = r. The old server shuffled which secret a round drew from, so a game
-- whose round one is already drawing secret two would otherwise be handed that
-- same number again as its round two.

begin;

create or replace function public.ensure_game(p_uid uuid, p_date date)
returns public.games
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_game public.games%rowtype;
begin
  select * into v_game from public.games where user_id = p_uid and puzzle_date = p_date;

  if v_game.id is not null then
    -- Whatever this game is missing, with each gap taking a secret no other
    -- round of the same game has claimed.
    insert into public.round_results (game_id, round, source_round, attempts_allowed)
    select v_game.id, miss.rnd, free.src, public.daily_attempts(miss.rnd)
    from (
      select g.i as rnd, row_number() over (order by g.i) as slot
      from generate_series(1, 3) as g(i)
      where not exists (
        select 1 from public.round_results r where r.game_id = v_game.id and r.round = g.i
      )
    ) miss
    join (
      select g.i as src, row_number() over (order by g.i) as slot
      from generate_series(1, 3) as g(i)
      where not exists (
        select 1 from public.round_results r where r.game_id = v_game.id and r.source_round = g.i
      )
    ) free on free.slot = miss.slot
    on conflict do nothing;

    return v_game;
  end if;

  insert into public.games (user_id, puzzle_date, current_round, attempts_allowed)
  values (p_uid, p_date, 1, public.daily_attempts(1))
  on conflict (user_id, puzzle_date) do nothing
  returning * into v_game;

  if v_game.id is null then
    select * into v_game from public.games where user_id = p_uid and puzzle_date = p_date;
    return v_game;
  end if;

  insert into public.round_results (game_id, round, source_round, attempts_allowed)
  select v_game.id, r, r, public.daily_attempts(r) from generate_series(1, 3) r
  on conflict do nothing;

  return v_game;
end;
$$;

-- Everything still being played, fixed now. A player who finished a round in
-- the last hour should not have to close the app to get their next one.
with miss as (
  select g.id as game_id, s.i as rnd,
         row_number() over (partition by g.id order by s.i) as slot
  from public.games g
  cross join generate_series(1, 3) as s(i)
  where g.status = 'playing'
    and not exists (
      select 1 from public.round_results r where r.game_id = g.id and r.round = s.i
    )
),
free as (
  select g.id as game_id, s.i as src,
         row_number() over (partition by g.id order by s.i) as slot
  from public.games g
  cross join generate_series(1, 3) as s(i)
  where g.status = 'playing'
    and not exists (
      select 1 from public.round_results r where r.game_id = g.id and r.source_round = s.i
    )
)
insert into public.round_results (game_id, round, source_round, attempts_allowed)
select miss.game_id, miss.rnd, free.src, public.daily_attempts(miss.rnd)
from miss
join free on free.game_id = miss.game_id and free.slot = miss.slot
on conflict do nothing;

-- The same function, with the else that swallowed null replaced by the round
-- it was always meant to name. A round with no row now reports no kind, which
-- the client already reads as an ordinary search rather than a bet.
create or replace function public.game_state()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid   uuid := auth.uid();
  v_date  date;
  v_game  public.games%rowtype;
  v_r     public.round_results%rowtype;
  v_stats public.stats%rowtype;
  v_done  boolean;
begin
  if v_uid is null then return jsonb_build_object('error', 'not_authenticated'); end if;

  v_date := public.current_puzzle_date(v_uid);
  v_game := public.ensure_game(v_uid, v_date);
  select * into v_game from public.games where id = v_game.id;
  select * into v_r from public.round_results where game_id = v_game.id and round = v_game.current_round;
  select * into v_stats from public.stats where user_id = v_uid;
  v_done := v_game.status <> 'playing';

  return jsonb_build_object(
    'puzzleDate', v_date,
    'puzzleNumber', v_date - date '2026-08-12',
    'maxScore', 70,
    'dayStatus', v_game.status,
    'currentRound', v_game.current_round,
    'totalRounds', 3,
    'totalScore', v_game.total_score,
    'round', jsonb_build_object(
      'round', v_r.round,
      -- What kind of question this round is, so the screen knows what to draw.
      'kind', case v_r.round when 1 then 'cold' when 2 then 'clue' when 3 then 'bet' end,
      'status', v_r.status,
      'attemptsUsed', v_r.attempts_used,
      'attemptsAllowed', v_r.attempts_allowed,
      'called', v_r.called,
      'clueKind', v_r.clue_kind,
      'clue1', v_r.clue_text,
      'betLo', v_r.bet_lo,
      'betHi', v_r.bet_hi,
      'score', v_r.score,
      'answer', case when v_r.status <> 'playing' then (
        select answer from public.puzzle_round_secrets
        where puzzle_date = v_game.puzzle_date and round = v_r.source_round) end,
      'guesses', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'guess', g.guess, 'direction', g.direction, 'tier', g.tier,
                 'isCorrect', g.direction = 'correct',
                 'isWithin10', g.tier = 'intense', 'isOneAway', false
               ) order by g.guess_index)
        from public.guesses g where g.game_id = v_game.id and g.round = v_r.round
      ), '[]'::jsonb)
    ),
    'rounds', coalesce((
      select jsonb_agg(jsonb_build_object(
               'round', r.round, 'status', r.status, 'score', r.score,
               'attemptsUsed', r.attempts_used, 'attemptsAllowed', r.attempts_allowed,
               'called', r.called, 'clueKind', r.clue_kind,
               'answer', case when r.status <> 'playing' then (
                 select answer from public.puzzle_round_secrets
                 where puzzle_date = v_game.puzzle_date and round = r.source_round) end,
               'marks', coalesce((
                 select jsonb_agg(g2.direction order by g2.guess_index)
                 from public.guesses g2 where g2.game_id = v_game.id and g2.round = r.round
               ), '[]'::jsonb)
             ) order by r.round)
      from public.round_results r where r.game_id = v_game.id
    ), '[]'::jsonb),
    'stats', jsonb_build_object(
      'currentStreak', public.streak_of(v_uid),
      'maxStreak',   coalesce(v_stats.max_streak, 0),
      'gamesPlayed', coalesce(v_stats.games_played, 0),
      'gamesWon',    coalesce(v_stats.games_won, 0),
      'totalPoints', coalesce(v_stats.total_points, 0)
    ),
    'done', v_done
  );
end;
$$;

grant execute on function public.game_state() to authenticated;

commit;

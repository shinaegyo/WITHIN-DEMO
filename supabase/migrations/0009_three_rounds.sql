-- Three rounds per day.
--
-- The three numbers are shared by everyone, but each player sees them in their
-- own order, derived from their id and the date. That keeps the day fair —
-- same numbers, same difficulty — while making it useless to ask someone who
-- played earlier "what's round 1", because their round 1 isn't yours.
--
-- Gameplay tables are recreated rather than migrated: the old shape was one
-- number per day and the scoring table has changed, so existing rows could not
-- be carried over meaningfully.

drop function if exists public.submit_guess(integer);
drop function if exists public.game_state();
drop function if exists public.daily_leaderboard(integer);
drop function if exists public.dev_reset_today();
drop view if exists public.daily_leaderboard;
drop view if exists public.streak_leaderboard;

drop table if exists public.guesses cascade;
drop table if exists public.games cascade;
drop table if exists public.puzzle_answers cascade;
drop table if exists public.puzzles cascade;

-- ------------------------------------------------------------- puzzle data

create table public.puzzle_rounds (
  puzzle_date date not null,
  round       smallint not null check (round between 1 and 3),
  clue1       text not null,
  primary key (puzzle_date, round)
);

alter table public.puzzle_rounds enable row level security;

create policy "rounds are public" on public.puzzle_rounds for select using (true);

-- Answers and the bonus clue live here, with RLS on and no policies at all:
-- the public API returns nothing from this table no matter who asks.
create table public.puzzle_round_secrets (
  puzzle_date date not null,
  round       smallint not null check (round between 1 and 3),
  answer      smallint not null check (answer between 1 and 1000),
  clue2       text not null,
  primary key (puzzle_date, round)
);

alter table public.puzzle_round_secrets enable row level security;

-- ------------------------------------------------------------------ games

create type public.day_status as enum ('playing', 'complete', 'eliminated');
create type public.round_status as enum ('playing', 'won', 'lost');

create table public.games (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  puzzle_date      date not null,
  status           public.day_status not null default 'playing',
  current_round    smallint not null default 1 check (current_round between 1 and 3),
  -- Carries between rounds: solving on your last attempt costs you one next
  -- round, to a floor of 3.
  attempts_allowed smallint not null default 7 check (attempts_allowed between 3 and 7),
  total_score      integer not null default 0,
  retries_used     smallint not null default 0,
  started_at       timestamptz not null default now(),
  finished_at      timestamptz,

  unique (user_id, puzzle_date)
);

alter table public.games enable row level security;
create policy "read own games" on public.games for select using (auth.uid() = user_id);

create index games_leaderboard_idx
  on public.games (puzzle_date, total_score desc, finished_at asc)
  where status = 'complete';

create table public.round_results (
  game_id          uuid not null references public.games(id) on delete cascade,
  round            smallint not null check (round between 1 and 3),
  -- Which of the day's three shared numbers this slot maps to.
  source_round     smallint not null check (source_round between 1 and 3),
  status           public.round_status not null default 'playing',
  attempts_used    smallint not null default 0,
  attempts_allowed smallint not null,
  score            smallint not null default 0,
  clue2_unlocked   boolean not null default false,
  primary key (game_id, round)
);

alter table public.round_results enable row level security;
create policy "read own rounds" on public.round_results for select
  using (exists (select 1 from public.games g where g.id = game_id and g.user_id = auth.uid()));

create table public.guesses (
  id          uuid primary key default gen_random_uuid(),
  game_id     uuid not null references public.games(id) on delete cascade,
  round       smallint not null check (round between 1 and 3),
  guess_index smallint not null check (guess_index between 1 and 7),
  guess       smallint not null check (guess between 1 and 1000),
  direction   text not null check (direction in ('below', 'above', 'correct')),
  tier        text not null check (tier in ('light', 'medium', 'dark', 'intense', 'correct')),
  created_at  timestamptz not null default now(),

  unique (game_id, round, guess_index),
  -- Duplicate guesses are rejected per round, not per day.
  unique (game_id, round, guess)
);

alter table public.guesses enable row level security;
create policy "read own guesses" on public.guesses for select
  using (exists (select 1 from public.games g where g.id = game_id and g.user_id = auth.uid()));

-- -------------------------------------------------------------- scoring

-- 1st attempt 100, dropping by 10 to 40 on the 7th.
create or replace function public.score_for_attempt(attempts smallint)
returns smallint
language sql
immutable
as $$
  select case when attempts between 1 and 7 then (110 - 10 * attempts)::smallint else 0::smallint end;
$$;

-- Each player's ordering of the day's three numbers. Deterministic, so it
-- survives reinstalling, and unguessable without knowing the user id.
create or replace function public.round_order(p_uid uuid, p_date date)
returns smallint[]
language sql
immutable
as $$
  select (array[
    array[1,2,3], array[1,3,2], array[2,1,3],
    array[2,3,1], array[3,1,2], array[3,2,1]
  ])[ (abs(hashtext(p_uid::text || ':' || p_date::text)) % 6) + 1 ]::smallint[];
$$;

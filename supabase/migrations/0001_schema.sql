-- WITHIN — core schema.
--
-- Security model in one line: the client may never read an answer, and may
-- never write a game or a guess. All gameplay writes go through an Edge
-- Function using the service role, which bypasses RLS. Everything below is
-- written assuming the client key is public and hostile.

-- ---------------------------------------------------------------- profiles

create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  username    text unique check (char_length(username) between 3 and 16),
  -- IANA name, e.g. 'America/Los_Angeles'. The server derives the player's
  -- puzzle date from this, never from the device clock, so changing the phone's
  -- timezone can't unlock tomorrow's number early.
  timezone    text not null default 'UTC',
  created_at  timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "read own profile"
  on public.profiles for select using (auth.uid() = id);

create policy "update own profile"
  on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);

-- Usernames need to be readable by everyone for the leaderboard to show names.
create policy "read usernames"
  on public.profiles for select using (true);

-- ----------------------------------------------------------------- puzzles

-- Clues are public: the client shows them before the game is over.
create table if not exists public.puzzles (
  puzzle_date date primary key,
  clue1       text not null,
  clue2       text not null
);

alter table public.puzzles enable row level security;

create policy "puzzles are public"
  on public.puzzles for select using (true);

-- Answers live in their own table with RLS on and DELIBERATELY NO POLICIES.
-- With RLS enabled and no policy granting select, every request through the
-- public API returns zero rows — including a crafted one from a modified app.
-- Only the service role (Edge Functions) can read this.
create table if not exists public.puzzle_answers (
  puzzle_date date primary key references public.puzzles(puzzle_date) on delete cascade,
  answer      smallint not null check (answer between 1 and 1000)
);

alter table public.puzzle_answers enable row level security;

-- ------------------------------------------------------------------- games

create type public.game_status as enum ('playing', 'won', 'lost');

create table if not exists public.games (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  puzzle_date    date not null references public.puzzles(puzzle_date),
  status         public.game_status not null default 'playing',
  attempts_used  smallint not null default 0 check (attempts_used between 0 and 7),
  clue2_unlocked boolean not null default false,
  score          smallint not null default 0,
  started_at     timestamptz not null default now(),
  finished_at    timestamptz,

  -- THE once-per-day lock. Enforced by the database, so it holds no matter
  -- what the app or the Edge Function does.
  unique (user_id, puzzle_date)
);

alter table public.games enable row level security;

create policy "read own games"
  on public.games for select using (auth.uid() = user_id);
-- No insert/update policy on purpose: only the Edge Function writes games.

create index if not exists games_leaderboard_idx
  on public.games (puzzle_date, score desc, attempts_used asc, finished_at asc)
  where status = 'won';

-- ----------------------------------------------------------------- guesses

create table if not exists public.guesses (
  id          uuid primary key default gen_random_uuid(),
  game_id     uuid not null references public.games(id) on delete cascade,
  guess_index smallint not null check (guess_index between 1 and 7),
  guess       smallint not null check (guess between 1 and 1000),
  direction   text not null check (direction in ('below', 'above', 'correct')),
  tier        text not null check (tier in ('light', 'medium', 'dark', 'intense', 'correct')),
  created_at  timestamptz not null default now(),

  unique (game_id, guess_index),
  -- Backs the duplicate-guess rule at the database level too.
  unique (game_id, guess)
);

alter table public.guesses enable row level security;

create policy "read own guesses"
  on public.guesses for select
  using (exists (select 1 from public.games g where g.id = game_id and g.user_id = auth.uid()));

-- ------------------------------------------------------------------- stats

create table if not exists public.stats (
  user_id          uuid primary key references auth.users(id) on delete cascade,
  games_played     integer not null default 0,
  games_won        integer not null default 0,
  current_streak   integer not null default 0,
  max_streak       integer not null default 0,
  total_points     integer not null default 0,
  last_played_date date
);

alter table public.stats enable row level security;

create policy "read own stats"
  on public.stats for select using (auth.uid() = user_id);

-- --------------------------------------------------------------- functions

-- Points by the attempt the player solved on; 0 for a loss.
-- Mirrors src/game/scoring.ts — keep the two in step.
create or replace function public.score_for_attempt(attempts smallint)
returns smallint
language sql
immutable
as $$
  select case attempts
    when 1 then 100 when 2 then 95 when 3 then 90 when 4 then 80
    when 5 then 70  when 6 then 60 when 7 then 50 else 0
  end::smallint;
$$;

-- The player's current puzzle date, in their own timezone.
create or replace function public.current_puzzle_date(uid uuid)
returns date
language sql
stable
as $$
  select (now() at time zone coalesce((select timezone from public.profiles where id = uid), 'UTC'))::date;
$$;

-- Roll stats forward when a game finishes. A win on the day after the last
-- played date extends the streak; anything else restarts or ends it.
create or replace function public.apply_game_result()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'playing' or old.status <> 'playing' then
    return new;
  end if;

  insert into public.stats (user_id) values (new.user_id)
  on conflict (user_id) do nothing;

  update public.stats s set
    games_played   = s.games_played + 1,
    games_won      = s.games_won + (case when new.status = 'won' then 1 else 0 end),
    total_points   = s.total_points + new.score,
    current_streak = case
                       when new.status <> 'won' then 0
                       when s.last_played_date = new.puzzle_date - 1 then s.current_streak + 1
                       else 1
                     end,
    max_streak     = greatest(
                       s.max_streak,
                       case
                         when new.status <> 'won' then 0
                         when s.last_played_date = new.puzzle_date - 1 then s.current_streak + 1
                         else 1
                       end
                     ),
    last_played_date = new.puzzle_date
  where s.user_id = new.user_id;

  return new;
end;
$$;

create trigger games_apply_result
  after update on public.games
  for each row execute function public.apply_game_result();

-- Give every new auth user a profile and a stats row.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id) values (new.id) on conflict do nothing;
  insert into public.stats (user_id) values (new.id) on conflict do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ------------------------------------------------------------ leaderboards

-- Daily standings. Only finished, won games appear; the answer is never
-- involved, so this is safe to expose.
create or replace view public.daily_leaderboard
with (security_invoker = true) as
  select
    g.puzzle_date,
    p.username,
    g.user_id,
    g.score,
    g.attempts_used,
    g.finished_at,
    rank() over (
      partition by g.puzzle_date
      order by g.score desc, g.attempts_used asc, g.finished_at asc
    ) as rank
  from public.games g
  join public.profiles p on p.id = g.user_id
  where g.status = 'won';

create or replace view public.streak_leaderboard
with (security_invoker = true) as
  select p.username, s.user_id, s.current_streak, s.max_streak, s.total_points
  from public.stats s
  join public.profiles p on p.id = s.user_id
  where s.current_streak > 0;

-- The check on games.attempts_allowed has to match the game's own rules.
--
-- Winning a round on its last attempt costs one attempt next round, down to a
-- floor of three - that is the rule submit_guess enforces, and it is the only
-- path that ever asks for 4. Which is exactly the guess that failed:
--
--   new row for relation "games" violates check constraint
--   "games_attempts_allowed_check"
--
-- So the constraint in production is narrower than the rule. Clamping the value
-- was the right fix for the 8 that came from a modifier, and it could never
-- have fixed this: the number being refused is one the game is supposed to
-- produce.
--
-- Dropped and re-added at the range the rules actually use, rather than widened
-- to whatever silences it. Three to seven: seven for round one, five for round
-- three, four when the round before was won on the last attempt, three as the
-- floor.

alter table public.games drop constraint if exists games_attempts_allowed_check;

alter table public.games
  add constraint games_attempts_allowed_check
  check (attempts_allowed between 3 and 7);

-- round_results carries the same number for a single round, and the same rule
-- applies to it, so the same range is asserted there too.
alter table public.round_results drop constraint if exists round_results_attempts_allowed_check;

alter table public.round_results
  add constraint round_results_attempts_allowed_check
  check (attempts_allowed between 3 and 7);

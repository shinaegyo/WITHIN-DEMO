-- Round three allows three guesses, and the table refused them.
--
-- 0099 narrowed both attempts checks to "between 5 and 7" when the shortest
-- round in the game was five. Round three is now three free guesses and a
-- range, so ensure_game could not write the row it had just decided on, and
-- game_state failed outright for every player who had not already started a
-- day. The rules moved and the constraint did not.
--
-- Run this immediately after 0124. Between the two, the daily does not open.

begin;

alter table public.games drop constraint if exists games_attempts_allowed_check;
alter table public.games
  add constraint games_attempts_allowed_check
  check (attempts_allowed between 3 and 7);

alter table public.round_results drop constraint if exists round_results_attempts_allowed_check;
alter table public.round_results
  add constraint round_results_attempts_allowed_check
  check (attempts_allowed between 3 and 7);

commit;

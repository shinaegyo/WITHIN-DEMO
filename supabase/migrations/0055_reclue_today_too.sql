-- Today gets the new clues as well.
--
-- 0048 rewrote every day from tomorrow onward and deliberately spared today, so
-- that nobody part-way through a round would watch their clue change. The
-- effect of that caution was that the day people were actually playing kept the
-- arithmetic clues the whole point was to remove - and "it is fixed from
-- tomorrow" is not fixed.
--
-- A clue is not an answer. Rewriting one mid-day changes the wording of a hint
-- and nothing about the number behind it, which is a far smaller cost than a
-- day of "the number is divisible by 3" for everybody.
--
-- Safe to run again whenever the new clues need to reach further ahead.

update public.puzzle_rounds pr
set clue1 = public.pick_clue1(s.answer)
from public.puzzle_round_secrets s
where s.puzzle_date = pr.puzzle_date
  and s.round = pr.round
  and pr.puzzle_date >= current_date
  and pr.puzzle_date <= current_date + 366;

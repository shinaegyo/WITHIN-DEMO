-- Re-clue the year ahead.
--
-- Split out of 0047 and cut from ten years to one, because ten was several
-- hundred thousand clue evaluations in a single statement and long enough to
-- look hung. A year is a few thousand rows and lands in seconds.
--
-- The rest of the decade keeps its old clues for now. Nobody will see them for
-- twelve months, and by then this can run again - it is safe to repeat, and
-- re-clueing a day only rewrites a sentence, never the answer.
--
-- Today is deliberately excluded: people are part-way through it, and a clue
-- changing mid-round is worse than one more day of the old wording.

update public.puzzle_rounds pr
set clue1 = public.pick_clue1(s.answer)
from public.puzzle_round_secrets s
where s.puzzle_date = pr.puzzle_date
  and s.round = pr.round
  and pr.puzzle_date >  current_date
  and pr.puzzle_date <= current_date + 366;

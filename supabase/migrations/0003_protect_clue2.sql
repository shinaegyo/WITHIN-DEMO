-- Move clue2 out of the public puzzles table.
--
-- clue2 is a reward for reaching WITHIN 10, so it must not be readable before
-- then. Sitting in public.puzzles it was returned to anyone with the
-- publishable key, which handed out the bonus clue for free. It now lives
-- alongside the answer, where RLS has no policies and only the service role
-- can read it. The Edge Function returns it once the game has earned it.

alter table public.puzzle_answers
  add column if not exists clue2 text;

update public.puzzle_answers a
  set clue2 = p.clue2
  from public.puzzles p
  where p.puzzle_date = a.puzzle_date
    and a.clue2 is null;

alter table public.puzzle_answers
  alter column clue2 set not null;

alter table public.puzzles
  drop column if exists clue2;

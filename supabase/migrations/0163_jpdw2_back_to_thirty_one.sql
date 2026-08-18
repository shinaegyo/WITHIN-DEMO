-- jpdw2 back to level 31, with a full bar.
--
-- A hand correction, and the third one this week. The board prints levels
-- CLEARED, which is best_level - 1, so the number that reads as 31 is 32 - the
-- same arithmetic 0141 got wrong on its first pass and had to follow up.
--
-- THE GUESSES GO WITH THE LEVEL. This is what 0141 and 0144 missed and what
-- 0152 had to clean up after: every path in the game that moves somebody back
-- down a level clears that level's board first, because the numbers are
-- deterministic and a board left behind hands the answer over - or worse,
-- leaves a correct guess sitting on the level, which cannot then be completed
-- because retyping it comes back as a duplicate. Seven players were stranded
-- that way. Hand-written SQL has to do what the code does.
--
-- session_date is set to today so endless_climb leaves the level alone. It
-- rolls anybody back to their checkpoint on a new day, and without this the
-- next morning would undo the reset. Tomorrow the normal checkpoint rule
-- applies again, which is intended.
--
-- THIS MOVES best_level DOWN, which normal play never does, and there is no
-- undo. guesses_used is left alone: it is the summit tiebreak and a true
-- record of work done.

begin;

-- The board for the level he is being put back on, and anything above it.
delete from public.endless_guesses g
 using public.endless_runs r, public.profiles p
 where g.run_id = r.id
   and p.id = r.user_id
   and lower(p.username) = 'jpdw2'
   and r.week_start = public.endless_week(r.user_id)
   and g.level >= 32;

update public.endless_runs r
   set best_level    = 32,
       level         = 32,
       health        = 100,
       lives         = 5,
       health_date   = public.current_puzzle_date(r.user_id),
       session_date  = public.current_puzzle_date(r.user_id),
       attempts_used = 0,
       clue_level    = null,
       -- A level he is being placed on fresh should not still be marked as one
       -- he has failed, or the heal will not pay there.
       failed_levels = (
         select array(select x from unnest(coalesce(r.failed_levels, '{}'::smallint[])) x
                       where x < 32)
       )
  from public.profiles p
 where p.id = r.user_id
   and lower(p.username) = 'jpdw2'
   and r.week_start = public.endless_week(r.user_id);

commit;

-- Should read: level 32, best_level 32, health 100, and no guesses at or above
-- 32. The board will show him on 31.
select r.level,
       r.best_level,
       r.health,
       r.attempts_used,
       (select count(*) from public.endless_guesses g
         where g.run_id = r.id and g.level >= 32) as guesses_at_or_above_32
  from public.endless_runs r
  join public.profiles p on p.id = r.user_id
 where lower(p.username) = 'jpdw2'
   and r.week_start = public.endless_week(r.user_id);

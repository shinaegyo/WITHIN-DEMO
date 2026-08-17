-- Sarah and rey to the foot of the Sky.
--
-- Same hand-correction as 0141, for the same reason: the ladder they climbed
-- is not the ladder they are standing on, and the numbers they carried over
-- meant something different when they were earned.
--
-- best_level 17 rather than 16. The board prints levels *cleared*, which is
-- best_level - 1, so 17 is the number that reads as 16 - the first level of
-- the Sky, and its checkpoint, so a fall cannot drop them back onto the
-- Ground.
--
-- guesses_used is left alone. It is the summit tiebreak and a true record of
-- work done whatever the levels were called at the time.
--
-- This moves best_level down, which normal play never does, and there is no
-- undo.

begin;

update public.endless_runs r
   set best_level = 17,
       level      = 17
  from public.profiles p
 where p.id = r.user_id
   and lower(p.username) in ('sarah', 'rey')
   and r.week_start = public.endless_week(r.user_id);

commit;

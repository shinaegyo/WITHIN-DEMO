-- This week's climbs, moved by hand to fit the ladder they are now on.
--
-- A one-off correction, not a rule. The climb changed underneath a week that
-- was already being played: fifty levels became seventy-five and the tier
-- boundaries moved with them, so every stored best_level now means something
-- different from what it meant when it was earned. Somebody who reached 37
-- was in Thin air under the old five-tier split of ten; the same 37 is
-- Stratosphere now. And one player has summit_at set for clearing fifty, which
-- is no longer the top of anything.
--
-- Rather than pretend the numbers still line up, they are put where they
-- belong by hand: nobody above the Sky except the one player who was furthest
-- ahead, who lands at the foot of Stratosphere.
--
-- THIS DESTROYS PROGRESS AND CANNOT BE UNDONE. best_level only ever moves up
-- in normal play, and this moves it down. Read the numbers before running it.
--
-- What is deliberately left alone: guesses_used, which is the summit tiebreak
-- and a true record of work done whatever the levels were called at the time,
-- and health, which resets tomorrow morning anyway.

begin;

-- Nobody has cleared seventy-five, so nobody is topped out.
update public.endless_runs
   set summit_at = null
 where week_start = public.endless_week(user_id)
   and summit_at is not null;

-- Everyone down to the Sky at most. 30 is its last level.
update public.endless_runs
   set best_level = least(best_level, 30),
       level      = least(level, 30)
 where week_start = public.endless_week(user_id)
   and (best_level > 30 or level > 30);

-- And the one who was furthest ahead starts Stratosphere. 31 is its first
-- level, which is also its checkpoint, so a fall cannot drop them out of it.
update public.endless_runs r
   set best_level = 31,
       level      = 31
  from public.profiles p
 where p.id = r.user_id
   and lower(p.username) = 'jpdw2'
   and r.week_start = public.endless_week(r.user_id);

commit;

-- Follow-up, same day: the board prints levels *cleared*, which is
-- best_level - 1. Setting the furthest player to 31 therefore drew a 30 and a
-- Sky glyph - standing on Stratosphere's first level, but not shown as having
-- reached it. 32 is the number that reads as 31.
update public.endless_runs r
   set best_level = 32,
       level      = 32
  from public.profiles p
 where p.id = r.user_id
   and lower(p.username) = 'jpdw2'
   and r.week_start = public.endless_week(r.user_id)
   and r.best_level = 31;

-- Give today back, once.
--
-- The cap went from two climbs to one while people were partway through a day
-- they had already spent under the old rules, so everyone who had climbed at
-- all today was told to come back tomorrow. The rule is right; applying it
-- retroactively to a day already in progress is not.
--
-- This clears today's session for everyone, so the new rule starts from the
-- next climb rather than from one nobody knew about. Levels and the weekly
-- board are untouched - only the day's allowance is returned, and pressing
-- Climb restores the five lives as it always does.
--
-- A one-off. Tomorrow this is simply how the mode works.

update public.endless_runs
set sessions_used = 0, session_date = null
where session_date is not null
  and session_date >= (current_date - 1);

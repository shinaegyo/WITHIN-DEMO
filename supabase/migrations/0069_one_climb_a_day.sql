-- One climb a day.
--
-- Two sessions made the five lives cheap: losing them all cost you a checkpoint
-- and then handed you an immediate second go, so the deaths never quite landed.
-- One session a day means the five lives are the whole day's supply, and
-- reaching the next tier is a thing you did today rather than something you
-- ground out across two attempts.
--
-- It also makes the mode a daily habit rather than an afternoon. The board
-- already resets weekly; a single climb a day gives seven real attempts at it.

create or replace function public.endless_sessions_per_day() returns smallint
language sql immutable as $$ select 1::smallint $$;

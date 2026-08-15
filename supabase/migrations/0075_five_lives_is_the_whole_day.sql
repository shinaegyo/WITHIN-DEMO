-- Five lives a day, with no second door.
--
-- endless_restart belongs to the old mode, where a run was a single attempt you
-- could throw away and begin again. It ends the current run and inserts a new
-- one: five fresh lives, and a null session_date, which endless_sessions_left
-- reads as a day not yet spent. So calling it returned a full allowance, as
-- many times as anyone liked.
--
-- Nothing in the app calls it - but the key that reaches it ships in the
-- bundle, which is the whole reason the rules live in the database. A limit
-- only one screen respects is not a limit.
--
-- The climb replaced what it was for. Losing five lives already ends the day
-- and keeps your tier, and starting over from level 1 is what a death does now.

revoke execute on function public.endless_restart() from public, anon, authenticated;

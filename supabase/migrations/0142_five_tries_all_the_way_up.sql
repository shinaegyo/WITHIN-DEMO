-- Five tries at every level, and a fall that rises a point a tier.
--
-- 0140 gave six tries to level 60 and five in Orbit, on the reasoning that the
-- step from 21% failure to 71% was the whole difficulty curve and belonged at
-- the top. Modelling the week afterwards showed both halves of that were
-- wrong, for one reason I had missed entirely.
--
-- A FALL HANDS THE ANSWER OVER. Running out of attempts deletes that level's
-- guesses but not the number - endless_number is deterministic, so the same
-- one is waiting. Somebody who spent six guesses narrowing it to within ten
-- comes back to a blank board already knowing where it is, and takes it in
-- one. A retry is therefore nearly free, and a level costs at most a single
-- fall however hard it is.
--
-- Which broke every projection built on the old assumption. Raising the fall
-- percentage barely filtered anybody, because the cost was already capped at
-- one fall per level. And the six-try stretch below Orbit failed only 21% of
-- the time, so levels 1-60 were a corridor: 99.9% of players who came back
-- daily arrived at 61, all at once, and then stopped dead - days five, six and
-- seven moved a single level between them.
--
-- FIVE EVERYWHERE FIXES BOTH. There is no corridor and no wall, so progress is
-- even: a player who empties their bar each day lands at 9, 18, 26, 33, 41, 49
-- and 56 across the week. Roughly eight levels a day, every day, and no
-- afternoon where nothing moves. About 23% reach Orbit and 0.3% top out.
--
-- The fall ladder holds at 21 through 25 - one point a tier, so falling out of
-- Orbit still costs more than falling off the Ground, and small enough that a
-- day is four or five misses rather than two.
--
-- Nothing here caps anything. No limit on sessions, levels or time; health
-- running out ends the day and the whole bar comes back in the morning.
--
-- Known and deliberate: TRIES now reads 5 on every row of the rules table.
-- The tiers are told apart by their fall cost, by whether a clue arrives at
-- all, and by the arena itself - not by the number of guesses.

begin;

/**
 * Five, at every altitude.
 *
 * Measured: a level takes 5.6 guesses on average and five attempts fails about
 * 71% of the time. That sounds punishing and is not, because a fall is one
 * fall - the retry that follows arrives knowing roughly where the number is.
 * What five buys is that every level costs something, which is what makes the
 * climb move at a steady pace instead of racing to a wall and stopping.
 */
create or replace function public.endless_attempts(p_level integer)
returns smallint
language sql
immutable
as $fn$ select 5::smallint $fn$;

/**
 * What running out of attempts costs, as a share of health.
 *
 * One more point a tier. Falling out of Orbit should cost more than falling
 * off the Ground, and a hundred-point bar divided by twenty-odd is the four or
 * five misses that make up a day.
 *
 * Modelled across the ladder: 20-24 puts 40% of daily players into Orbit,
 * 21-25 puts 23% there, and 22-26 puts 10%. The middle one is the shape
 * wanted - most of a committed week spent in Thin air, Orbit in sight and
 * reached by a few.
 */
create or replace function public.endless_fall(p_level integer)
returns smallint
language sql
immutable
as $fn$
  select (case
    when p_level <= 15 then 21
    when p_level <= 30 then 22
    when p_level <= 45 then 23
    when p_level <= 60 then 24
    else 25
  end)::smallint;
$fn$;

revoke execute on function public.endless_attempts(integer) from public, anon, authenticated;
revoke execute on function public.endless_fall(integer)     from public, anon, authenticated;

commit;

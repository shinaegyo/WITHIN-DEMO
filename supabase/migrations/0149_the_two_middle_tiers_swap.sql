-- Stratosphere and Thin air trade mechanics.
--
-- They were the wrong way round. Measured over fifteen hundred simulated
-- levels each, at five attempts:
--
--   delayed shade    83.8% fail  (+/- 1.9)
--   no direction     81.5% fail  (+/- 2.0)
--
-- The intervals barely overlap and the ordering held across two independent
-- runs, so this is a real dip and not sampling noise. Stratosphere - meant to
-- be the gentler of the two - was the harder one, which puts a step backwards
-- in the middle of a ladder that is supposed to only ever rise.
--
-- Committing to a guess before you know how close the last one was costs more
-- than losing the arrow entirely, which I would not have guessed and did not:
-- the delay was built as the softer step.
--
-- So they swap, which also reads better. Thin air is where you act without
-- knowing - the tier named for having nothing to breathe is a fair place to
-- commit blind - and losing your bearings suits the one below it.
--
--   Ground 1-15    clue, full tiles
--   Sky 16-30      clue, full tiles
--   Stratosphere   how close, never which way        81.5%
--   Thin air       direction now, shade next guess   83.8%
--   Orbit 61-75    everything, and nothing else
--
-- Only the two guards move. Both mechanics are already built, tested and
-- verified live in 0146 and 0147; nothing about how either behaves changes,
-- only which fifteen levels wear it.

begin;

/** Which levels hold their colour back a step. Thin air now, not Stratosphere. */
create or replace function public.endless_delays_colour(p_level integer)
returns boolean
language sql
immutable
as $fn$ select p_level between 46 and 60 $fn$;

/** Which levels withhold the arrow. Stratosphere now, not Thin air. */
create or replace function public.endless_hides_direction(p_level integer)
returns boolean
language sql
immutable
as $fn$ select p_level between 31 and 45 $fn$;

revoke execute on function public.endless_delays_colour(integer)   from public, anon, authenticated;
revoke execute on function public.endless_hides_direction(integer) from public, anon, authenticated;

commit;

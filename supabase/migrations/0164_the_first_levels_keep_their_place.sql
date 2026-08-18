-- Nobody gets sent back to level 1 for having reached level 4.
--
-- endless_checkpoint floors at every fifth level, and integer division makes
-- that harsher than it reads: (4 / 5) * 5 is 0, so anyone whose best was 2, 3
-- or 4 had a checkpoint of level 1. A new day put them back at the very start.
--
-- That lands entirely on new players, in their first days, which is exactly who
-- can least afford to feel like the game forgot them. annelin opened the climb
-- this morning on level 1 having cleared several yesterday, and it read as lost
-- progress - the board still showed her best, so the app appeared to remember
-- while the game appeared to forget.
--
-- Below the first checkpoint, every level is its own. From five up nothing
-- changes at all:
--
--   best 2, 3, 4     were 1, now 2, 3, 4
--   best 5 to 9      5, unchanged
--   best 10 to 14    10, unchanged
--   tier floors      unchanged, and still win the greatest()
--
-- The tier floor still applies over the top, so climbing into Stratosphere
-- cannot be undone by a fall the way it could before 0140.

begin;

create or replace function public.endless_checkpoint(p_level integer)
returns smallint
language sql
immutable
as $fn$
  select greatest(
    -- Under the first checkpoint, your level IS your checkpoint. Above it, the
    -- last fifth level, as before.
    case when coalesce(p_level, 1) < 5
         then coalesce(p_level, 1)
         else (coalesce(p_level, 1) / 5) * 5
    end,
    public.arena_floor(coalesce(p_level, 1))
  )::smallint;
$fn$;

revoke execute on function public.endless_checkpoint(integer) from public, anon, authenticated;

commit;

-- Should read 1, 2, 3, 4, 5, 5, 5, 10, 15, 31 - the first four now their own.
select public.endless_checkpoint(1)  as l1,
       public.endless_checkpoint(2)  as l2,
       public.endless_checkpoint(3)  as l3,
       public.endless_checkpoint(4)  as l4,
       public.endless_checkpoint(5)  as l5,
       public.endless_checkpoint(7)  as l7,
       public.endless_checkpoint(9)  as l9,
       public.endless_checkpoint(12) as l12,
       public.endless_checkpoint(16) as l16,
       public.endless_checkpoint(33) as l33;

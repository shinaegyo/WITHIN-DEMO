-- The clue rule follows the tiers, because everything else does.
--
-- Clues were free up to level 9 and held back from level 10, while the tiers
-- change at 20, 40 and 80. So The Shallows behaved two different ways inside
-- one tier: a clue every number up to 9, and a clue only at the end from 10 -
-- with nothing on screen to explain why, since the screen names the tier and
-- not the number where the rule turned over.
--
-- Now each tier takes one more thing away, which is what a tier is for:
--
--   The Shallows   a clue from the first attempt
--   The Depths     with three attempts left
--   The Dark       with two
--   The Edge       with one

create or replace function public.endless_clue_at(p_level integer)
returns smallint
language sql
immutable
as $$
  select (case
    when p_level <= 19 then 99   -- always
    when p_level <= 39 then 3
    when p_level <= 79 then 2
    else 1
  end)::smallint;
$$;

revoke execute on function public.endless_clue_at(integer) from public, anon, authenticated;

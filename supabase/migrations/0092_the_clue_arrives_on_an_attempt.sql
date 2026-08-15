-- The clue arrives on an attempt, counted forward.
--
--   The Shallows   on the first attempt
--   The Depths     on the third
--   The Dark       on the fourth
--   The Edge       on the fifth
--
-- The screen already thinks in attempts remaining, so the number is derived
-- from the tier's own allowance rather than written down twice: the third
-- attempt of seven is five remaining, and if a tier's attempts ever change the
-- clue still arrives on the third.
--
-- Counted forward because that is how it is played. "Three attempts left" is a
-- fact about the end of a number; "on your third guess" is a fact about the
-- moment it happens.

create or replace function public.endless_clue_at(p_level integer)
returns smallint
language sql
immutable
as $$
  select (case
    when p_level <= 19 then 99                                     -- from the first
    when p_level <= 39 then public.endless_attempts(p_level) - 2   -- from the third
    when p_level <= 79 then public.endless_attempts(p_level) - 3   -- from the fourth
    else public.endless_attempts(p_level) - 4                      -- from the fifth
  end)::smallint;
$$;

revoke execute on function public.endless_clue_at(integer) from public, anon, authenticated;

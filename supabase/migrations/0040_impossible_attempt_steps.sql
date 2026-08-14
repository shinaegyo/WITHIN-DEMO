-- A gentler, flatter ladder for Impossible.
--
-- Attempts previously fell every other level and hit four by the seventh, which
-- put the wall so early that a hundred-level cap was decoration and most runs
-- died before the mode had shown itself. Six attempts now hold for nineteen
-- levels, five to forty-nine, and four beyond that.
--
-- Long plateaus rather than a constant slide: a player settles into a rhythm,
-- and the two moments it tightens are events they can be told about.

create or replace function public.endless_attempts(p_level integer)
returns smallint
language sql
immutable
as $$
  select (case
    when p_level < 20 then 6
    when p_level < 50 then 5
    else 4
  end)::smallint;
$$;

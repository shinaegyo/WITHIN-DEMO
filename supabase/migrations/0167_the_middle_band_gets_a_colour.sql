-- Stratosphere's middle shade was invisible.
--
-- The tier reports three bands and the tile colours only render two of them.
-- The alpha ramp tints "intense" at 72% and "dark" at 50%, and gives nothing
-- to medium, light, distant or vast - so mapping the middle band to "medium"
-- drew it exactly like the far one. Three shades on paper, two on screen, and
-- the label doing all the work.
--
-- The middle band becomes "dark", which is the ramp's other tinted step and
-- has no other use in this tier. Now the three read as three:
--
--   within 24     intense   strong tint
--   25-249 away   dark      half tint
--   250+ away     vast      no tint
--
-- Distances are unchanged. This is which name a band answers to, not where it
-- starts.

begin;

create or replace function public.endless_band(p_level integer, p_dist integer)
returns text
language sql
immutable
as $fn$
  select case
    when p_dist = 0 then 'correct'
    when public.endless_shades(p_level) = 1 then
      case when p_dist <= 10 then 'intense' else 'vast' end
    when public.endless_shades(p_level) = 3 then
      case when p_dist <= 24  then 'intense'
           when p_dist <= 249 then 'dark'
           else 'vast' end
    else
      case when p_dist <= 10  then 'intense'
           when p_dist <= 24  then 'dark'
           when p_dist <= 99  then 'medium'
           when p_dist <= 249 then 'light'
           when p_dist <= 499 then 'distant'
           else 'vast' end
  end;
$fn$;

revoke execute on function public.endless_band(integer, integer) from public, anon, authenticated;

commit;

-- At level 35 should read: 8 -> intense, 40 -> dark, 400 -> vast.
select d as distance, public.endless_band(35, d) as band
  from unnest(array[8, 40, 400]) d;

-- The fall finally means something at altitude.
--
-- It read 18, 19, 20, 21, 22 - one point a tier, so a stumble on the Ground
-- and a fall out of Orbit cost within a fifth of each other. The climb went up
-- and the consequence stayed flat.
--
--   Ground 10   a full bar is ten mistakes
--   Sky    15   seven
--   Strato 22   five
--   Thin   32   four
--   Orbit  45   three
--
-- Four and a half times the cost at the top, against 1.2 times before.
--
-- FALLS DO NOT CHANGE HOW OFTEN A LEVEL IS FAILED. That is set by what a tier
-- tells you and how many guesses it gives, and 0165 settled it at 41, 47, 59,
-- 67 and 73 percent. This decides what a failure costs, which is a different
-- question and the one the altitude should be answering.
--
-- What it does change is the shape of a week. Modelled over five thousand
-- runs, seven days each:
--
--   day one ends: 4% still on the Ground, 94% in the Sky, 2% past level 30
--   day seven median level 65, and 0.26% have topped out
--
-- Day one finishing in the Sky was the ask, and it does - almost nobody reaches
-- Stratosphere on their first day. The summit goes from 8.8% of committed
-- players to roughly one in four hundred, which is what "impossible" was
-- supposed to mean.
--
-- The Ground gets gentler, not harsher: 10 rather than 18. A beginner's first
-- day should not be where the punishment lives. The height is.

begin;

create or replace function public.endless_fall(p_level integer)
returns smallint
language sql
immutable
as $fn$
  select (case
    when p_level <= 15 then 10
    when p_level <= 30 then 15
    when p_level <= 45 then 22
    when p_level <= 60 then 32
    else 45
  end)::smallint;
$fn$;

revoke execute on function public.endless_fall(integer) from public, anon, authenticated;

commit;

-- Should read 10, 15, 22, 32, 45 - and the falls a full bar buys: 10, 7, 5, 4, 3.
select l as level,
       public.endless_fall(l) as fall,
       ceil(100.0 / public.endless_fall(l)) as falls_in_a_full_day
  from unnest(array[5, 20, 35, 50, 70]) l;

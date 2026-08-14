-- Every day plays by the same rules.
--
-- Twist and Bonus days were meant to give the week a shape, and instead they
-- made two days a week untrustworthy. A score is only worth comparing against
-- another score if both were earned under the same rules, and a leaderboard
-- that mixes a double-points day with an ordinary one is comparing nothing. The
-- same went for the day someone opened to find fewer attempts than they had
-- yesterday, through no decision of their own.
--
-- Done by making the picker return 'standard' for every date rather than by
-- unpicking the machinery. Everything downstream already asks for the day's
-- parameters instead of testing for named days, so a standard spec means
-- ordinary attempts, ordinary scoring and no banner - with nothing left half
-- wired. The fifty definitions stay in modifier_spec, unreferenced, should this
-- ever come back as something a player opts into.

create or replace function public.day_modifier(p_date date)
returns text
language sql
immutable
as $$
  select 'standard'::text;
$$;

revoke execute on function public.day_modifier(date) from public, anon;

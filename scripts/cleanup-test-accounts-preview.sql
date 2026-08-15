-- READ ONLY. Lists the accounts the cleanup would delete. Nothing is removed.
--
-- Two kinds of clutter, both mine: anonymous sessions from verifying migrations
-- against the live database, which have no username at all, and the dev###
-- accounts the localhost shortcut creates. dev94751 is the one in use and stays.
--
-- The last condition is the guard that matters: anybody who has finished a day
-- is a real player whatever their name looks like, and is never listed here.

select
  p.id,
  coalesce(p.username, '(no name)') as username,
  p.created_at,
  (select count(*) from public.games g where g.user_id = p.id) as games,
  (select count(*) from public.endless_runs r where r.user_id = p.id) as climbs,
  (select max(rr.best_level - 1) from public.endless_runs rr where rr.user_id = p.id) as deepest
from public.profiles p
where (
        p.username is null
        or (p.username ~ '^dev[0-9]+$' and p.username <> 'dev94751')
      )
  and not exists (
        select 1 from public.games g
        where g.user_id = p.id and g.status = 'complete'
      )
order by p.created_at;

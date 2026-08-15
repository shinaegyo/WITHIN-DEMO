-- Everything already played counts.
--
-- XP started counting the day it shipped, so eighteen people who have been
-- playing for weeks opened the app and found themselves on level 1 next to
-- someone who installed it that morning. A level is a record of what you have
-- done; starting it at zero for the people with the most done is the wrong way
-- round.
--
-- So this recomputes each player's total from what the rules would have paid at
-- the time, out of the history that still exists:
--
--   the daily      the points scored, plus fifty for a day where all three
--                  rounds were won - exactly what the trigger awards now
--   Impossible     twenty a level cleared, and fifty for each tier reached,
--                  read off the deepest level of every week's climb
--   duels          eighty a win, forty a draw, twenty-five a loss
--
-- Written as a recompute rather than an increment, so running it twice leaves
-- the same number. Practice pays nothing, as it does now.

with daily as (
  select g.user_id,
         sum(greatest(0, g.total_score))::bigint
         + 50 * count(*) filter (
             where (select count(*) from public.round_results r
                    where r.game_id = g.id and r.status = 'won') = 3
           ) as xp
  from public.games g
  where g.status = 'complete'
  group by g.user_id
),
climbs as (
  select r.user_id,
         sum(
           20 * greatest(0, r.best_level - 1)
           + 50 * (case when r.best_level > 20 then 1 else 0 end
                 + case when r.best_level > 40 then 1 else 0 end
                 + case when r.best_level > 80 then 1 else 0 end)
         )::bigint as xp
  from public.endless_runs r
  group by r.user_id
),
duelled as (
  select p.user_id, sum(p.xp)::bigint as xp
  from (
    select d.challenger_id as user_id,
           case when d.winner_id is null then 40
                when d.winner_id = d.challenger_id then 80 else 25 end as xp
    from public.duels d where d.status = 'complete'
    union all
    select d.opponent_id,
           case when d.winner_id is null then 40
                when d.winner_id = d.opponent_id then 80 else 25 end
    from public.duels d where d.status = 'complete'
  ) p
  group by p.user_id
)
update public.profiles pr
set xp = coalesce(d.xp, 0) + coalesce(c.xp, 0) + coalesce(u.xp, 0)
from (select id from public.profiles) all_players
left join daily    d on d.user_id = all_players.id
left join climbs   c on c.user_id = all_players.id
left join duelled  u on u.user_id = all_players.id
where pr.id = all_players.id
  and pr.xp is distinct from (coalesce(d.xp, 0) + coalesce(c.xp, 0) + coalesce(u.xp, 0));

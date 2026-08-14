-- What happened to the people who arrived.
--
-- No instrumentation: an anonymous account is created the moment somebody opens
-- the link, a username row when they finish onboarding, a games row when they
-- start a day. The journey is already recorded - these are just the questions.
--
-- Run any block on its own in the SQL editor.

-- 1. Arrivals, and how far each day's arrivals got.
--
-- The single most useful query here. Every row is one day of traffic: how many
-- opened it, how many got through onboarding, how many finished a day. Watch
-- the last column during an ad campaign - it is the answer to "is this worth
-- more money".
select
  d.day::date                                        as arrived_on,
  count(*)                                           as opened,
  count(p.username)                                  as named,
  count(g.first_game)                                as started_a_day,
  count(g.finished)                                  as finished_a_day,
  round(100.0 * count(g.finished) / nullif(count(*), 0), 1) as pct_finished
from (
  select u.id, date_trunc('day', u.created_at) as day
  from auth.users u
) d
left join public.profiles p on p.id = d.id
left join lateral (
  select min(puzzle_date) as first_game,
         min(puzzle_date) filter (where status = 'complete') as finished
  from public.games where user_id = d.id
) g on true
group by 1
order by 1 desc
limit 30;

-- 2. Did they come back? Day-2 and day-7 retention by arrival day.
--
-- Retention is the only number that decides whether to spend more. Anything
-- under about 20% coming back the next day means the traffic is a leak.
with player as (
  select u.id, date_trunc('day', u.created_at)::date as joined
  from auth.users u
),
days as (
  select g.user_id, count(distinct g.puzzle_date) as days_played,
         max(g.puzzle_date) as last_day
  from public.games g group by g.user_id
)
select
  pl.joined,
  count(*)                                                as players,
  count(*) filter (where d.days_played >= 2)              as came_back,
  count(*) filter (where d.days_played >= 7)              as still_here_at_7,
  round(100.0 * count(*) filter (where d.days_played >= 2) / nullif(count(*), 0), 1) as pct_returned
from player pl
left join days d on d.user_id = pl.id
group by 1
order by 1 desc
limit 30;

-- 3. Where the first day ends.
--
-- A day that stops on round 1 is a different problem from one that stops on
-- round 3. If most people never reach round 2, the first round is too hard.
select
  g.current_round        as reached_round,
  g.status,
  count(*)               as players
from public.games g
join (
  select user_id, min(puzzle_date) as first_day from public.games group by user_id
) f on f.user_id = g.user_id and f.first_day = g.puzzle_date
group by 1, 2
order by 1, 2;

-- 4. How often a round is lost, by round.
--
-- The balance question. Seven attempts on 1-1000 cannot guarantee a solve, so
-- some losses are expected - but if round 1 is being lost often, new players
-- are meeting the miss rule before they have understood the game.
select
  r.round,
  count(*)                                              as rounds_played,
  count(*) filter (where r.status = 'lost')             as lost,
  round(100.0 * count(*) filter (where r.status = 'lost') / nullif(count(*), 0), 1) as pct_lost,
  round(avg(r.attempts_used) filter (where r.status = 'won'), 2) as avg_guesses_when_won
from public.round_results r
group by 1
order by 1;

-- 5. Which modes anybody actually touches.
select 'ranked'     as mode, count(distinct user_id) as players from public.ranked_stats where played > 0
union all
select 'impossible', count(distinct user_id) from public.endless_runs
union all
select 'duels', count(distinct challenger_id) from public.duels
union all
select 'friends', count(distinct requester_id) from public.friendships where status = 'accepted';

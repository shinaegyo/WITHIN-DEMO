-- READ ONLY. Dumps one player's climb so a failing guess can be explained.
-- Change the username on the first line if it is not jamba.

with me as (
  select id from public.profiles where lower(username) = lower('jamba')
)
select
  r.id                                                as run_id,
  r.week_start,
  r.run_date,
  r.session_date,
  public.current_puzzle_date(r.user_id)               as today_for_them,
  (select timezone from public.profiles p where p.id = r.user_id) as their_timezone,
  r.level,
  r.best_level,
  r.lives,
  r.attempts_used,
  r.sessions_used,
  r.status,
  r.clue_level,
  r.clue1,
  public.endless_attempts(r.level)                    as attempts_allowed,
  (select count(*) from public.endless_guesses g
    where g.run_id = r.id and g.level = r.level)      as rows_on_this_level,
  (select max(g.guess_index) from public.endless_guesses g
    where g.run_id = r.id and g.level = r.level)      as highest_index,
  (select count(*) from public.endless_guesses g
    where g.run_id = r.id)                            as rows_all_levels,
  public.endless_window(r.id, r.level)                as clue_window
from public.endless_runs r
join me on me.id = r.user_id
order by r.started_at desc;

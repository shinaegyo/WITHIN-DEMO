-- A solved level nobody can finish.
--
-- Seven runs are sitting on a level whose board already shows the answer,
-- marked correct, and cannot move off it. Typing that number again comes back
-- as a duplicate guess; typing anything else is wrong. sarah has been staring
-- at a green CORRECT tile on level 17 with nothing to press.
--
-- Mine. 0141 clamped the week down to level 30 and 0144 put sarah and rey on
-- 17. Both moved level backwards, and neither cleared the board of the level
-- they moved people onto, nor reset attempts_used. So each of those players
-- inherited their own earlier, legitimate clear of that level - winning guess
-- included. Every path in the game that moves a level backwards deletes its
-- guesses first: the fall in endless_guess, the death branch beside it, the
-- checkpoint rollback in endless_climb. Hand-written SQL skipped the rule the
-- code has always followed.
--
-- The fix goes into endless_climb rather than into a one-off update, so it
-- holds for anything similar later. Every read of a run passes through there,
-- so the seven repair themselves the next time their owners open the app, and
-- nothing else has to know.
--
-- They replay the level. They did clear it once, and re-crediting it would
-- undo the rescale those two migrations were for - which was deliberate, and
-- said at the time that it destroys progress.

begin;

create or replace function public.endless_climb(p_uid uuid)
returns public.endless_runs
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_week  date := public.endless_week(p_uid);
  v_today date := public.current_puzzle_date(p_uid);
  v_run   public.endless_runs%rowtype;
  v_floor smallint;
begin
  select * into v_run from public.endless_runs
  where user_id = p_uid and week_start = v_week
  order by started_at desc limit 1;

  if v_run.id is null then
    insert into public.endless_runs
      (user_id, week_start, run_date, session_date, health_date, clue1, lives, health,
       sessions_used, status)
    values
      (p_uid, v_week, v_today, null, v_today,
       public.pick_clue1(public.endless_number(v_week, 1)),
       5, 100, 0, 'active')
    returning * into v_run;
    return v_run;
  end if;

  -- The day's 30, once per date however many times this is called.
  if v_run.health_date is distinct from v_today then
    update public.endless_runs set
      health = public.endless_daily_health(),
      health_date = v_today
    where id = v_run.id
    returning * into v_run;

    -- lives is derived from health and kept only for older clients.
    update public.endless_runs set
      lives = greatest(0, ceil(v_run.health / 20.0)::smallint)
    where id = v_run.id
    returning * into v_run;
  end if;

  -- A level whose board already holds a correct guess is a level nobody can
  -- finish. The number is right there, and typing it again is refused as a
  -- duplicate - so the screen sits on a solved level for ever.
  --
  -- Normal play cannot produce that. Every path that moves somebody back onto
  -- a level clears its board first: a fall, a death, the checkpoint on a new
  -- day. Two hand-written corrections did not - 0141 clamped the week to level
  -- 30 and 0144 put sarah and rey on 17, both moving level down and leaving the
  -- old board behind - and stranded seven runs between them.
  --
  -- Repaired here rather than in a one-off update so it stays repaired. The
  -- check is an exists() on a primary-key prefix, it runs on a read that was
  -- already loading this row, and in ordinary play it never fires.
  if exists (select 1 from public.endless_guesses
              where run_id = v_run.id and level = v_run.level
                and direction = 'correct')
  then
    delete from public.endless_guesses
    where run_id = v_run.id and level = v_run.level;

    update public.endless_runs set
      attempts_used = 0,
      clue_level = null
    where id = v_run.id
    returning * into v_run;
  end if;

  if v_run.session_date is distinct from v_today then
    v_floor := public.endless_checkpoint(greatest(v_run.level, v_run.best_level));

    if v_run.level is distinct from v_floor or v_run.attempts_used > 0 then
      -- From the floor upward: those levels are about to be played again, and a
      -- board carried over from the first time through is the answer.
      delete from public.endless_guesses
      where run_id = v_run.id and level >= v_floor;

      update public.endless_runs set
        level = v_floor,
        attempts_used = 0,
        clue_level = null
      where id = v_run.id
      returning * into v_run;
    end if;
  end if;

  return v_run;
end;
$$;

revoke execute on function public.endless_climb(uuid) from public, anon, authenticated;

-- And the seven already stranded, now rather than whenever they next open the
-- app. The guard above would reach them eventually; somebody staring at a
-- board they cannot play should not have to wait for it.
--
-- One statement rather than a temp table and three: the SQL editor does not
-- keep a temp table between statements, and this wants to be atomic anyway.
-- A data-modifying CTE always runs, referenced or not, and every branch reads
-- the same snapshot - so the delete sees the boards as they were and the
-- update still finds the runs it is meant to.
with stranded as (
  select r.id, r.level
    from public.endless_runs r
   where r.week_start = public.endless_week(r.user_id)
     and exists (select 1 from public.endless_guesses g
                  where g.run_id = r.id and g.level = r.level
                    and g.direction = 'correct')
),
cleared as (
  delete from public.endless_guesses g
   using stranded s
   where g.run_id = s.id and g.level = s.level
  returning g.run_id
)
-- attempts_used came across from whatever level they were standing on when
-- they were moved, which is why sarah had three spent on a board of four.
update public.endless_runs set attempts_used = 0, clue_level = null
 where id in (select id from stranded);

commit;

-- Should return no rows.
select p.username, r.level
  from public.endless_runs r
  join public.profiles p on p.id = r.user_id
 where r.week_start = public.endless_week(r.user_id)
   and exists (select 1 from public.endless_guesses g
                where g.run_id = r.id and g.level = r.level
                  and g.direction = 'correct');

-- Recompute stats instead of incrementing them.
--
-- The old trigger added to the running totals whenever a day stopped being
-- 'playing'. Retrying after elimination makes that fire twice for one day:
-- once on elimination, once on completion. A single 230-point day showed up as
-- gamesPlayed 2 and totalPoints 360.
--
-- Deriving the totals from the games table instead makes the trigger
-- idempotent, so it no longer matters how many times a day changes state.

create or replace function public.recompute_stats(p_uid uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_current integer := 0;
  v_max     integer := 0;
begin
  insert into public.stats (user_id) values (p_uid) on conflict (user_id) do nothing;

  -- Consecutive completed days form runs where (date - row_number) is constant,
  -- so grouping on that gives every streak the player has ever had.
  with completed as (
    select puzzle_date
    from public.games
    where user_id = p_uid and status = 'complete'
  ),
  grouped as (
    select puzzle_date,
           puzzle_date - (row_number() over (order by puzzle_date))::integer as grp
    from completed
  ),
  runs as (
    select grp, count(*)::integer as len, max(puzzle_date) as ends_on
    from grouped group by grp
  )
  select
    coalesce((select len from runs order by ends_on desc limit 1), 0),
    coalesce((select max(len) from runs), 0)
  into v_current, v_max;

  update public.stats s set
    games_played = (select count(*) from public.games g
                    where g.user_id = p_uid and g.status <> 'playing'),
    games_won    = (select count(*) from public.games g
                    where g.user_id = p_uid and g.status = 'complete'),
    total_points = coalesce((select sum(g.total_score) from public.games g
                             where g.user_id = p_uid), 0),
    current_streak = v_current,
    max_streak     = greatest(s.max_streak, v_max),
    last_played_date = (select max(g.puzzle_date) from public.games g
                        where g.user_id = p_uid and g.status <> 'playing')
  where s.user_id = p_uid;
end;
$$;

create or replace function public.apply_game_result()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.recompute_stats(new.user_id);
  return new;
end;
$$;

drop trigger if exists games_apply_result on public.games;
create trigger games_apply_result
  after insert or update on public.games
  for each row execute function public.apply_game_result();

-- The dev reset can now share the same path rather than repeating the sums.
create or replace function public.dev_reset_today()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid  uuid := auth.uid();
  v_date date;
begin
  if v_uid is null then
    return jsonb_build_object('error', 'not_authenticated');
  end if;
  if not exists (select 1 from public.dev_testers where user_id = v_uid) then
    return jsonb_build_object('error', 'not_a_tester');
  end if;

  v_date := public.current_puzzle_date(v_uid);
  delete from public.games where user_id = v_uid and puzzle_date = v_date;
  perform public.recompute_stats(v_uid);

  return jsonb_build_object('ok', true);
end;
$$;

revoke execute on function public.dev_reset_today() from public, anon;
grant execute on function public.dev_reset_today() to authenticated;

-- Repair anyone already double-counted by the old trigger.
do $$
declare r record;
begin
  for r in select user_id from public.stats loop
    perform public.recompute_stats(r.user_id);
  end loop;
end $$;

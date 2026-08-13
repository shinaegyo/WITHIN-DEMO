-- Developer-only reset of today's game.
--
-- There is deliberately no general "replay today" function: shipping one would
-- hand every player a way around the once-per-day rule, which is the whole
-- point of the game. This is gated on an explicit allowlist instead, so it
-- exists for testing without being reachable by anyone else.
--
-- dev_testers has RLS on and no policies, so the list itself is invisible to
-- the API — you can't even discover who is on it.

create table if not exists public.dev_testers (
  user_id uuid primary key references auth.users(id) on delete cascade,
  note    text,
  added_at timestamptz not null default now()
);

alter table public.dev_testers enable row level security;

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

  -- Guesses cascade with the game row.
  delete from public.games where user_id = v_uid and puzzle_date = v_date;

  -- The stats trigger already counted the deleted game, so rebuild the totals
  -- from what actually remains rather than leaving them inflated.
  update public.stats s set
    games_played = (select count(*) from public.games g
                    where g.user_id = v_uid and g.status <> 'playing'),
    games_won    = (select count(*) from public.games g
                    where g.user_id = v_uid and g.status = 'won'),
    total_points = coalesce((select sum(g.score) from public.games g
                             where g.user_id = v_uid), 0),
    last_played_date = (select max(g.puzzle_date) from public.games g
                        where g.user_id = v_uid and g.status <> 'playing')
  where s.user_id = v_uid;

  return jsonb_build_object('ok', true, 'puzzleDate', v_date);
end;
$$;

revoke execute on function public.dev_reset_today() from public, anon;
grant execute on function public.dev_reset_today() to authenticated;

-- Add yourself. Safe to re-run.
insert into public.dev_testers (user_id, note)
select id, 'owner' from auth.users where email = 'jamba4shin@gmail.com'
on conflict (user_id) do nothing;

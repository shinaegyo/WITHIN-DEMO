-- Show how the head-to-head is going, under each opponent's name.
--
-- The row said "You 0/3 · them 3/3", which is progress through the current
-- duel - something the heading above it already answers by filing the duel
-- under YOUR TURN or WAITING ON THEM. What it never said is the thing friends
-- actually care about: who has been winning.
--
-- Counted back from the most recent finished duel, stopping at the first
-- different result. A draw ends a streak rather than extending it.

create or replace function public.duel_streak(p_uid uuid, p_other uuid)
returns integer
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  r      record;
  latest text := null;
  n      int := 0;
begin
  for r in
    select case when winner_id is null then 'draw'
                when winner_id = p_uid then 'won'
                else 'lost' end as result
    from public.duels
    where status = 'complete'
      and p_uid in (challenger_id, opponent_id)
      and (case when challenger_id = p_uid then opponent_id else challenger_id end) = p_other
    order by finished_at desc
  loop
    if latest is null then
      -- Most recent was a draw: no run to report.
      if r.result = 'draw' then return 0; end if;
      latest := r.result;
      n := 1;
    elsif r.result = latest then
      n := n + 1;
    else
      exit;
    end if;
  end loop;

  -- Negative for a run of losses, so one number carries both.
  if latest = 'lost' then return -n; end if;
  return n;
end;
$$;

create or replace function public.duel_list()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    return jsonb_build_object('error', 'not_authenticated');
  end if;

  return jsonb_build_object('duels', coalesce((
    select jsonb_agg(x order by x.created_at desc)
    from (
      select
        d.id,
        d.status,
        d.created_at,
        d.challenger_id = v_uid as i_challenged,
        coalesce(p.username, 'Player') as opponent,
        (select count(*) from public.duel_progress g
          where g.duel_id = d.id and g.user_id = v_uid and g.status <> 'playing') as my_done,
        (select count(*) from public.duel_progress g
          where g.duel_id = d.id and g.user_id <> v_uid and g.status <> 'playing') as their_done,
        case
          when d.status <> 'complete' then null
          when d.winner_id is null then 'draw'
          when d.winner_id = v_uid then 'won'
          else 'lost'
        end as outcome,
        public.duel_streak(
          v_uid,
          case when d.challenger_id = v_uid then d.opponent_id else d.challenger_id end
        ) as streak
      from public.duels d
      join public.profiles p
        on p.id = case when d.challenger_id = v_uid then d.opponent_id else d.challenger_id end
      where v_uid in (d.challenger_id, d.opponent_id)
        and d.status <> 'declined'
    ) x
  ), '[]'::jsonb));
end;
$$;

revoke execute on function public.duel_streak(uuid, uuid) from public, anon;
revoke execute on function public.duel_list()             from public, anon;
grant execute on function public.duel_list() to authenticated;

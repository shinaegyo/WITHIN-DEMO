-- A way out of a duel.
--
-- There was none. A duel only ended when both players finished every round, so
-- one person losing interest left it open forever - and since a pair can only
-- have one duel going at a time, that pair could never start another. The
-- abandoned match quietly took the feature away from both of them.
--
-- Leaving hands the win to the other player. That is the honest reading: they
-- were willing to finish and you were not, and it means a forfeit cannot be
-- used to dodge a loss that was already coming. It counts on the head-to-head
-- record like any other result.
--
-- A challenge nobody has accepted is different. Nothing has been played, so
-- withdrawing it leaves no result behind, exactly like declining one.

create or replace function public.duel_forfeit(p_duel_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid   uuid := auth.uid();
  v_duel  public.duels%rowtype;
  v_other uuid;
begin
  if v_uid is null then
    return jsonb_build_object('error', 'not_authenticated');
  end if;

  select * into v_duel from public.duels
  where id = p_duel_id and v_uid in (challenger_id, opponent_id)
  for update;

  if v_duel.id is null then
    return jsonb_build_object('error', 'no_such_duel');
  end if;

  v_other := case when v_duel.challenger_id = v_uid then v_duel.opponent_id
                  else v_duel.challenger_id end;

  -- Never played, so nothing to record either way.
  if v_duel.status = 'pending' then
    update public.duels set status = 'declined', finished_at = now()
    where id = v_duel.id;
    return jsonb_build_object('status', 'withdrawn');
  end if;

  if v_duel.status <> 'active' then
    return jsonb_build_object('error', 'no_such_duel');
  end if;

  update public.duels set
    status = 'complete',
    winner_id = v_other,
    finished_at = now()
  where id = v_duel.id;

  return jsonb_build_object('status', 'forfeited');
end;
$$;

revoke execute on function public.duel_forfeit(uuid) from public, anon;
grant execute on function public.duel_forfeit(uuid) to authenticated;

-- The belt could never actually change hands.
--
-- The belt lives in a one-row table, so the update that moves it had no WHERE
-- clause - there is only one row, and naming it felt like ceremony. Supabase
-- runs the API role with sql_safe_updates on, which rejects an unqualified
-- UPDATE outright: "UPDATE requires a WHERE clause".
--
-- That error came out of apply_ranked_result, which runs inside the guess that
-- finishes a match, so the whole guess was rolled back. The visible symptom was
-- not a missing belt - it was that the last guess of a ranked match failed and
-- the duel stayed open forever, with no rating awarded to anyone.
--
-- Found by playing a match end to end through the API rather than reading the
-- code, which is the only way this one shows up: every round before the last
-- works perfectly.

create or replace function public.apply_ranked_result(p_duel_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_duel   public.duels%rowtype;
  a        public.ranked_stats%rowtype;
  b        public.ranked_stats%rowtype;
  a_score  numeric;
  a_delta  int;
  b_delta  int;
  v_holder uuid;
  v_loser  uuid;
begin
  select * into v_duel from public.duels where id = p_duel_id;
  if v_duel.id is null or not v_duel.ranked or v_duel.status <> 'complete' then
    return;
  end if;

  a := public.ensure_ranked_stats(v_duel.challenger_id);
  b := public.ensure_ranked_stats(v_duel.opponent_id);

  a_score := case when v_duel.winner_id is null then 0.5
                  when v_duel.winner_id = v_duel.challenger_id then 1.0
                  else 0.0 end;

  a_delta := public.elo_delta(a.rating, b.rating, a_score, a.played);
  b_delta := public.elo_delta(b.rating, a.rating, 1.0 - a_score, b.played);

  update public.ranked_stats set
    rating = greatest(100, rating + a_delta),
    played = played + 1,
    won   = won   + (case when a_score = 1.0 then 1 else 0 end),
    lost  = lost  + (case when a_score = 0.0 then 1 else 0 end),
    drawn = drawn + (case when a_score = 0.5 then 1 else 0 end),
    updated_at = now()
  where user_id = v_duel.challenger_id;

  update public.ranked_stats set
    rating = greatest(100, rating + b_delta),
    played = played + 1,
    won   = won   + (case when a_score = 0.0 then 1 else 0 end),
    lost  = lost  + (case when a_score = 1.0 then 1 else 0 end),
    drawn = drawn + (case when a_score = 0.5 then 1 else 0 end),
    updated_at = now()
  where user_id = v_duel.opponent_id;

  -- A draw settles nothing, so the belt does not move on one.
  if v_duel.winner_id is null then return; end if;

  v_loser  := case when v_duel.winner_id = v_duel.challenger_id
                   then v_duel.opponent_id else v_duel.challenger_id end;
  v_holder := public.belt_holder();

  -- Taken from the holder, or claimed while it is going spare.
  if v_holder is null or v_holder = v_loser then
    update public.belt set
      holder_id = v_duel.winner_id,
      since = now(),
      taken_from = case when v_holder = v_loser then v_loser end
    where only_row;
  end if;
end;
$$;

revoke execute on function public.apply_ranked_result(uuid) from public, anon, authenticated;

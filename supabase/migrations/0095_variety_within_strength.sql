-- Pick from everything that fits, not the single closest fit.
--
-- Choosing the clue nearest the target share is choosing the same clue: "its
-- digits add up to an odd number" leaves almost exactly half the field for
-- almost every number, so it won eight levels running. Strength is a band, not
-- a point - anything within a dozen percent of the target is equally good - and
-- which of them gets used is decided by the number, so a level always shows the
-- same clue while the level after it rarely shows the same kind.
--
-- And Impossible now asks for what the tier is worth, and never twice in a row
-- from the same family.

create or replace function public.clue_at_strength(
  p_answer integer,
  p_lo integer,
  p_hi integer,
  p_target numeric default 0.5,
  p_avoid_family text default null
)
returns text[]
language plpgsql
volatile
as $$
declare
  lo    int := greatest(1, coalesce(p_lo, 1));
  hi    int := least(1000, coalesce(p_hi, 1000));
  span  int;
  hits  int;
  share numeric;
  fits  text[] := array[]::text[];
  near  text[] := array[]::text[];
  code  text;
  pick  text;
begin
  span := greatest(1, hi - lo + 1);

  for code in select c from public.clue_codes() c loop
    if public.clue_holds(p_answer, code)
       and (p_avoid_family is null or public.clue_family(code) <> p_avoid_family) then
      select count(*) into hits from generate_series(lo, hi) g where public.clue_holds(g, code);
      share := hits::numeric / span;

      -- Never everything and never nothing: one is a sentence, the other is the
      -- answer.
      if share > 0.05 and share < 0.95 then
        -- Close enough to the strength asked for.
        if abs(share - p_target) <= 0.12 then
          fits := fits || code;
        -- And a wider net, in case nothing lands in the band.
        elsif abs(share - p_target) <= 0.3 then
          near := near || code;
        end if;
      end if;
    end if;
  end loop;

  if array_length(fits, 1) is null then fits := near; end if;

  if array_length(fits, 1) is null then
    if p_avoid_family is not null then
      return public.clue_at_strength(p_answer, lo, hi, p_target, null);
    end if;
    return array['It is between 1 and 1000.', 'shape'];
  end if;

  -- Stable for a number and a window, different for the next one along.
  pick := fits[1 + (abs(hashtext('within-clue:' || p_answer || ':' || lo || ':' || hi))
                    % array_length(fits, 1))];

  return array[public.clue_text(pick), public.clue_family(pick)];
end;
$$;

/**
 * The climb's state, with a clue worth what the tier is worth.
 *
 * The clue is chosen against the window the player has actually narrowed to,
 * at the strength the tier calls for, and never from the family the last level
 * used - so the kind of thinking changes as you go down even when the numbers
 * do not.
 */
create or replace function public.endless_state()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid  uuid := auth.uid();
  v_week date;
  v_run  public.endless_runs%rowtype;
  v_show boolean;
  v_clue text;
  v_win  int[];
  v_pick text[];
begin
  if v_uid is null then
    return jsonb_build_object('error', 'not_authenticated');
  end if;

  v_week := public.endless_week(v_uid);
  v_run  := public.endless_climb(v_uid);

  v_show := (public.endless_attempts(v_run.level) - v_run.attempts_used)
            <= public.endless_clue_at(v_run.level);

  if v_show and v_run.lives > 0 then
    if v_run.clue_level is distinct from v_run.level then
      v_win := public.endless_window(v_run.id, v_run.level);
      v_pick := public.clue_at_strength(
        public.endless_number(v_week, v_run.level),
        v_win[1], v_win[2],
        public.endless_clue_target(v_run.level),
        v_run.clue_family
      );

      update public.endless_runs set
        clue1 = v_pick[1],
        clue_family = v_pick[2],
        clue_level = v_run.level
      where id = v_run.id
      returning * into v_run;
    end if;
    v_clue := v_run.clue1;
  end if;

  return jsonb_build_object(
    'week', v_week,
    'level', v_run.level,
    'lives', v_run.lives,
    'sessionsLeft', public.endless_sessions_left(v_uid),
    'inSession', v_run.lives > 0 and v_run.session_date = public.current_puzzle_date(v_uid),
    'attemptsUsed', v_run.attempts_used,
    'attemptsAllowed', public.endless_attempts(v_run.level),
    'clue1', v_clue,
    'guesses', coalesce((
      select jsonb_agg(jsonb_build_object(
               'guess', g.guess, 'direction', g.direction, 'tier', g.tier,
               'isCorrect', g.direction = 'correct',
               'isWithin10', abs(g.guess - public.endless_number(v_week, v_run.level)) <= 10
                             and g.direction <> 'correct',
               'isOneAway', abs(g.guess - public.endless_number(v_week, v_run.level)) = 1
             ) order by g.guess_index)
      from public.endless_guesses g
      where g.run_id = v_run.id and g.level = v_run.level
    ), '[]'::jsonb),
    'best', greatest(0, v_run.best_level - 1)
  );
end;
$$;

/**
 * Both sides of a duel get a clue of the same strength.
 *
 * Copied from 0045 with one line changed - pick_clue1 becomes duel_clue - so
 * the locking, the error codes and the moment the round opens are exactly as
 * they were. Reconstructing a working function from memory is how the last two
 * bugs got in.
 */
create or replace function public.duel_set_number(p_duel_id uuid, p_number integer)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid   uuid := auth.uid();
  v_duel  public.duels%rowtype;
  v_other uuid;
  v_round int;
begin
  if v_uid is null then
    return jsonb_build_object('error', 'not_authenticated');
  end if;
  if p_number is null or p_number < 1 or p_number > 1000 then
    return jsonb_build_object('error', 'out_of_range');
  end if;

  select * into v_duel from public.duels
  where id = p_duel_id and v_uid in (challenger_id, opponent_id)
  for update;

  if v_duel.id is null or v_duel.status <> 'active' then
    return jsonb_build_object('error', 'no_such_duel');
  end if;

  v_other := case when v_duel.challenger_id = v_uid then v_duel.opponent_id
                  else v_duel.challenger_id end;

  v_round := public.duel_pick_round(p_duel_id, v_uid);
  if v_round is null then
    return jsonb_build_object('error', 'not_picking');
  end if;

  if exists (select 1 from public.duel_numbers
             where duel_id = p_duel_id and round = v_round and set_by = v_uid) then
    return jsonb_build_object('error', 'already_set');
  end if;

  insert into public.duel_numbers (duel_id, round, for_user, set_by, answer, clue1)
  values (p_duel_id, v_round, v_other, v_uid, p_number, public.duel_clue(p_number));

  -- Both in: the round opens for both at the same moment.
  if (select count(*) from public.duel_numbers
      where duel_id = p_duel_id and round = v_round) = 2 then
    insert into public.duel_progress (duel_id, user_id, round, attempts_allowed)
    values (p_duel_id, v_duel.challenger_id, v_round, public.duel_attempts(v_round)),
           (p_duel_id, v_duel.opponent_id,   v_round, public.duel_attempts(v_round))
    on conflict do nothing;
  end if;

  return jsonb_build_object(
    'ok', true,
    'round', v_round,
    'waitingForThem', (select count(*) from public.duel_numbers
                       where duel_id = p_duel_id and round = v_round) < 2
  );
end;
$$;

revoke execute on function public.clue_at_strength(integer,integer,integer,numeric,text) from public, anon, authenticated;
revoke execute on function public.endless_state()                    from public, anon;
revoke execute on function public.duel_set_number(uuid, integer)     from public, anon;
grant execute on function public.endless_state()                to authenticated;
grant execute on function public.duel_set_number(uuid, integer) to authenticated;

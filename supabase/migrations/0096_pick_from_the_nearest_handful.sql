-- Pick from the ten nearest, not from a fixed band.
--
-- A band around the target assumes clues are spread evenly across strengths,
-- and they are not: over the whole of 1 to 1000 almost nothing leaves half the
-- field standing except odd-or-even sums and first-against-last, so a band
-- around 0.55 admitted three clues and alternated them. Widening it would let
-- weak clues in on a narrow window and strong ones in on a wide one - the band
-- is the wrong instrument.
--
-- Ranked instead: every clue that holds is sorted by how close it lands to the
-- strength asked for, and one of the ten nearest is chosen by the number
-- itself. The strength stays honest because the ranking is against the target,
-- and the variety comes for free because ten candidates is ten candidates
-- whatever the distribution looks like.

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
  lo   int := greatest(1, coalesce(p_lo, 1));
  hi   int := least(1000, coalesce(p_hi, 1000));
  span int;
  pick text;
begin
  span := greatest(1, hi - lo + 1);

  with holds as (
    select c.code,
           (select count(*) from generate_series(lo, hi) g
             where public.clue_holds(g, c.code))::numeric / span as share
    from (select public.clue_codes() as code) c
    where public.clue_holds(p_answer, c.code)
      and (p_avoid_family is null or public.clue_family(c.code) <> p_avoid_family)
  ),
  usable as (
    -- Never everything and never nothing: one is a sentence, the other is the
    -- answer handed over.
    select code, share from holds where share > 0.05 and share < 0.95
    order by abs(share - p_target)
    limit 10
  ),
  numbered as (
    select code, row_number() over (order by abs(share - p_target), code) - 1 as i,
           count(*) over () as n
    from usable
  )
  select code into pick from numbered
  where i = abs(hashtext('within-clue:' || p_answer || ':' || lo || ':' || hi || ':' || p_target))
        % greatest(1, (select max(n) from numbered));

  if pick is null and p_avoid_family is not null then
    return public.clue_at_strength(p_answer, lo, hi, p_target, null);
  end if;

  if pick is null then
    return array['It is between 1 and 1000.', 'shape'];
  end if;

  return array[public.clue_text(pick), public.clue_family(pick)];
end;
$$;

revoke execute on function public.clue_at_strength(integer,integer,integer,numeric,text)
  from public, anon, authenticated;


-- And a ceiling on the attempts a round can be given.
--
--   new row for relation "games" violates check constraint
--   "games_attempts_allowed_check"
--
-- games.attempts_allowed is checked between 3 and 7. attempts_for_round guards
-- the floor with greatest(3, ...) and nothing guards the top, so a day whose
-- modifier adds an attempt asks for 8 and the update that opens the next round
-- is refused - stranding the player mid-day, on the mode that matters most,
-- with a guess that will never be accepted however many times they try it.
--
-- Clamped at the source rather than by widening the constraint: the constraint
-- is right, and 8 attempts was never a thing this game meant to hand out.

create or replace function public.attempts_for_round(p_round integer, p_date date)
returns smallint
language sql
stable
as $$
  with spec as (select public.modifier_spec(public.day_modifier(p_date)) as s)
  select least(7, greatest(3, coalesce(
    (select (s->>'flat')::int from spec),
    (case p_round when 1 then 7 when 2 then 6 else 5 end)
      + coalesce((select (s->>'att')::int from spec), 0)
  )))::smallint;
$$;

revoke execute on function public.attempts_for_round(integer, date) from public, anon;

-- Anyone already sitting on an impossible number is put back inside it.
update public.games set attempts_allowed = 7 where attempts_allowed > 7;
update public.games set attempts_allowed = 3 where attempts_allowed < 3;

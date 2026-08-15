-- Hundreds of clues, tiered by strength, and never the same kind twice running.
--
-- Codes are patterns rather than a case per sentence - sum:14, has:7, max:6,
-- gap:4 - so a few dozen lines generate several hundred distinct clues, and
-- adding a family adds a hundred more without touching anything else.
--
-- Four families, and no level ever follows the last one with its own kind:
--
--   arithmetic  what the digits add or multiply to
--   digits      which digits are present or absent
--   shape       how they run: climbing, mirrored, repeated
--   position    where a particular digit sits
--
-- Strength is chosen rather than accepted. Every clue is measurable - the share
-- of the remaining window it leaves standing - so a clue can be picked to leave
-- half the field or a fifth of it. Impossible asks for less and less as the
-- tiers take attempts away, and a duel asks for the same share on both sides,
-- because two players hunting different numbers with clues of different
-- strength are not playing the same game.

alter table public.endless_runs add column if not exists clue_family text;

/** Which family a code belongs to, from its prefix. */
create or replace function public.clue_family(p_code text)
returns text
language sql
immutable
as $$
  select case
    when p_code like 'sum:%' or p_code like 'prod:%' or p_code like 'gap:%'
      or p_code in ('sumodd','sumeven','onemakesother','square','triangle') then 'arithmetic'
    when p_code like 'has:%' or p_code like 'no:%' or p_code like 'max:%' or p_code like 'min:%'
      or p_code in ('alldiff','twinned','allodd','alleven','allsmall','allbig') then 'digits'
    when p_code like 'start:%' or p_code like 'end:%' or p_code like 'sec:%'
      or p_code like 'len:%' or p_code in ('bookends','midzero') then 'position'
    else 'shape'
  end;
$$;

create or replace function public.clue_holds(n integer, p_code text)
returns boolean
language plpgsql
immutable
as $$
declare
  d    integer[] := public.digits_of(n);
  len  integer   := array_length(d, 1);
  s    integer   := public.digit_sum(n);
  p    integer   := 1;
  arg  integer;
  kind text;
begin
  for i in 1 .. len loop p := p * d[i]; end loop;

  if position(':' in p_code) > 0 then
    kind := split_part(p_code, ':', 1);
    arg  := split_part(p_code, ':', 2)::int;

    return case kind
      when 'sum'   then s = arg
      when 'prod'  then p = arg
      when 'has'   then arg = any(d)
      when 'no'    then not (arg = any(d))
      when 'max'   then (select max(x) from unnest(d) x) = arg
      when 'min'   then (select min(x) from unnest(d) x) = arg
      when 'gap'   then abs(d[1] - d[len]) = arg
      when 'start' then d[1] = arg
      when 'end'   then d[len] = arg
      when 'sec'   then len > 1 and d[2] = arg
      when 'len'   then len = arg
      else false
    end;
  end if;

  return case p_code
    when 'climbing' then len > 1 and (
      select bool_and(d[i] < d[i + 1]) from generate_series(1, len - 1) i)
    when 'falling' then len > 1 and (
      select bool_and(d[i] > d[i + 1]) from generate_series(1, len - 1) i)
    when 'running' then len = 3 and d[2] = d[1] + 1 and d[3] = d[2] + 1
    when 'mirror' then len > 1 and (
      select bool_and(d[i] = d[len + 1 - i]) from generate_series(1, len) i)
    when 'twinned' then len > 1 and (select count(distinct x) < len from unnest(d) x)
    when 'allsame' then len > 1 and (select count(distinct x) = 1 from unnest(d) x)
    when 'alldiff' then (select count(distinct x) = len from unnest(d) x)
    when 'bookends' then len > 1 and d[1] = d[len]
    when 'midzero'  then len = 3 and d[2] = 0
    when 'midbiggest'  then len = 3 and d[2] > d[1] and d[2] > d[3]
    when 'midsmallest' then len = 3 and d[2] < d[1] and d[2] < d[3]
    when 'midaverage'  then len = 3 and d[1] + d[3] = 2 * d[2]
    when 'startsbigger' then d[1] > d[len]
    when 'endsbigger'   then d[len] > d[1]
    when 'sumodd'  then s % 2 = 1
    when 'sumeven' then s % 2 = 0
    when 'allodd'  then (select bool_and(x % 2 = 1) from unnest(d) x)
    when 'alleven' then (select bool_and(x % 2 = 0) from unnest(d) x)
    when 'allsmall' then (select bool_and(x <= 4) from unnest(d) x)
    when 'allbig'   then (select bool_and(x >= 5) from unnest(d) x)
    when 'onemakesother' then len = 3 and (
      d[1] = d[2] + d[3] or d[2] = d[1] + d[3] or d[3] = d[1] + d[2])
    when 'square'   then exists (select 1 from generate_series(1, 31) i where i * i = n)
    when 'triangle' then exists (select 1 from generate_series(1, 44) i where i * (i + 1) / 2 = n)
    else false
  end;
end;
$$;

create or replace function public.clue_text(p_code text)
returns text
language plpgsql
immutable
as $$
declare
  kind text;
  arg  int;
  an   text;
begin
  if position(':' in p_code) > 0 then
    kind := split_part(p_code, ':', 1);
    arg  := split_part(p_code, ':', 2)::int;
    an   := case when arg = 8 then 'an ' else 'a ' end;

    return case kind
      when 'sum'   then format('Its digits add up to exactly %s.', arg)
      when 'prod'  then format('Multiply its digits together and you get %s.', arg)
      when 'has'   then format('There is %s%s in it somewhere.', an, arg)
      when 'no'    then format('There is no %s anywhere in it.', arg)
      when 'max'   then format('Its biggest digit is %s.', arg)
      when 'min'   then format('Its smallest digit is %s.', arg)
      when 'gap'   then case when arg = 0 then 'Its first and last digits are the same.'
                             else format('Its first and last digits are %s apart.', arg) end
      when 'start' then format('It starts with %s%s.', an, arg)
      when 'end'   then format('It ends in %s%s.', an, arg)
      when 'sec'   then format('Its second digit is %s%s.', an, arg)
      when 'len'   then case arg when 1 then 'It is a single digit.'
                                 when 2 then 'It has two digits.'
                                 when 3 then 'It has three digits.'
                                 else 'It has four digits.' end
      else 'It is between 1 and 1000.'
    end;
  end if;

  return case p_code
    when 'climbing' then 'Each digit is bigger than the one before it, like 245.'
    when 'falling'  then 'Each digit is smaller than the one before it, like 852.'
    when 'running'  then 'Its digits are three in a row, like 456.'
    when 'mirror'   then 'It reads the same backwards, like 262.'
    when 'twinned'  then 'Two of its digits are the same, like 447.'
    when 'allsame'  then 'Every digit is the same, like 555.'
    when 'alldiff'  then 'No digit appears twice.'
    when 'bookends' then 'It starts and ends on the same digit, like 727.'
    when 'midzero'  then 'Its middle digit is a 0.'
    when 'midbiggest'  then 'The middle digit is the biggest of the three, like 391.'
    when 'midsmallest' then 'The middle digit is the smallest of the three, like 715.'
    when 'midaverage'  then 'The middle digit is exactly halfway between the other two.'
    when 'startsbigger' then 'The first digit is bigger than the last digit.'
    when 'endsbigger'   then 'The last digit is bigger than the first digit.'
    when 'sumodd'  then 'Its digits add up to an odd number.'
    when 'sumeven' then 'Its digits add up to an even number.'
    when 'allodd'  then 'Every digit is odd.'
    when 'alleven' then 'Every digit is even.'
    when 'allsmall' then 'No digit is bigger than 4.'
    when 'allbig'   then 'No digit is smaller than 5.'
    when 'onemakesother' then 'Two of its digits add up to the third, like 246.'
    when 'square'   then 'It is a number times itself, like 144.'
    when 'triangle' then 'It is 1 + 2 + 3 + … added up to somewhere, like 210.'
    else 'It is between 1 and 1000.'
  end;
end;
$$;

/** Every code the catalogue knows: the patterns expanded, plus the fixed ones. */
create or replace function public.clue_codes()
returns setof text
language sql
immutable
as $$
  select 'sum:' || i from generate_series(1, 27) i
  union all select 'prod:' || i from generate_series(0, 81) i
  union all select 'has:' || i from generate_series(0, 9) i
  union all select 'no:' || i from generate_series(0, 9) i
  union all select 'max:' || i from generate_series(1, 9) i
  union all select 'min:' || i from generate_series(0, 9) i
  union all select 'gap:' || i from generate_series(0, 9) i
  union all select 'start:' || i from generate_series(1, 9) i
  union all select 'end:' || i from generate_series(0, 9) i
  union all select 'sec:' || i from generate_series(0, 9) i
  union all select 'len:' || i from generate_series(1, 4) i
  union all select unnest(array[
    'climbing','falling','running','mirror','twinned','allsame','alldiff',
    'bookends','midzero','midbiggest','midsmallest','midaverage',
    'startsbigger','endsbigger','sumodd','sumeven','allodd','alleven',
    'allsmall','allbig','onemakesother','square','triangle']);
$$;

/**
 * A clue of a chosen strength, from a family you have not just seen.
 *
 * p_target is the share of the window the clue should leave standing: 0.5 halves
 * it, 0.2 removes four fifths. The closest fit wins, ties broken by the number
 * itself so a level always shows the same clue.
 */
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
  best  text := null;
  best_gap numeric := 999;
  code  text;
begin
  span := greatest(1, hi - lo + 1);

  for code in select c from public.clue_codes() c loop
    if public.clue_holds(p_answer, code)
       and (p_avoid_family is null or public.clue_family(code) <> p_avoid_family) then
      select count(*) into hits from generate_series(lo, hi) g where public.clue_holds(g, code);
      share := hits::numeric / span;

      -- Never a clue that rules out everything or nothing: one is the answer,
      -- the other is a sentence.
      if share > 0.05 and share < 0.95 and abs(share - p_target) < best_gap then
        best_gap := abs(share - p_target);
        best := code;
      end if;
    end if;
  end loop;

  -- Nothing in the wanted family: take the best of any family rather than none.
  if best is null and p_avoid_family is not null then
    return public.clue_at_strength(p_answer, lo, hi, p_target, null);
  end if;

  if best is null then
    return array['It is between 1 and 1000.', 'shape'];
  end if;

  return array[public.clue_text(best), public.clue_family(best)];
end;
$$;

/** How much a tier gives back, as attempts are taken away. */
create or replace function public.endless_clue_target(p_level integer)
returns numeric
language sql
immutable
as $$
  select case
    when p_level <= 19 then 0.55   -- The Shallows: a nudge
    when p_level <= 39 then 0.42
    when p_level <= 79 then 0.30
    else 0.20                      -- The Edge: four fifths of the field gone
  end;
$$;

/** Every level shows its clue from the first attempt now. */
create or replace function public.endless_clue_at(p_level integer)
returns smallint
language sql
immutable
as $$ select 99::smallint $$;

create or replace function public.pick_clue1(p_answer integer)
returns text
language sql
volatile
as $$
  select (public.clue_at_strength(p_answer, 1, 1000, 0.5, null))[1];
$$;

/** Kept for the callers that still ask for a window-aware clue. */
create or replace function public.live_clue(p_answer integer, p_lo integer, p_hi integer)
returns text
language sql
volatile
as $$
  select (public.clue_at_strength(p_answer, p_lo, p_hi, 0.5, null))[1];
$$;

/**
 * Duels ask for the same strength on both sides.
 *
 * The two players hunt different numbers, so a clue picked for its own number
 * alone can hand one of them four fifths of the field and the other half of it.
 * Both are now chosen to leave the same share standing, which is the closest
 * thing to the same clue that two different numbers allow.
 */
create or replace function public.duel_clue(p_answer integer)
returns text
language sql
volatile
as $$
  select (public.clue_at_strength(p_answer, 1, 1000, 0.5, null))[1];
$$;

revoke execute on function public.clue_family(text)                              from public, anon, authenticated;
revoke execute on function public.clue_holds(integer, text)                      from public, anon, authenticated;
revoke execute on function public.clue_text(text)                                from public, anon, authenticated;
revoke execute on function public.clue_codes()                                   from public, anon, authenticated;
revoke execute on function public.clue_at_strength(integer,integer,integer,numeric,text) from public, anon, authenticated;
revoke execute on function public.endless_clue_target(integer)                   from public, anon, authenticated;
revoke execute on function public.duel_clue(integer)                             from public, anon, authenticated;

-- More kinds of clue, and a picker that stops choosing the same one.
--
-- Thirty-eight clue types existed and players kept seeing four of them. That is
-- not a vocabulary problem, it is the picker: live_clue took whichever clue came
-- closest to halving the window, which is deterministic, so the same handful won
-- every time. It picks at random from everything that halves the window well
-- enough now - seeded by the number and the window, so a level always gives the
-- same clue, but neighbouring levels rarely give the same kind.
--
-- And fourteen new kinds, most of them arithmetic rather than shape: digits that
-- add to something exact, digits that multiply, one digit that is the sum of the
-- other two, squares. A clue about what the digits *do* is a different thought
-- from a clue about what they look like, and the mode is short enough that the
-- second kind wears out fast.

create or replace function public.clue_holds(n integer, p_code text)
returns boolean
language plpgsql
immutable
as $$
declare
  d   integer[] := public.digits_of(n);
  len integer   := array_length(d, 1);
  s   integer   := public.digit_sum(n);
  p   integer;
  r   integer;
begin
  -- Product of the digits, for the clues that need it.
  p := 1;
  for i in 1 .. len loop p := p * d[i]; end loop;

  return case p_code
    when 'len1' then len = 1
    when 'len2' then len = 2
    when 'len3' then len = 3
    when 'len4' then len = 4

    when 'start1' then d[1] = 1
    when 'start2' then d[1] = 2
    when 'start3' then d[1] = 3
    when 'start4' then d[1] = 4
    when 'start5' then d[1] = 5
    when 'start6' then d[1] = 6
    when 'start7' then d[1] = 7
    when 'start8' then d[1] = 8
    when 'start9' then d[1] = 9

    when 'end0' then d[len] = 0
    when 'end1' then d[len] = 1
    when 'end2' then d[len] = 2
    when 'end3' then d[len] = 3
    when 'end4' then d[len] = 4
    when 'end5' then d[len] = 5
    when 'end6' then d[len] = 6
    when 'end7' then d[len] = 7
    when 'end8' then d[len] = 8
    when 'end9' then d[len] = 9

    when 'climbing' then len > 1 and (
      select bool_and(d[i] < d[i + 1]) from generate_series(1, len - 1) i)
    when 'falling' then len > 1 and (
      select bool_and(d[i] > d[i + 1]) from generate_series(1, len - 1) i)
    when 'mirror' then len > 1 and (
      select bool_and(d[i] = d[len + 1 - i]) from generate_series(1, len) i)
    when 'twinned' then len > 1 and (
      select count(distinct x) < len from unnest(d) x)
    when 'alldiff' then (select count(distinct x) = len from unnest(d) x)
    when 'haszero' then 0 = any(d)

    when 'endsbotheven' then d[1] % 2 = 0 and d[len] % 2 = 0
    when 'endsbothodd'  then d[1] % 2 = 1 and d[len] % 2 = 1
    when 'startsbigger' then d[1] > d[len]
    when 'endsbigger'   then d[len] > d[1]
    when 'bookends'     then len > 1 and d[1] = d[len]

    when 'midbiggest'  then len = 3 and d[2] > d[1] and d[2] > d[3]
    when 'midsmallest' then len = 3 and d[2] < d[1] and d[2] < d[3]

    when 'sumunder10' then s < 10
    when 'sumover20'  then s > 20

    -- New: what the digits do, rather than what they look like.
    when 'sum10' then s = 10
    when 'sum12' then s = 12
    when 'sum15' then s = 15
    when 'sum18' then s = 18
    when 'sumodd'  then s % 2 = 1
    when 'sumeven' then s % 2 = 0

    when 'prod0'     then p = 0
    when 'produnder10' then p > 0 and p < 10
    when 'prodover100' then p > 100

    -- One digit is the other two added together: 123, 246, 615.
    when 'onemakesother' then len = 3 and (
      d[1] = d[2] + d[3] or d[2] = d[1] + d[3] or d[3] = d[1] + d[2])

    when 'allodd'  then (select bool_and(x % 2 = 1) from unnest(d) x)
    when 'alleven' then (select bool_and(x % 2 = 0) from unnest(d) x)

    -- Nothing above five, or nothing below five: two different squeezes.
    when 'allsmall' then (select bool_and(x <= 4) from unnest(d) x)
    when 'allbig'   then (select bool_and(x >= 5) from unnest(d) x)

    when 'square' then (select exists (
      select 1 from generate_series(1, 31) i where i * i = n))

    else false
  end;
end;
$$;

create or replace function public.clue_text(p_code text)
returns text
language sql
immutable
as $$
  select case p_code
    when 'len1' then 'It is a single digit.'
    when 'len2' then 'It has two digits.'
    when 'len3' then 'It has three digits.'
    when 'len4' then 'It has four digits.'

    when 'start1' then 'It starts with a 1.'
    when 'start2' then 'It starts with a 2.'
    when 'start3' then 'It starts with a 3.'
    when 'start4' then 'It starts with a 4.'
    when 'start5' then 'It starts with a 5.'
    when 'start6' then 'It starts with a 6.'
    when 'start7' then 'It starts with a 7.'
    when 'start8' then 'It starts with an 8.'
    when 'start9' then 'It starts with a 9.'

    when 'end0' then 'It ends in a 0.'
    when 'end1' then 'It ends in a 1.'
    when 'end2' then 'It ends in a 2.'
    when 'end3' then 'It ends in a 3.'
    when 'end4' then 'It ends in a 4.'
    when 'end5' then 'It ends in a 5.'
    when 'end6' then 'It ends in a 6.'
    when 'end7' then 'It ends in a 7.'
    when 'end8' then 'It ends in an 8.'
    when 'end9' then 'It ends in a 9.'

    when 'climbing'  then 'Each digit is bigger than the one before it, like 245.'
    when 'falling'   then 'Each digit is smaller than the one before it, like 852.'
    when 'mirror'    then 'It reads the same backwards, like 262.'
    when 'twinned'   then 'Two of its digits are the same, like 447.'
    when 'alldiff'   then 'No digit appears twice.'
    when 'haszero'   then 'There is a 0 in it.'

    when 'endsbotheven' then 'The first digit and the last digit are both even.'
    when 'endsbothodd'  then 'The first digit and the last digit are both odd.'
    when 'startsbigger' then 'The first digit is bigger than the last digit.'
    when 'endsbigger'   then 'The last digit is bigger than the first digit.'
    when 'bookends'     then 'It starts and ends on the same digit, like 727.'

    when 'midbiggest'  then 'The middle digit is the biggest of the three, like 391.'
    when 'midsmallest' then 'The middle digit is the smallest of the three, like 715.'

    when 'sumunder10' then 'Its digits add up to less than 10.'
    when 'sumover20'  then 'Its digits add up to more than 20.'

    when 'sum10' then 'Its digits add up to exactly 10.'
    when 'sum12' then 'Its digits add up to exactly 12.'
    when 'sum15' then 'Its digits add up to exactly 15.'
    when 'sum18' then 'Its digits add up to exactly 18.'
    when 'sumodd'  then 'Its digits add up to an odd number.'
    when 'sumeven' then 'Its digits add up to an even number.'

    when 'prod0'       then 'Multiply its digits together and you get 0.'
    when 'produnder10' then 'Multiply its digits together and you get less than 10.'
    when 'prodover100' then 'Multiply its digits together and you get more than 100.'

    when 'onemakesother' then 'Two of its digits add up to the third, like 246.'

    when 'allodd'  then 'Every digit is odd.'
    when 'alleven' then 'Every digit is even.'

    when 'allsmall' then 'No digit is bigger than 4.'
    when 'allbig'   then 'No digit is smaller than 5.'

    when 'square' then 'It is a number times itself, like 144.'

    else 'It is between 1 and 1000.'
  end;
$$;

insert into public.clue_coverage (code)
select c from unnest(array[
  'sum10','sum12','sum15','sum18','sumodd','sumeven',
  'prod0','produnder10','prodover100','onemakesother',
  'allodd','alleven','allsmall','allbig','square'
]) c
on conflict (code) do nothing;

/**
 * A clue for the window the player is in, chosen from everything that fits.
 *
 * It used to take the single clue closest to halving the window, which is the
 * best clue and also the same clue - so four of them did all the work and
 * players noticed within a day. Every clue that removes between a fifth and
 * four fifths of what is left is a good clue; which of them gets used is now
 * decided by the number and the window rather than by rank, so a level always
 * shows the same clue and neighbouring levels rarely share a kind.
 */
create or replace function public.live_clue(p_answer integer, p_lo integer, p_hi integer)
returns text
language plpgsql
volatile
as $$
declare
  span  int := greatest(1, coalesce(p_hi, 1000) - coalesce(p_lo, 1) + 1);
  lo    int := coalesce(p_lo, 1);
  hi    int := coalesce(p_hi, 1000);
  hits  int;
  share numeric;
  fits  text[] := array[]::text[];
  c     record;
begin
  for c in select code from public.clue_coverage order by code loop
    if public.clue_holds(p_answer, c.code) then
      select count(*) into hits from generate_series(lo, hi) g
      where public.clue_holds(g, c.code);

      share := hits::numeric / span;
      if share between 0.2 and 0.8 then
        fits := fits || c.code;
      end if;
    end if;
  end loop;

  if array_length(fits, 1) is null then
    return public.pick_clue1(p_answer);
  end if;

  -- Stable for a given number and window, different for the next one along.
  return public.clue_text(
    fits[1 + (abs(hashtext('within-clue:' || p_answer || ':' || lo || ':' || hi))
              % array_length(fits, 1))]
  );
end;
$$;

revoke execute on function public.clue_holds(integer, text)            from public, anon, authenticated;
revoke execute on function public.clue_text(text)                      from public, anon, authenticated;
revoke execute on function public.live_clue(integer, integer, integer)  from public, anon, authenticated;

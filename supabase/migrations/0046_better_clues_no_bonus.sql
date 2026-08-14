-- One clue, and one worth reading.
--
-- The bonus clue is gone from the daily too. It arrived at WITHIN 10, which is
-- the moment a round is already won or nearly so, and its job was to rescue a
-- guess that rarely needed rescuing. One clue per round is a cleaner promise.
--
-- The clues themselves were arithmetic homework. "The number is even" halves a
-- thousand numbers and tells you nothing you can picture; "divisible by 3" asks
-- for mental long division before the guessing even starts, and most people
-- will not do it. Both are gone, along with every other divisibility test.
--
-- What replaces them are facts about the shape of the number - what it starts
-- with, ends with, whether its digits climb or fall, whether it reads the same
-- backwards. You can hold one of those in your head while you guess, which is
-- the whole point of a clue.
--
-- Each candidate is measured before it is offered: a clue true of 900 numbers
-- says nothing, and one true of 30 hands the round over. Only clues landing
-- between those extremes are kept, so the wording changes but the difficulty
-- does not drift.

alter table public.puzzle_round_secrets alter column clue2 drop not null;
update public.puzzle_round_secrets set clue2 = null where clue2 is not null;

-- Kept, returning nothing, because older definer functions still call it when
-- they write a puzzle row. Dropping it would mean rewriting all of them to
-- prove a point the null already makes.
create or replace function public.pick_clue2(n integer)
returns text
language sql
immutable
as $$
  select null::text;
$$;

/**
 * Does n have the property named by p_code?
 *
 * Every clue is one of these, so the sentence a player reads and the test that
 * chose it can never disagree - which is how a clue ends up technically true
 * and quietly wrong.
 */
create or replace function public.clue_holds(n integer, p_code text)
returns boolean
language plpgsql
immutable
as $$
declare
  d   integer[] := public.digits_of(n);
  len integer   := array_length(d, 1);
  s   integer   := public.digit_sum(n);
begin
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

    -- Shape.
    when 'climbing'  then len > 1 and not exists (
                            select 1 from generate_series(1, len - 1) i where d[i] >= d[i + 1])
    when 'falling'   then len > 1 and not exists (
                            select 1 from generate_series(1, len - 1) i where d[i] <= d[i + 1])
    when 'mirror'    then d = (select array_agg(x order by ord desc)
                               from unnest(d) with ordinality t(x, ord))
    when 'twinned'   then len <> (select count(distinct x) from unnest(d) x)
    when 'alldiff'   then len = (select count(distinct x) from unnest(d) x)
    when 'haszero'   then 0 = any(d)

    -- Ends against each other.
    when 'endsbotheven' then d[1] % 2 = 0 and d[len] % 2 = 0
    when 'endsbothodd'  then d[1] % 2 = 1 and d[len] % 2 = 1
    when 'startsbigger' then d[1] > d[len]
    when 'endsbigger'   then d[len] > d[1]
    when 'bookends'     then len > 1 and d[1] = d[len]

    -- The middle, which only exists for three digits.
    when 'midbiggest'  then len = 3 and d[2] > d[1] and d[2] > d[3]
    when 'midsmallest' then len = 3 and d[2] < d[1] and d[2] < d[3]

    when 'sumunder10' then s < 10
    when 'sumover20'  then s > 20

    else false
  end;
end;
$$;

/** The sentence for a clue code, written the way somebody would say it. */
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

    when 'climbing'  then 'Its digits climb as you read them.'
    when 'falling'   then 'Its digits fall as you read them.'
    when 'mirror'    then 'It reads the same backwards.'
    when 'twinned'   then 'Two of its digits are the same.'
    when 'alldiff'   then 'Every digit is different.'
    when 'haszero'   then 'There is a 0 in it.'

    when 'endsbotheven' then 'The first and last digits are both even.'
    when 'endsbothodd'  then 'The first and last digits are both odd.'
    when 'startsbigger' then 'It starts on a bigger digit than it ends on.'
    when 'endsbigger'   then 'It ends on a bigger digit than it starts on.'
    when 'bookends'     then 'It starts and ends on the same digit.'

    when 'midbiggest'  then 'Its middle digit is the biggest of the three.'
    when 'midsmallest' then 'Its middle digit is the smallest of the three.'

    when 'sumunder10' then 'Its digits add up to less than 10.'
    when 'sumover20'  then 'Its digits add up to more than 20.'
  end;
$$;

/**
 * A clue about n, chosen from the ones that are true and worth saying.
 *
 * A clue is only offered if it holds for between 80 and 550 of the thousand
 * numbers: below that it is close to naming the answer, above it barely narrows
 * anything. That range is what keeps a rewrite of the wording from quietly
 * making the game easier or harder.
 */
create or replace function public.pick_clue1(n integer)
returns text
language plpgsql
volatile
as $$
declare
  codes text[] := array[
    'len1','len2','len3','len4',
    'start1','start2','start3','start4','start5','start6','start7','start8','start9',
    'end0','end1','end2','end3','end4','end5','end6','end7','end8','end9',
    'climbing','falling','mirror','twinned','alldiff','haszero',
    'endsbotheven','endsbothodd','startsbigger','endsbigger','bookends',
    'midbiggest','midsmallest','sumunder10','sumover20'
  ];
  kept text[] := '{}';
  c    text;
  hits int;
begin
  foreach c in array codes loop
    if public.clue_holds(n, c) then
      select count(*) into hits from generate_series(1, 1000) g
      where public.clue_holds(g, c);

      if hits between 80 and 550 then
        kept := kept || c;
      end if;
    end if;
  end loop;

  -- Every number has three digits or fewer and either repeats a digit or does
  -- not, so this is close to unreachable. If it ever happens, say the length -
  -- always true, never a giveaway.
  if array_length(kept, 1) is null then
    return public.clue_text('len' || greatest(1, array_length(public.digits_of(n), 1)));
  end if;

  return public.clue_text(kept[1 + floor(random() * array_length(kept, 1))::int]);
end;
$$;

revoke execute on function public.clue_holds(integer, text) from public, anon, authenticated;
revoke execute on function public.clue_text(text)           from public, anon, authenticated;
revoke execute on function public.pick_clue1(integer)       from public, anon, authenticated;
revoke execute on function public.pick_clue2(integer)       from public, anon, authenticated;

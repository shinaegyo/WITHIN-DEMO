-- Clues you do not have to decode.
--
-- "Its digits climb as you read them" is a sentence that has to be worked out
-- before it can be used, which is the same failure as "divisible by 3" wearing
-- nicer clothes. A clue has one job: be usable at a glance.
--
-- The vague ones now state the rule plainly and show an example number, because
-- an example is understood faster than any phrasing of the rule. The example is
-- never the answer - it is a different number that happens to share the shape.

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
  end;
$$;

revoke execute on function public.clue_text(text) from public, anon, authenticated;

-- The wording is stored per day, so the schedule has to be written again.
update public.puzzle_rounds pr
set clue1 = public.pick_clue1(s.answer)
from public.puzzle_round_secrets s
where s.puzzle_date = pr.puzzle_date
  and s.round = pr.round
  and pr.puzzle_date >= current_date
  and pr.puzzle_date <= current_date + 366;

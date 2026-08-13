-- Exactly two twists a week, and five ordinary days.
--
-- The first version rolled a modifier per day, which averaged about two and a
-- half a week but had no guarantee: some weeks landed five twists, others none.
-- A week with no ordinary days has no baseline to be a twist against, and a
-- week with none at all is just the old game.
--
-- So the week is drawn first. Two distinct weekdays are chosen from the week's
-- own hash, and only those two days get a modifier; which modifier is then
-- drawn from the date. Both draws are deterministic, so every player in the
-- world still sees the same twist on the same day, and no schedule has to be
-- generated or stored.

create or replace function public.day_modifier(p_date date)
returns text
language sql
immutable
as $$
  with w as (
    -- Monday of the week containing p_date.
    select date_trunc('week', p_date::timestamp)::date as monday
  ),
  picks as (
    select
      abs(hashtext('within-week-a:' || monday::text)) % 7 as first_day,
      -- Offset 1..6 from the first, so the two can never collide and the pair
      -- is always exactly two days.
      (abs(hashtext('within-week-a:' || monday::text)) % 7
       + 1
       + abs(hashtext('within-week-b:' || monday::text)) % 6) % 7 as second_day
    from w
  )
  select case
    when (p_date - (select monday from w)) in (
           (select first_day from picks),
           (select second_day from picks)
         )
    then case abs(hashtext('within-modifier:' || p_date::text)) % 4
           when 0 then 'double'
           when 1 then 'no_bonus'
           when 2 then 'early_bonus'
           else        'generous'
         end
    else 'standard'
  end;
$$;

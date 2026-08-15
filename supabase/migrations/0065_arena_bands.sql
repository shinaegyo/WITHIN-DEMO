-- The allowance changes where the arena does.
--
-- The attempt ladder stepped at 10, 40 and 90 while the climb reads as four
-- stretches - the shallows, the depths, the dark, the edge. Lining them up
-- means the background changing and the allowance dropping are the same event,
-- so the change announces itself before anything says a word.

create or replace function public.endless_attempts(p_level integer)
returns smallint
language sql
immutable
as $$
  select (case
    when p_level <= 19 then 8
    when p_level <= 39 then 7
    when p_level <= 79 then 6
    else 5
  end)::smallint;
$$;

revoke execute on function public.endless_attempts(integer) from public, anon;

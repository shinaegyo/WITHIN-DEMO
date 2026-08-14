-- Give the new clues to the days that are already written.
--
-- The schedule is generated ten years ahead, so every future day is already
-- sitting in the table with a clue drawn by the old generator. Replacing the
-- function on its own changed nothing anybody would ever see: the first
-- arithmetic clue would have been served for another decade.
--
-- Today is left exactly as it is. People are part-way through it, and a clue
-- changing under someone mid-round is worse than one more day of "divisible by
-- 3". From tomorrow on, every clue is a new one.

-- How many of the thousand numbers each clue covers, worked out once.
--
-- pick_clue1 was counting this from scratch on every call - thirty-eight clues
-- against a thousand numbers - which is thirty-eight thousand evaluations to
-- produce one sentence. Tolerable when it ran three times a day; not when a
-- player sets a duel number and waits for it, and hopeless for rewriting ten
-- years of schedule in one statement.
create table if not exists public.clue_coverage (
  code text primary key,
  hits integer not null
);

alter table public.clue_coverage enable row level security;

truncate public.clue_coverage;

insert into public.clue_coverage (code, hits)
select c.code, (select count(*) from generate_series(1, 1000) g where public.clue_holds(g, c.code))
from unnest(array[
  'len1','len2','len3','len4',
  'start1','start2','start3','start4','start5','start6','start7','start8','start9',
  'end0','end1','end2','end3','end4','end5','end6','end7','end8','end9',
  'climbing','falling','mirror','twinned','alldiff','haszero',
  'endsbotheven','endsbothodd','startsbigger','endsbigger','bookends',
  'midbiggest','midsmallest','sumunder10','sumover20'
]) as c(code);

create or replace function public.pick_clue1(n integer)
returns text
language plpgsql
volatile
as $$
declare
  kept text[] := '{}';
  c    record;
begin
  -- Only clues that hold for this number and are worth saying: between 80 and
  -- 550 of the thousand. Below that names the answer, above it says nothing.
  for c in select code from public.clue_coverage where hits between 80 and 550 loop
    if public.clue_holds(n, c.code) then
      kept := kept || c.code;
    end if;
  end loop;

  -- Every number has at least four, so this is unreachable in practice. If the
  -- coverage table were ever empty it would matter, and a true sentence beats
  -- a null.
  if array_length(kept, 1) is null then
    return public.clue_text('len' || greatest(1, array_length(public.digits_of(n), 1)));
  end if;

  return public.clue_text(kept[1 + floor(random() * array_length(kept, 1))::int]);
end;
$$;

revoke execute on function public.pick_clue1(integer) from public, anon, authenticated;

-- The rewrite of the existing schedule is 0048, kept separate because it is the
-- only slow part and the only part worth retrying on its own.

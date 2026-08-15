-- URGENT: Impossible is timing out. This fixes it.
--
-- clue_at_strength walked every code in the catalogue and, for each, tested
-- every number in the window through a plpgsql function: two hundred codes by
-- up to a thousand numbers is two hundred thousand calls for one clue, which
-- runs past the statement timeout and takes the whole mode down with it.
--
-- The answer to "which numbers satisfy this clue" never changes, so it is
-- computed once and stored. Thirty thousand rows, indexed, and the question
-- becomes a counting query instead of a loop.

create table if not exists public.clue_members (
  code text     not null,
  n    smallint not null,
  primary key (code, n)
);

alter table public.clue_members enable row level security;

create index if not exists clue_members_code_n on public.clue_members (code, n);

truncate public.clue_members;

insert into public.clue_members (code, n)
select c.code, g.n::smallint
from (select public.clue_codes() as code) c
cross join generate_series(1, 1000) g(n)
where public.clue_holds(g.n, c.code);

/**
 * A clue of a chosen strength, counted rather than computed.
 *
 * Same rule as before - rank everything that holds by how close it lands to the
 * strength asked for, take one of the ten nearest, decided by the number so a
 * level always shows the same clue - but the shares come from a stored table,
 * so a clue costs a couple of index counts instead of two hundred thousand
 * function calls.
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
  lo   int := greatest(1, coalesce(p_lo, 1));
  hi   int := least(1000, coalesce(p_hi, 1000));
  span int;
  pick text;
begin
  span := greatest(1, hi - lo + 1);

  with mine as (
    select code from public.clue_members where n = p_answer
  ),
  scored as (
    select m.code,
           (select count(*) from public.clue_members cm
             where cm.code = m.code and cm.n between lo and hi)::numeric / span as share
    from mine m
    where p_avoid_family is null or public.clue_family(m.code) <> p_avoid_family
  ),
  usable as (
    select code, share from scored
    where share > 0.05 and share < 0.95
    order by abs(share - p_target), code
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

-- Three clues that cost the same, because they are worth the same.
--
-- 0134 docked "where" to a 12-point ladder against the other two on 16, on the
-- reasoning that a quarter of the range handed over is easier than a property
-- you have to think about. Nobody had measured it. Measured now, over every
-- answer in the range:
--
--   where     250 numbers left, every time
--   written   268 on average, 217 to 272
--   factors   288 on average - and only for 80% of answers
--
-- A 15% spread in what is left, against a 25% gap in what it pays. And the
-- contiguity argument does not survive either: round two gives direction on
-- every guess, so the search is a bisection of the candidate list whether that
-- list is a block or scattered - log2(250) against log2(288) is a sixth of one
-- guess. So the pay levels at 16.
--
-- THE REAL FAULT WAS COVERAGE. daily_clue_for picks a clue that holds for the
-- answer and whose share sits between 0.2 and 0.5, and of the eighteen factor
-- codes only four are ever in that band - div:3, div:4, semiprime, halfnot4.
-- Between them they describe 805 numbers in a thousand. For the other 195 the
-- fallback fired, which takes anything true with no share limit at all, so a
-- fifth of that category was not playing by the rule the other two follow.
--
-- Everything missed was an odd number that is not a semiprime: primes, 1, and
-- the likes of 125. Every factor clue names something a number HAS, and those
-- numbers have nothing in band to say about them. nofac10 names an absence -
-- "Nothing under ten divides it" - which is true of 227 in a thousand and of
-- every prime above seven. With it and div:5 added, coverage goes to 99.2% and
-- the expected share falls to 0.265, which is written's 0.268 to within a
-- rounding error.
--
-- Eight numbers still have nothing in band: 1, 7, 343, 539, 637, 833, 847, 931.
-- The fallback keeps them, which is what it is for - firing on 0.8% of answers
-- rather than 21%.

begin;

create or replace function public.daily_clue_holds(n integer, p_code text)
returns boolean
language plpgsql
stable
set search_path = public, pg_temp
as $$
declare
  k int;
begin
  if p_code like 'div:%' then
    return n % split_part(p_code, ':', 2)::int = 0;
  elsif p_code = 'square' then
    return exists (select 1 from generate_series(1, 31) i where i * i = n);
  elsif p_code = 'triangle' then
    return exists (select 1 from generate_series(1, 44) i where i * (i + 1) / 2 = n);
  elsif p_code = 'prime' then
    return n > 1 and not exists (select 1 from generate_series(2, floor(sqrt(n))::int) i where n % i = 0);
  elsif p_code = 'semiprime' then
    select i into k from generate_series(2, floor(sqrt(n))::int) i where n % i = 0 order by i limit 1;
    return k is not null
       and not exists (select 1 from generate_series(2, floor(sqrt(k))::int) j where k % j = 0)
       and not exists (select 1 from generate_series(2, floor(sqrt(n / k))::int) j where (n / k) % j = 0);
  elsif p_code = 'twiceprime' then
    return n % 2 = 0 and (n / 2) > 1
       and not exists (select 1 from generate_series(2, floor(sqrt(n / 2))::int) i where (n / 2) % i = 0);
  elsif p_code = 'halfnot4' then
    return n % 2 = 0 and n % 4 <> 0;
  elsif p_code = 'nofac10' then
    -- The one clue that speaks to the numbers nothing else could describe.
    -- Every other factor clue names something a number HAS, so an odd number
    -- that is not a semiprime had nothing true said about it in band. This
    -- names an absence instead, and 227 numbers in a thousand have it.
    return n > 1 and n % 2 <> 0 and n % 3 <> 0 and n % 5 <> 0 and n % 7 <> 0;
  end if;
  return public.clue_holds(n, p_code);
end;
$$;

create or replace function public.daily_clue_text(p_code text)
returns text
language sql
stable
set search_path = public, pg_temp
as $$
  select case
    when p_code like 'div:%' then format('It divides evenly by %s.', split_part(p_code, ':', 2))
    when p_code = 'square'     then 'It is a square number, like 144.'
    when p_code = 'triangle'   then 'It is 1 + 2 + 3 + … added up, like 210.'
    when p_code = 'prime'      then 'It is a prime number.'
    when p_code = 'semiprime'  then 'It is two prime numbers multiplied together.'
    when p_code = 'twiceprime' then 'Half of it is a prime number.'
    when p_code = 'halfnot4'   then 'It divides by 2 but not by 4.'
    when p_code = 'nofac10'    then 'Nothing under ten divides it.'
    else public.clue_text(p_code)
  end;
$$;

create or replace function public.daily_clue_for(p_answer integer, p_kind text)
returns text
language plpgsql
volatile
set search_path = public, pg_temp
as $$
declare
  v_codes text[];
  v_pick  text;
  v_lo    int;
begin
  if p_kind = 'where' then
    -- A quarter of the range, on a grid so it never centres on the answer.
    v_lo := ((p_answer - 1) / 250) * 250 + 1;
    return format('It is somewhere between %s and %s.', v_lo, v_lo + 249);
  end if;

  if p_kind = 'factors' then
    v_codes := array[
      'div:3', 'div:4', 'div:5', 'div:6', 'div:7', 'div:8', 'div:9', 'div:11', 'div:12', 'div:13',
      'square', 'triangle', 'prime', 'semiprime', 'twiceprime', 'halfnot4', 'nofac10',
      'end:1', 'end:9', 'end:5'
    ];
  else
    v_codes := array(select code from public.clue_codes() code
                     where code like 'sum:%' or code like 'has:%' or code like 'no:%'
                        or code like 'max:%' or code in ('twinned','alldiff','climbing','falling',
                                                         'mirror','bookends','midzero','allbig','allsmall'));
  end if;

  select c into v_pick
  from unnest(v_codes) c
  where public.daily_clue_holds(p_answer, c)
    and public.daily_clue_share(c) between 0.2 and 0.5
  order by random()
  limit 1;

  -- Nothing in the band held. Anything true beats a blank card.
  if v_pick is null then
    select c into v_pick from unnest(v_codes) c
    where public.daily_clue_holds(p_answer, c) order by random() limit 1;
  end if;

  if v_pick is null then
    return format('Its digits add up to exactly %s.', public.digit_sum(p_answer));
  end if;

  return public.daily_clue_text(v_pick);
end;
$$;

create or replace function public.daily_clue_pay(p_index integer, p_kind text default null)
returns integer
language sql
immutable
as $$
  select (array[16, 14, 12, 10, 8, 6])[least(greatest(coalesce(p_index, 1), 1), 6)];
$$;

revoke execute on function public.daily_clue_holds(integer, text) from public, anon, authenticated;
revoke execute on function public.daily_clue_text(text)           from public, anon, authenticated;
revoke execute on function public.daily_clue_for(integer, text)   from public, anon, authenticated;
grant  execute on function public.daily_clue_pay(integer, text)   to authenticated;

commit;

-- Coverage and strength, per category. factors should now read about 0.265
-- with near-total coverage, and all three should sit within a few points.
with codes as materialized (
  select 'factors' as kind, c as code
    from unnest(array['div:3','div:4','div:5','div:6','div:7','div:8','div:9','div:11','div:12',
                      'div:13','square','triangle','prime','semiprime','twiceprime','halfnot4',
                      'nofac10','end:1','end:9','end:5']) c
  union all
  select 'written', code
    from public.clue_codes() code
   where code like 'sum:%' or code like 'has:%' or code like 'no:%' or code like 'max:%'
      or code in ('twinned','alldiff','climbing','falling','mirror','bookends',
                  'midzero','allbig','allsmall')
),
band as materialized (
  select kind, code, public.daily_clue_share(code) as share
    from codes where public.daily_clue_share(code) between 0.2 and 0.5
),
elig as materialized (
  select b.kind, a.n, b.share
    from generate_series(1, 1000, 5) a(n)
    join band b on public.daily_clue_holds(a.n, b.code)
)
select kind, count(distinct n) as covered_of_200, round(avg(share), 3) as expected_share
  from elig group by kind
union all select 'where', 200, 0.250;

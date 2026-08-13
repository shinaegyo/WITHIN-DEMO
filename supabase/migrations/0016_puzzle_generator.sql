-- Generate puzzles inside the database.
--
-- Note on the casts below: `text_array || 'a literal'` is ambiguous in
-- PL/pgSQL. Postgres sees an array on the left and an untyped literal on the
-- right, assumes array-to-array concatenation, and fails trying to parse the
-- sentence as an array literal. Every appended literal is cast to text.
--
-- Until now the schedule was produced by a script and pasted in as SQL, which
-- capped the runway at whatever fitted in the editor and meant coming back to
-- extend it. This does the same job server-side, so a decade can be filled
-- with one short call and topped up later without regenerating anything.
--
-- Numbers are drawn at random and may repeat across days. They are drawn
-- without replacement within a day, because the same number twice in one day
-- would look broken rather than coincidental.

create or replace function public.digits_of(n integer)
returns integer[]
language sql
immutable
as $$
  select array(select (substring(n::text, i, 1))::integer
               from generate_series(1, length(n::text)) i);
$$;

create or replace function public.digit_sum(n integer)
returns integer
language sql
immutable
as $$
  select coalesce(sum(d), 0)::integer from unnest(public.digits_of(n)) d;
$$;

create or replace function public.is_prime(n integer)
returns boolean
language plpgsql
immutable
as $$
declare i integer;
begin
  if n < 2 then return false; end if;
  i := 2;
  while i * i <= n loop
    if n % i = 0 then return false; end if;
    i := i + 1;
  end loop;
  return true;
end;
$$;

/**
 * A broad opening clue — always true of n, and never so narrow that it does
 * most of the work on its own.
 */
create or replace function public.pick_clue1(n integer)
returns text
language plpgsql
volatile
as $$
declare
  opts text[] := '{}';
begin
  opts := opts || (case when n % 2 = 0 then 'The number is even.' else 'The number is odd.' end)::text;
  opts := opts || format('The number ends in %s.', n % 10)::text;
  if n % 3 = 0 then opts := opts || 'The number is divisible by 3.'::text; end if;
  if n % 5 = 0 then opts := opts || 'The number is divisible by 5.'::text; end if;
  if (select count(*) from unnest(public.digits_of(n)) d where d % 2 = 0) >= 2 then
    opts := opts || 'The number contains two even digits.'::text;
  end if;

  return opts[1 + floor(random() * array_length(opts, 1))::int];
end;
$$;

/**
 * The bonus clue, unlocked at WITHIN 10. Narrower, but each option is chosen
 * to still leave a workable set of candidates — digit sums outside the middle
 * of the range are excluded because they pin the answer down too far.
 */
create or replace function public.pick_clue2(n integer)
returns text
language plpgsql
volatile
as $$
declare
  opts text[] := '{}';
  ds   integer := public.digit_sum(n);
  dg   integer[] := public.digits_of(n);
begin
  opts := opts || format('The number contains the digit %s.', dg[1 + floor(random() * array_length(dg, 1))::int])::text;
  opts := opts || (case when n > 500 then 'The number is greater than 500.' else 'The number is less than 500.' end)::text;
  opts := opts || (case when ds % 2 = 0 then 'The digits add up to an even number.' else 'The digits add up to an odd number.' end)::text;

  if ds between 5 and 20 then opts := opts || format('The digits add up to %s.', ds)::text; end if;
  if n % 4  = 0 then opts := opts || 'The number is divisible by 4.'::text;  end if;
  if n % 6  = 0 then opts := opts || 'The number is divisible by 6.'::text;  end if;
  if n % 7  = 0 then opts := opts || 'The number is divisible by 7.'::text;  end if;
  if n % 9  = 0 then opts := opts || 'The number is divisible by 9.'::text;  end if;
  if n % 11 = 0 then opts := opts || 'The number is divisible by 11.'::text; end if;
  if array_length(dg, 1) <> (select count(distinct d) from unnest(dg) d) then
    opts := opts || 'The number contains a repeated digit.'::text;
  end if;
  if dg[1] > dg[array_length(dg, 1)] then
    opts := opts || 'The first digit is greater than the last digit.'::text;
  end if;
  if public.is_prime(n) then opts := opts || 'The number is prime.'::text;
  else                       opts := opts || 'The number is not prime.'::text; end if;

  return opts[1 + floor(random() * array_length(opts, 1))::int];
end;
$$;

/**
 * Fills the schedule from p_start for p_days days. Existing days are left
 * alone, so it is safe to re-run and safe to call repeatedly to top up.
 * Returns how many days it actually created.
 */
create or replace function public.generate_puzzle_days(p_start date, p_days integer)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  d       date;
  i       integer;
  r       integer;
  n       integer;
  picked  integer[];
  created integer := 0;
begin
  for i in 0 .. p_days - 1 loop
    d := p_start + i;

    continue when exists (select 1 from public.puzzle_rounds where puzzle_date = d);

    picked := '{}';
    for r in 1 .. 3 loop
      -- Redraw until the number is unused today, so one date never repeats.
      loop
        n := 1 + floor(random() * 1000)::int;
        exit when not (n = any(picked));
      end loop;
      picked := picked || n;

      insert into public.puzzle_rounds (puzzle_date, round, clue1)
      values (d, r, public.pick_clue1(n));

      insert into public.puzzle_round_secrets (puzzle_date, round, answer, clue2)
      values (d, r, n, public.pick_clue2(n));
    end loop;

    created := created + 1;
  end loop;

  return created;
end;
$$;

revoke execute on function public.generate_puzzle_days(date, integer) from public, anon, authenticated;

-- Fill ten years from the day after the current hand-generated schedule ends.
-- Re-running is harmless: days that already exist are skipped.
select public.generate_puzzle_days('2027-07-10', 3653);

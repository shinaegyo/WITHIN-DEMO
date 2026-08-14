-- Choose a bonus clue that is worth something when it arrives.
--
-- The clue was picked when the puzzle was generated, blind to what the player
-- would know by the time they saw it. But it unlocks at WITHIN 10, by which
-- point they have the answer inside a window of about twenty numbers - and a
-- clue like "less than 500" eliminates none of them. It reads as help and
-- delivers nothing.
--
-- Every candidate is now measured against that window: the numbers the player
-- could still be choosing between when the clue appears. A clue is kept only if
-- it rules out a real share of them and leaves more than one standing - useless
-- at one end, a giveaway at the other.

create or replace function public.pick_clue2(n integer)
returns text
language plpgsql
volatile
as $$
declare
  lo    int := greatest(1, n - 10);
  hi    int := least(1000, n + 10);
  total int := least(1000, n + 10) - greatest(1, n - 10) + 1;
  -- A clue must leave at least two candidates, and cut at least a third.
  cap   int := greatest(2, floor(total * 0.67)::int);
  opts  text[] := '{}';
  d     int;
  ds    int := public.digit_sum(n);
  c     int;
  k     int;
begin
  -- Which digit it contains: usually the sharpest of these inside a narrow
  -- window, because the tens digit rarely stays put across twenty numbers.
  foreach d in array public.digits_of(n) loop
    select count(*) into c from generate_series(lo, hi) g
    where position(d::text in g::text) > 0;
    if c >= 2 and c <= cap then
      opts := opts || format('The number contains the digit %s.', d)::text;
    end if;
  end loop;

  -- Digit sum, exactly. Strong, and inside a window it can still leave a few.
  if ds between 5 and 20 then
    select count(*) into c from generate_series(lo, hi) g where public.digit_sum(g) = ds;
    if c >= 2 and c <= cap then
      opts := opts || format('The digits add up to %s.', ds)::text;
    end if;
  end if;

  -- Digit sum parity: roughly halves the window, which is exactly the job.
  select count(*) into c from generate_series(lo, hi) g
  where public.digit_sum(g) % 2 = ds % 2;
  if c >= 2 and c <= cap then
    opts := opts || (case when ds % 2 = 0
                          then 'The digits add up to an even number.'
                          else 'The digits add up to an odd number.' end)::text;
  end if;

  -- Divisibility, only where it says something the window does not already.
  foreach k in array array[4, 6, 7, 9, 11] loop
    if n % k = 0 then
      select count(*) into c from generate_series(lo, hi) g where g % k = 0;
      if c >= 2 and c <= cap then
        opts := opts || format('The number is divisible by %s.', k)::text;
      end if;
    end if;
  end loop;

  -- A repeated digit.
  if array_length(public.digits_of(n), 1)
     <> (select count(distinct x) from unnest(public.digits_of(n)) x) then
    select count(*) into c from generate_series(lo, hi) g
    where array_length(public.digits_of(g), 1)
          <> (select count(distinct y) from unnest(public.digits_of(g)) y);
    if c >= 2 and c <= cap then
      opts := opts || 'The number contains a repeated digit.'::text;
    end if;
  end if;

  -- Prime or not.
  select count(*) into c from generate_series(lo, hi) g
  where public.is_prime(g) = public.is_prime(n);
  if c >= 2 and c <= cap then
    opts := opts || (case when public.is_prime(n)
                          then 'The number is prime.'
                          else 'The number is not prime.' end)::text;
  end if;

  -- First digit against last.
  select count(*) into c from generate_series(lo, hi) g
  where ((public.digits_of(g))[1] > (public.digits_of(g))[array_length(public.digits_of(g), 1)])
      = ((public.digits_of(n))[1] > (public.digits_of(n))[array_length(public.digits_of(n), 1)]);
  if c >= 2 and c <= cap then
    opts := opts || (case when (public.digits_of(n))[1]
                             > (public.digits_of(n))[array_length(public.digits_of(n), 1)]
                          then 'The first digit is greater than the last digit.'
                          else 'The last digit is greater than or equal to the first digit.' end)::text;
  end if;

  -- Nothing discriminated well enough. Fall back to the digit sum, which is
  -- always true and always says something, rather than to a clue that is true
  -- of the entire window.
  if array_length(opts, 1) is null then
    return format('The digits add up to %s.', ds);
  end if;

  return opts[1 + floor(random() * array_length(opts, 1))::int];
end;
$$;

revoke execute on function public.pick_clue2(integer) from public, anon, authenticated;

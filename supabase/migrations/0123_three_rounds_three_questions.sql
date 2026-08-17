-- The daily becomes three different questions.
--
-- RUN ORDER: deploy the client first, then this, then 0124, then 0127. It
-- changes what game_state returns and what submit_guess expects, and an app
-- built before the three-round client cannot read the answers - which is how
-- this got run early once, and made the daily unplayable until 0125 undid it.
-- The client that ships now reads a missing round kind as the old daily, so
-- deploying it ahead of this is safe in a way the reverse has never been.
--
-- Three rounds of the same search was the game's oldest compromise: one round
-- was over in seven seconds, so it became three, and three identical searches
-- is padding rather than depth. Binary search has one correct move at every
-- step, and asking for it three times a day is asking somebody to do arithmetic
-- they have already proved they can do.
--
-- So each round now asks something different:
--
--   1  COLD    Call how many guesses you need, then find it with no clue.
--   2  CLUE    A new number, six attempts, and a clue you choose the kind of.
--   3  BET     Three free guesses, then commit to a range it is inside.
--
-- Round three is Window, which has been the most original thing in the app and
-- the least played - third in a list behind a lock. Every player meets it every
-- day now, and the standalone mode goes.
--
-- Scoring, out of seventy:
--
--   Round 1   call 1..7 pays 30 20 18 16 14 12 10 · found late 5 · never 3
--   Round 2   16 14 12 10 8 6 by attempt · never 3
--   Round 3   exact 24, then 18 16 14 12 10 8 6 4 by width · outside 3
--
-- The call is the piece worth understanding. Calling seven is the whole
-- allowance for the smallest prize, so refusing to bet is itself a bet, and the
-- only route to thirty is saying out loud that one guess will do. It is not the
-- mathematically optimal play and never will be - a cold search finds the
-- number in three about six times in a hundred - which is the point: the bold
-- call is a story, not a strategy.

-- ---------------------------------------------------------------- schema

alter table public.round_results
  -- Round one only: how many guesses the player said they would need.
  add column if not exists called smallint check (called between 1 and 7),
  -- Round two only: which kind of clue they asked for, and the clue itself,
  -- kept so a reload cannot reroll it.
  add column if not exists clue_kind text check (clue_kind in ('digits', 'factors', 'where')),
  add column if not exists clue_text text,
  -- Round three only: the range they committed to.
  add column if not exists bet_lo smallint,
  add column if not exists bet_hi smallint;

/** What each round allows. Three is the probe count, not an attempt count. */
create or replace function public.daily_attempts(p_round integer)
returns smallint
language sql
immutable
as $$ select (case p_round when 1 then 7 when 2 then 6 else 3 end)::smallint $$;

/** The call ladder: bolder is worth more, and nobody has to be bold. */
create or replace function public.daily_call_pay(p_called integer)
returns smallint
language sql
immutable
as $$
  select (case p_called
    when 1 then 30 when 2 then 20 when 3 then 18 when 4 then 16
    when 5 then 14 when 6 then 12 else 10 end)::smallint;
$$;

/** Round two, by the attempt it was found on. */
create or replace function public.daily_clue_pay(p_attempt integer)
returns smallint
language sql
immutable
as $$
  select (case p_attempt
    when 1 then 16 when 2 then 14 when 3 then 12
    when 4 then 10 when 5 then 8 else 6 end)::smallint;
$$;

/**
 * Round three, by how wide the committed range is.
 *
 * Naming it exactly pays nearly double the next step down: it is the most
 * impressive thing anybody can do in this game and it should not pay the same
 * as being one out.
 */
create or replace function public.daily_bet_pay(p_width integer)
returns smallint
language sql
immutable
as $$
  select (case
    when p_width <= 1  then 24
    when p_width <= 3  then 18
    when p_width <= 7  then 16
    when p_width <= 11 then 14
    when p_width <= 17 then 12
    when p_width <= 25 then 10
    when p_width <= 37 then 8
    when p_width <= 51 then 6
    when p_width <= 71 then 4
    else 3
  end)::smallint;
$$;

/** Found it, but later than you called. */
create or replace function public.daily_late_pay() returns smallint
language sql immutable as $$ select 5::smallint $$;

-- ------------------------------------------------------------ the clue

/**
 * A clue of the kind the player asked for.
 *
 * Three kinds, and the trade between them is the decision: digits and factors
 * are scattered through the range and take working out, where-it-sits is
 * contiguous and easy to act on and tells you the least.
 *
 * Everything leaves between a fifth and a half of the field standing. Stronger
 * than that and the clue ends the round instead of shaping it; weaker and it is
 * a sentence you read and forget.
 */
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
      'div:3', 'div:4', 'div:6', 'div:7', 'div:8', 'div:9', 'div:11', 'div:12', 'div:13',
      'square', 'triangle', 'prime', 'semiprime', 'twiceprime', 'halfnot4', 'end:1', 'end:9', 'end:5'
    ];
  else
    v_codes := array(select code from unnest(public.clue_codes()) code
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

/** The factor codes the catalogue does not know, plus everything it does. */
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
  end if;
  return public.clue_holds(n, p_code);
end;
$$;

/** How much of 1..1000 a code leaves standing. */
create or replace function public.daily_clue_share(p_code text)
returns numeric
language sql
stable
set search_path = public, pg_temp
as $$
  select count(*)::numeric / 1000
  from generate_series(1, 1000) n
  where public.daily_clue_holds(n, p_code);
$$;

/** Plain words. The puzzle is the number, never the sentence. */
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
    else public.clue_text(p_code)
  end;
$$;

revoke execute on function public.daily_attempts(integer)          from public, anon, authenticated;
revoke execute on function public.daily_call_pay(integer)          from public, anon, authenticated;
revoke execute on function public.daily_clue_pay(integer)          from public, anon, authenticated;
revoke execute on function public.daily_bet_pay(integer)           from public, anon, authenticated;
revoke execute on function public.daily_late_pay()                 from public, anon, authenticated;
revoke execute on function public.daily_clue_for(integer, text)    from public, anon, authenticated;
revoke execute on function public.daily_clue_holds(integer, text)  from public, anon, authenticated;
revoke execute on function public.daily_clue_share(text)           from public, anon, authenticated;
revoke execute on function public.daily_clue_text(text)            from public, anon, authenticated;

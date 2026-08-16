-- Clues about the number, not about the numeral.
--
-- Everything in the catalogue so far is a fact about the digits: it ends in a
-- 2, its middle digit is a 0, its digits add to 14. That is a puzzle about how
-- the number is written, and after a few hundred levels it is the same puzzle
-- every time. None of them tell you anything about the quantity - that 809 is
-- roughly a year and a half of days, or about what a decent bicycle costs.
--
-- Three new families, all generated rather than written one per number:
--
--   money      About what 60 ice cream cones cost.
--   measure    About the minutes in 12 hours.
--   compare    More than the bones in your body, fewer than the days in a year.
--   landmark   A little more than the squares on a chessboard.
--
-- Two rules keep them honest.
--
-- A clue must never imply a point. "Just over the days in a year" for 403 is
-- not a clue, it is the answer with a hat on - so every code here covers a band
-- at least fifty wide, and clue_at_strength's existing floor (a clue must leave
-- more than 5% of the window standing) enforces the rest.
--
-- And the reading should get harder with altitude, not just the narrowing. A
-- landmark is recognised instantly; a price has to be worked out, and the
-- working is where the difficulty lives. So Ground and Sky get the friendly
-- families and Orbit gets arithmetic - see clue_families_for.

-- --------------------------------------------------------------- the pantry

/**
 * Things with a price, in dollars.
 *
 * `step` is what k counts in: a clue says "about 60 ice cream cones", never 57,
 * and rounding k to a multiple of the step is what makes the band wide enough
 * to be a clue rather than a giveaway. price * step is the width, and nothing
 * below 50 is worth having.
 */
create table if not exists public.clue_items (
  key    text primary key,
  price  integer not null,
  step   integer not null,
  plural text not null
);

insert into public.clue_items (key, price, step, plural) values
  ('coffee',     5,  12, 'coffees'),
  ('icecream',   4,  15, 'ice cream cones'),
  ('burrito',   12,   5, 'burritos'),
  ('pizza',     18,   4, 'large pizzas'),
  ('movie',     15,   5, 'movie tickets'),
  ('haircut',   30,   2, 'haircuts'),
  ('videogame', 60,   1, 'new video games'),
  ('tank',      50,   2, 'tanks of gas'),
  ('sneakers',  80,   1, 'pairs of sneakers'),
  ('textbook',  90,   1, 'college textbooks'),
  ('concert',  120,   1, 'concert tickets'),
  ('streaming', 16,   4, 'months of streaming'),
  ('oilchange', 60,   1, 'oil changes'),
  ('drone',    200,   1, 'starter drones'),
  ('flight',   350,   1, 'domestic flights')
on conflict (key) do update
  set price = excluded.price, step = excluded.step, plural = excluded.plural;

/** Things you can count, where the count is the interesting part. */
create table if not exists public.clue_measures (
  key      text primary key,
  size     integer not null,
  step     integer not null,
  template text not null            -- {k} is the count
);

insert into public.clue_measures (key, size, step, template) values
  ('minutes',  60,  2, 'About the number of minutes in {k} hours.'),
  ('days',     30,  2, 'About the number of days in {k} months.'),
  ('weeks',    52,  1, 'About the number of weeks in {k} years.'),
  ('cards',    52,  1, 'About the number of cards in {k} decks.'),
  ('yards',   100,  1, 'About the number of yards in {k} football fields.'),
  ('feet',     10,  6, 'About the height in feet of a {k}-story building.'),
  ('teeth',    32,  2, 'About the number of teeth in {k} mouths.'),
  ('keys',     88,  1, 'About the number of keys on {k} pianos.'),
  ('squares',  64,  1, 'About the number of squares on {k} chessboards.'),
  ('stars',    50,  2, 'About the number of stars on {k} American flags.')
on conflict (key) do update
  set size = excluded.size, step = excluded.step, template = excluded.template;

/**
 * Numbers people already carry around.
 *
 * `phrase` is written to stand alone in a sentence. The number is spelled out
 * only where the fact is not common knowledge - everybody knows a year has 365
 * days, and nobody should have to know that the House has 435 seats.
 */
create table if not exists public.clue_landmarks (
  value  integer primary key,
  phrase text not null
);

insert into public.clue_landmarks (value, phrase) values
  (12,  'the eggs in a dozen'),
  (24,  'the hours in a day'),
  (26,  'the letters in the alphabet'),
  (32,  'the teeth in your mouth'),
  (50,  'the states in the US'),
  (52,  'the cards in a deck'),
  (60,  'the minutes in an hour'),
  (64,  'the squares on a chessboard'),
  (88,  'the keys on a piano'),
  (100, 'the yards in a football field'),
  (118, 'the elements in the periodic table (118)'),
  (162, 'the games in a baseball season (162)'),
  (180, 'the degrees in a half turn'),
  (195, 'the countries in the world (195)'),
  (206, 'the bones in your body (206)'),
  (212, 'the temperature water boils at in Fahrenheit'),
  (270, 'the electoral votes it takes to win (270)'),
  (300, 'a perfect game of bowling'),
  (360, 'the degrees in a circle'),
  (365, 'the days in a year'),
  (435, 'the seats in the House (435)'),
  (451, 'the Fahrenheit in the Bradbury title'),
  (500, 'the companies on the Fortune 500 list'),
  (538, 'the electoral votes in total (538)'),
  (600, 'the seconds in ten minutes'),
  (747, 'the Boeing everybody can name'),
  (800, 'a perfect score on one half of the SAT'),
  (911, 'the number you call in an emergency')
on conflict (value) do update set phrase = excluded.phrase;

-- ------------------------------------------------------- reading the codes

/**
 * The new code shapes, all self-contained so a sentence can be built from the
 * code alone:
 *
 *   buy:movie:20      about what 20 movie tickets cost
 *   many:minutes:12   about the minutes in 12 hours
 *   btwn:206:365      more than one, fewer than the other
 *   over:64 / under:365
 */
create or replace function public.clue_family(p_code text)
returns text
language sql
stable
as $$
  select case
    when p_code like 'buy:%'  then 'money'
    when p_code like 'many:%' then 'measure'
    when p_code like 'btwn:%' then 'compare'
    when p_code like 'over:%' or p_code like 'under:%' then 'landmark'
    when p_code like 'sum:%' or p_code like 'prod:%' or p_code like 'gap:%'
      or p_code in ('sumodd','sumeven','onemakesother','square','triangle') then 'arithmetic'
    when p_code like 'has:%' or p_code like 'no:%' or p_code like 'max:%' or p_code like 'min:%'
      or p_code in ('alldiff','twinned','allodd','alleven','allsmall','allbig') then 'digits'
    when p_code like 'start:%' or p_code like 'end:%' or p_code like 'sec:%'
      or p_code like 'len:%' or p_code in ('bookends','midzero') then 'position'
    else 'shape'
  end;
$$;

/** The band a creative code covers: [lo, hi]. Null for the digit families. */
create or replace function public.clue_band(p_code text)
returns int[]
language plpgsql
stable
as $$
declare
  kind   text := split_part(p_code, ':', 1);
  a      text := split_part(p_code, ':', 2);
  b      text := split_part(p_code, ':', 3);
  v_size int;
  v_step int;
  v_k    int;
  v_w    int;
begin
  if kind = 'buy' then
    select i.price, i.step into v_size, v_step from public.clue_items i where i.key = a;
    if v_size is null then return null; end if;
    v_k := b::int;
    v_w := v_size * v_step;
    return array[v_k * v_size - v_w / 2, v_k * v_size + v_w / 2 - 1];

  elsif kind = 'many' then
    select m.size, m.step into v_size, v_step from public.clue_measures m where m.key = a;
    if v_size is null then return null; end if;
    v_k := b::int;
    v_w := v_size * v_step;
    return array[v_k * v_size - v_w / 2, v_k * v_size + v_w / 2 - 1];

  elsif kind = 'btwn' then
    return array[a::int + 1, b::int - 1];

  elsif kind = 'over' then
    -- Wide enough that "a little more than" is a direction, not a location.
    return array[a::int + 1, a::int + 60];

  elsif kind = 'under' then
    return array[a::int - 60, a::int - 1];
  end if;

  return null;
end;
$$;

create or replace function public.clue_holds(n integer, p_code text)
returns boolean
language plpgsql
stable
as $$
declare
  band int[] := public.clue_band(p_code);
  d    integer[];
  len  integer;
  s    integer;
  p    integer := 1;
  arg  integer;
  kind text;
begin
  if band is not null then
    return n between band[1] and band[2];
  end if;

  d   := public.digits_of(n);
  len := array_length(d, 1);
  s   := public.digit_sum(n);
  for i in 1 .. len loop p := p * d[i]; end loop;

  if position(':' in p_code) > 0 then
    kind := split_part(p_code, ':', 1);
    arg  := split_part(p_code, ':', 2)::int;

    return case kind
      when 'sum'   then s = arg
      when 'prod'  then p = arg
      when 'has'   then arg = any(d)
      when 'no'    then not (arg = any(d))
      when 'max'   then (select max(x) from unnest(d) x) = arg
      when 'min'   then (select min(x) from unnest(d) x) = arg
      when 'gap'   then abs(d[1] - d[len]) = arg
      when 'start' then d[1] = arg
      when 'end'   then d[len] = arg
      when 'sec'   then len > 1 and d[2] = arg
      when 'len'   then len = arg
      else false
    end;
  end if;

  return case p_code
    when 'climbing' then len > 1 and (
      select bool_and(d[i] < d[i + 1]) from generate_series(1, len - 1) i)
    when 'falling' then len > 1 and (
      select bool_and(d[i] > d[i + 1]) from generate_series(1, len - 1) i)
    when 'running' then len = 3 and d[2] = d[1] + 1 and d[3] = d[2] + 1
    when 'mirror' then len > 1 and (
      select bool_and(d[i] = d[len + 1 - i]) from generate_series(1, len) i)
    when 'twinned' then len > 1 and (select count(distinct x) < len from unnest(d) x)
    when 'allsame' then len > 1 and (select count(distinct x) = 1 from unnest(d) x)
    when 'alldiff' then (select count(distinct x) = len from unnest(d) x)
    when 'bookends' then len > 1 and d[1] = d[len]
    when 'midzero'  then len = 3 and d[2] = 0
    when 'midbiggest'  then len = 3 and d[2] > d[1] and d[2] > d[3]
    when 'midsmallest' then len = 3 and d[2] < d[1] and d[2] < d[3]
    when 'midaverage'  then len = 3 and d[1] + d[3] = 2 * d[2]
    when 'startsbigger' then d[1] > d[len]
    when 'endsbigger'   then d[len] > d[1]
    when 'sumodd'  then s % 2 = 1
    when 'sumeven' then s % 2 = 0
    when 'allodd'  then (select bool_and(x % 2 = 1) from unnest(d) x)
    when 'alleven' then (select bool_and(x % 2 = 0) from unnest(d) x)
    when 'allsmall' then (select bool_and(x <= 4) from unnest(d) x)
    when 'allbig'   then (select bool_and(x >= 5) from unnest(d) x)
    when 'onemakesother' then len = 3 and (
      d[1] = d[2] + d[3] or d[2] = d[1] + d[3] or d[3] = d[1] + d[2])
    when 'square'   then exists (select 1 from generate_series(1, 31) i where i * i = n)
    when 'triangle' then exists (select 1 from generate_series(1, 44) i where i * (i + 1) / 2 = n)
    else false
  end;
end;
$$;

create or replace function public.clue_text(p_code text)
returns text
language plpgsql
stable
as $$
declare
  kind text := split_part(p_code, ':', 1);
  a    text := split_part(p_code, ':', 2);
  b    text := split_part(p_code, ':', 3);
  arg  int;
  an   text;
  t    text;
  pa   text;
  pb   text;
begin
  if kind = 'buy' then
    select plural into t from public.clue_items where key = a;
    return format('About what %s %s cost.', b, t);

  elsif kind = 'many' then
    select template into t from public.clue_measures m where m.key = a;
    return replace(t, '{k}', b);

  elsif kind = 'btwn' then
    select phrase into pa from public.clue_landmarks where value = a::int;
    select phrase into pb from public.clue_landmarks where value = b::int;
    return format('More than %s, fewer than %s.', pa, pb);

  elsif kind = 'over' then
    select phrase into pa from public.clue_landmarks where value = a::int;
    return format('A little more than %s.', pa);

  elsif kind = 'under' then
    select phrase into pa from public.clue_landmarks where value = a::int;
    return format('A little under %s.', pa);
  end if;

  if position(':' in p_code) > 0 then
    arg := split_part(p_code, ':', 2)::int;
    an  := case when arg = 8 then 'an ' else 'a ' end;

    return case kind
      when 'sum'   then format('Its digits add up to exactly %s.', arg)
      when 'prod'  then format('Multiply its digits together and you get %s.', arg)
      when 'has'   then format('There is %s%s in it somewhere.', an, arg)
      when 'no'    then format('There is no %s anywhere in it.', arg)
      when 'max'   then format('Its biggest digit is %s.', arg)
      when 'min'   then format('Its smallest digit is %s.', arg)
      when 'gap'   then case when arg = 0 then 'Its first and last digits are the same.'
                             else format('Its first and last digits are %s apart.', arg) end
      when 'start' then format('It starts with %s%s.', an, arg)
      when 'end'   then format('It ends in %s%s.', an, arg)
      when 'sec'   then format('Its second digit is %s%s.', an, arg)
      when 'len'   then case arg when 1 then 'It is a single digit.'
                                 when 2 then 'It has two digits.'
                                 when 3 then 'It has three digits.'
                                 else 'It has four digits.' end
      else 'It is between 1 and 1000.'
    end;
  end if;

  return case p_code
    when 'climbing' then 'Each digit is bigger than the one before it, like 245.'
    when 'falling'  then 'Each digit is smaller than the one before it, like 852.'
    when 'running'  then 'Its digits are three in a row, like 456.'
    when 'mirror'   then 'It reads the same backwards, like 262.'
    when 'twinned'  then 'Two of its digits are the same, like 447.'
    when 'allsame'  then 'Every digit is the same, like 555.'
    when 'alldiff'  then 'No digit appears twice.'
    when 'bookends' then 'It starts and ends on the same digit, like 727.'
    when 'midzero'  then 'Its middle digit is a 0.'
    when 'midbiggest'  then 'The middle digit is the biggest of the three, like 391.'
    when 'midsmallest' then 'The middle digit is the smallest of the three, like 715.'
    when 'midaverage'  then 'The middle digit is exactly halfway between the other two.'
    when 'startsbigger' then 'The first digit is bigger than the last digit.'
    when 'endsbigger'   then 'The last digit is bigger than the first digit.'
    when 'sumodd'  then 'Its digits add up to an odd number.'
    when 'sumeven' then 'Its digits add up to an even number.'
    when 'allodd'  then 'Every digit is odd.'
    when 'alleven' then 'Every digit is even.'
    when 'allsmall' then 'No digit is bigger than 4.'
    when 'allbig'   then 'No digit is smaller than 5.'
    when 'onemakesother' then 'Two of its digits add up to the third, like 246.'
    when 'square'   then 'It is a number times itself, like 144.'
    when 'triangle' then 'It is 1 + 2 + 3 + … added up to somewhere, like 210.'
    else 'It is between 1 and 1000.'
  end;
end;
$$;

-- ------------------------------------------------------------- the members

/**
 * Rebuilds the creative half of clue_members.
 *
 * Only bands 50 wide or more survive. Narrower than that and the sentence
 * stops being a clue: at forty wide a player with one guess left can walk
 * straight in, which is precisely the complaint that started this.
 */
create or replace function public.rebuild_creative_clues()
returns integer
language plpgsql
as $$
declare
  v_added integer;
begin
  delete from public.clue_members
  where code like 'buy:%' or code like 'many:%' or code like 'btwn:%'
     or code like 'over:%' or code like 'under:%';

  with codes as (
    -- Prices: k counts in steps, so the band is price * step wide.
    select 'buy:' || i.key || ':' || (g.k * i.step) as code
    from public.clue_items i
    cross join generate_series(1, 1000) g(k)
    where g.k * i.step * i.price between 60 and 1040
      and i.price * i.step >= 50

    union all
    select 'many:' || m.key || ':' || (g.k * m.step)
    from public.clue_measures m
    cross join generate_series(1, 1000) g(k)
    where g.k * m.step * m.size between 60 and 1040
      and m.size * m.step >= 50

    union all
    -- Every pair of landmarks far enough apart to be a band and close enough
    -- to be worth saying.
    select 'btwn:' || lo.value || ':' || hi.value
    from public.clue_landmarks lo
    join public.clue_landmarks hi on hi.value > lo.value + 60
    where hi.value - lo.value <= 420

    union all
    select 'over:' || value from public.clue_landmarks where value <= 940
    union all
    select 'under:' || value from public.clue_landmarks where value >= 61
  ),
  banded as (
    select c.code, public.clue_band(c.code) as band from codes c
  ),
  kept as (
    select code, greatest(1, band[1]) as lo, least(1000, band[2]) as hi
    from banded
    where band is not null
      and least(1000, band[2]) - greatest(1, band[1]) + 1 >= 50
      and greatest(1, band[1]) <= 1000
      and least(1000, band[2]) >= 1
  ),
  ins as (
    insert into public.clue_members (code, n)
    select k.code, g.n::smallint
    from kept k
    cross join lateral generate_series(k.lo, k.hi) g(n)
    on conflict do nothing
    returning 1
  )
  select count(*) into v_added from ins;

  return v_added;
end;
$$;

select public.rebuild_creative_clues();

-- ------------------------------------------------------------ which family

/**
 * Which families a level is allowed to draw from.
 *
 * Ground and Sky get everything: down there a clue is a pleasure, and being
 * told the number is between the bones in your body and the days in a year is
 * a nicer way to spend a guess than counting digits.
 *
 * Higher up the landmarks go first. "A little more than the days in a year" is
 * read in one beat and lands you within sixty of the answer - fine at level 4,
 * far too kind at level 48, where the whole tier is meant to cost you
 * something. What is left is the families you have to work out: a price times
 * a count, or a count times a unit.
 */
create or replace function public.clue_families_for(p_level integer)
returns text[]
language sql
immutable
as $$
  select case
    when p_level <= 20 then
      array['money','measure','compare','landmark','arithmetic','digits','position','shape']
    when p_level <= 40 then
      array['money','measure','compare','arithmetic','digits','position','shape']
    else
      array['money','measure','arithmetic','digits','position']
  end;
$$;

/**
 * The clue for a level: the strength the tier asks for, from the families the
 * tier allows.
 *
 * A separate entrance rather than a seventh argument on clue_at_strength,
 * which duels also call - adding a defaulted parameter there would have made
 * every existing six-argument call ambiguous.
 */
create or replace function public.clue_for_level(
  p_answer integer,
  p_lo integer,
  p_hi integer,
  p_level integer,
  p_avoid_family text default null,
  p_avoid_codes text[] default '{}'
)
returns text[]
language plpgsql
volatile
as $$
declare
  lo    int := greatest(1, coalesce(p_lo, 1));
  hi    int := least(1000, coalesce(p_hi, 1000));
  fams  text[] := public.clue_families_for(p_level);
  span  int;
  pick  text;
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
    where public.clue_family(m.code) = any(fams)
      and (p_avoid_family is null or public.clue_family(m.code) <> p_avoid_family)
      and not (m.code = any(coalesce(p_avoid_codes, '{}'::text[])))
  ),
  usable as (
    select code, share from scored
    where share > 0.05 and share < 0.95
    order by abs(share - public.endless_clue_target(p_level)), code
    limit 24
  ),
  numbered as (
    select code, row_number() over (
             order by abs(share - public.endless_clue_target(p_level)), code) - 1 as i,
           count(*) over () as n
    from usable
  )
  select code into pick from numbered
  where i = abs(hashtext('within-clue:' || p_answer || ':' || lo || ':' || hi || ':' || p_level))
        % greatest(1, (select max(n) from numbered));

  if pick is null and p_avoid_family is not null then
    return public.clue_for_level(p_answer, lo, hi, p_level, null, p_avoid_codes);
  end if;

  if pick is null and coalesce(array_length(p_avoid_codes, 1), 0) > 0 then
    return public.clue_for_level(p_answer, lo, hi, p_level, null, '{}'::text[]);
  end if;

  -- Nothing in the allowed families fits: better a digit clue than no clue.
  if pick is null then
    return public.clue_at_strength(
      p_answer, lo, hi, public.endless_clue_target(p_level), p_avoid_family, p_avoid_codes);
  end if;

  return array[public.clue_text(pick), public.clue_family(pick), pick];
end;
$$;

/** 0117's endless_state, with the clue coming from the level rather than a number. */
create or replace function public.endless_state()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid  uuid := auth.uid();
  v_week date;
  v_run  public.endless_runs%rowtype;
  v_show boolean;
  v_clue text;
  v_win  int[];
  v_pick text[];
  v_lvl  smallint;
begin
  if v_uid is null then
    return jsonb_build_object('error', 'not_authenticated');
  end if;

  v_week := public.endless_week(v_uid);
  v_run  := public.endless_climb(v_uid);
  v_lvl  := least(v_run.level, public.endless_max_level());

  v_show := (public.endless_attempts(v_lvl) - v_run.attempts_used)
            <= public.endless_clue_at(v_lvl);

  if v_show and v_run.health > 0 and v_run.summit_at is null then
    if v_run.clue_level is distinct from v_run.level then
      v_win := public.endless_window(v_run.id, v_run.level);
      v_pick := public.clue_for_level(
        public.endless_number(v_week, v_run.level),
        v_win[1], v_win[2],
        v_lvl,
        v_run.clue_family,
        v_run.clue_recent
      );

      update public.endless_runs set
        clue1 = v_pick[1],
        clue_family = v_pick[2],
        clue_level = v_run.level,
        clue_recent = array(
          select u from unnest(v_run.clue_recent || v_pick[3]) with ordinality t(u, o)
          order by o
          offset greatest(0, coalesce(array_length(v_run.clue_recent, 1), 0) + 1 - 8)
        )
      where id = v_run.id
      returning * into v_run;
    end if;
    v_clue := v_run.clue1;
  end if;

  return jsonb_build_object(
    'week', v_week,
    'level', v_run.level,
    'maxLevel', public.endless_max_level(),
    'health', v_run.health,
    'fall', public.endless_fall(v_lvl),
    'summit', v_run.summit_at is not null,
    'guessesUsed', v_run.guesses_used,
    'lives', v_run.lives,
    'sessionsLeft', public.endless_sessions_left(v_uid),
    'inSession', v_run.health > 0 and v_run.summit_at is null
                 and v_run.session_date = public.current_puzzle_date(v_uid),
    'attemptsUsed', v_run.attempts_used,
    'attemptsAllowed', public.endless_attempts(v_lvl),
    'clue1', v_clue,
    'guesses', coalesce((
      select jsonb_agg(jsonb_build_object(
               'guess', g.guess, 'direction', g.direction, 'tier', g.tier,
               'isCorrect', g.direction = 'correct',
               'isWithin10', abs(g.guess - public.endless_number(v_week, v_run.level)) <= 10
                             and g.direction <> 'correct',
               'isOneAway', abs(g.guess - public.endless_number(v_week, v_run.level)) = 1
             ) order by g.guess_index)
      from public.endless_guesses g
      where g.run_id = v_run.id and g.level = v_run.level
    ), '[]'::jsonb),
    'best', greatest(0, v_run.best_level - 1)
  );
end;
$$;

alter table public.clue_items enable row level security;
alter table public.clue_measures enable row level security;
alter table public.clue_landmarks enable row level security;

revoke execute on function public.clue_band(text)                     from public, anon, authenticated;
revoke execute on function public.clue_families_for(integer)          from public, anon, authenticated;
revoke execute on function public.rebuild_creative_clues()            from public, anon, authenticated;
revoke execute on function public.clue_for_level(integer,integer,integer,integer,text,text[])
  from public, anon, authenticated;
revoke execute on function public.endless_state() from public, anon;
grant execute on function public.endless_state() to authenticated;

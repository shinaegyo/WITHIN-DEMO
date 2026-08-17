-- The clue catalogue is a set, not an array.
--
-- clue_codes() returns setof text, and daily_clue_for wrapped it in unnest()
-- as though it returned text[]. Postgres does not resolve that until the
-- branch runs, so 0123 applied cleanly and round two failed the moment
-- somebody asked for a digits clue: "function unnest(text) does not exist".
--
-- The factors branch builds its own array literal and never hit it, which is
-- why the mistake lived in exactly one of the three kinds.

begin;

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

commit;

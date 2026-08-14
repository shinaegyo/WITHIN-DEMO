-- Names strangers will see.
--
-- Usernames sit on public leaderboards next to everybody else's. Among nine
-- friends that needs no policing; the first time an advert points a few
-- thousand strangers at this, somebody claims something vile and it is on the
-- board every player looks at.
--
-- Checked on the way in rather than cleaned up afterwards, because a name that
-- reached a leaderboard has already been seen by everyone who was going to see
-- it.
--
-- Two lists. Blocked terms are matched inside the name after leetspeak is
-- folded away, so "a55hole" and "s_h_i_t" do not walk past a substring check.
-- Reserved names are matched whole: nobody impersonates the game itself, but
-- "admin" inside "admiral" is a real word and should not be refused.

create table if not exists public.blocked_terms (
  term  text primary key,
  whole boolean not null default false
);

alter table public.blocked_terms enable row level security;

insert into public.blocked_terms (term, whole) values
  -- Slurs and the like. Extend with a plain insert; no migration needed.
  ('nigg', false), ('nigr', false), ('faggot', false), ('fag', true),
  ('retard', false), ('tranny', false), ('kike', false), ('spic', true),
  ('chink', false), ('wetback', false), ('coon', true), ('paki', true),
  ('rapist', false), ('rape', true), ('nazi', false), ('hitler', false),
  ('pedo', false), ('paedo', false), ('kkk', true),
  -- Ordinary profanity. A game a child might open should not have these on the
  -- leaderboard either.
  ('fuck', false), ('shit', false), ('cunt', false), ('bitch', false),
  ('whore', false), ('slut', false), ('dick', true), ('cock', true),
  ('penis', false), ('vagina', false), ('anus', true), ('asshole', false),
  ('bastard', false), ('wank', false),
  -- Impersonation.
  ('admin', true), ('administrator', true), ('moderator', true), ('mod', true),
  ('staff', true), ('support', true), ('official', true), ('system', true),
  ('within', true), ('withinteam', true), ('root', true), ('null', true),
  ('undefined', true), ('anonymous', true), ('player', true)
on conflict (term) do nothing;

/**
 * The name reduced to what somebody reading it would see.
 *
 * Digits and symbols standing in for letters are folded back, and separators
 * dropped, so the check looks at the word rather than its spelling.
 */
create or replace function public.normalise_name(p_name text)
returns text
language sql
immutable
as $$
  select regexp_replace(
    translate(lower(coalesce(p_name, '')), '0134578@$!', 'oieastbas'),
    '[^a-z]', '', 'g'
  );
$$;

/** Null if the name is fine, otherwise the reason it is not. */
create or replace function public.name_rejection(p_name text)
returns text
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_clean text := public.normalise_name(p_name);
begin
  if exists (
    select 1 from public.blocked_terms b
    where (b.whole and v_clean = public.normalise_name(b.term))
       or (not b.whole and position(public.normalise_name(b.term) in v_clean) > 0)
  ) then
    return 'name_not_allowed';
  end if;

  -- A name of nothing but digits and underscores reads as a serial number and
  -- is the shape every throwaway account takes.
  if v_clean = '' then
    return 'name_needs_letters';
  end if;

  return null;
end;
$$;

create or replace function public.set_username(p_username text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid    uuid := auth.uid();
  v_name   text := trim(p_username);
  v_reason text;
begin
  if v_uid is null then
    return jsonb_build_object('error', 'not_authenticated');
  end if;

  if char_length(v_name) < 3 or char_length(v_name) > 16 then
    return jsonb_build_object('error', 'bad_length');
  end if;

  -- Letters, digits and underscore only. Keeps the leaderboard readable and
  -- rules out names built from lookalike or invisible characters.
  if v_name !~ '^[A-Za-z0-9_]+$' then
    return jsonb_build_object('error', 'bad_characters');
  end if;

  v_reason := public.name_rejection(v_name);
  if v_reason is not null then
    return jsonb_build_object('error', v_reason);
  end if;

  -- Insert rather than update: a fresh anonymous player may have no profile row
  -- yet, and claiming a name is often the first thing they do.
  insert into public.profiles (id, username) values (v_uid, v_name)
  on conflict (id) do update set username = excluded.username;

  return jsonb_build_object('username', v_name);
exception
  when unique_violation then
    return jsonb_build_object('error', 'taken');
end;
$$;

revoke execute on function public.normalise_name(text)  from public, anon, authenticated;
revoke execute on function public.name_rejection(text)  from public, anon;
revoke execute on function public.set_username(text)    from public, anon;
grant execute on function public.set_username(text) to authenticated;

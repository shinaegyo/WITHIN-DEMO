-- Remember on the account whether a player has been taught the game.
--
-- This was previously inferred: a device flag, plus "has played no days yet".
-- Both are wrong in opposite directions. The device flag alone restarts the
-- tutorial for someone signing in on a second phone, and the day count
-- suppresses it for anyone whose session has any history at all — which is how
-- a player who genuinely had not seen the rules was sent straight to the home
-- screen.
--
-- Whether someone has been shown the rules is a fact about the person, so it
-- lives with them. The device flag stays as a fallback for when the server is
-- unreachable, but the account is the answer.

alter table public.profiles
  add column if not exists onboarded_at timestamptz;

-- Nobody who has already played should meet a tutorial on their next visit.
update public.profiles p
   set onboarded_at = now()
 where p.onboarded_at is null
   and exists (select 1 from public.games g where g.user_id = p.id);

create or replace function public.intro_state()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_at  timestamptz;
begin
  if v_uid is null then
    return jsonb_build_object('error', 'not_authenticated');
  end if;

  insert into public.profiles (id) values (v_uid) on conflict (id) do nothing;
  select onboarded_at into v_at from public.profiles where id = v_uid;

  return jsonb_build_object('onboarded', v_at is not null);
end;
$$;

create or replace function public.mark_onboarded()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    return jsonb_build_object('error', 'not_authenticated');
  end if;

  update public.profiles
     set onboarded_at = coalesce(onboarded_at, now())
   where id = v_uid;

  return jsonb_build_object('ok', true);
end;
$$;

revoke execute on function public.intro_state()    from public, anon;
revoke execute on function public.mark_onboarded() from public, anon;
grant execute on function public.intro_state()     to authenticated;
grant execute on function public.mark_onboarded()  to authenticated;

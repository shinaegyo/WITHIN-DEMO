-- set_avatar was still validating the old shape.
--
-- The check was '^[a-z]{2,12}-[a-z]{3,8}$' - a character and a colour, exactly
-- two parts, letters only. That is "cat-blue", and it is neither of the shapes
-- the app writes now:
--
--   "blue"                  a monogram - the colour alone, no hyphen at all
--   "s5-coils-black-blue"   a person - four parts, and s5 has a digit in it
--
-- So every save came back bad_avatar and the picker silently changed nothing.
-- The client had moved and the server had not, which is invisible from either
-- side alone: the parse was right, the render was right, and the value never
-- left the phone.
--
-- Still shape only, and still deliberately not a list of known parts. The
-- client owns the list, an unknown part renders as the monogram rather than as
-- an error, and a hair style added next month cannot be rejected by a database
-- that has not heard of it. What is checked is that the value is small, lower
-- case, and made of the pieces this format has - which is enough to keep
-- anything strange out of a column that every player sees.

create or replace function public.set_avatar(p_avatar text)
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

  -- A colour on its own, or four parts separated by hyphens. Digits allowed,
  -- because the skin tones are s1 through s10.
  if p_avatar is null
     or (p_avatar !~ '^[a-z]{3,8}$'
         and p_avatar !~ '^[a-z0-9]{1,10}-[a-z0-9]{1,12}-[a-z]{3,10}-[a-z]{3,8}$') then
    return jsonb_build_object('error', 'bad_avatar');
  end if;

  insert into public.profiles (id, avatar) values (v_uid, p_avatar)
  on conflict (id) do update set avatar = excluded.avatar;

  return jsonb_build_object('ok', true, 'avatar', p_avatar);
end;
$$;

revoke execute on function public.set_avatar(text) from public, anon;
grant execute on function public.set_avatar(text) to authenticated;

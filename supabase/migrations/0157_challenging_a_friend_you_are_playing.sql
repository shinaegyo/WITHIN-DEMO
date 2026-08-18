-- Challenging a friend you are already playing takes you to the game.
--
-- challenge_friend refused with duel_already_open when a duel with that friend
-- was open. Correct as a statement and useless as behaviour: somebody pressing
-- Challenge wants to be in a game with that person, and the duel they are
-- being told about is the one they want. On Friends the refusal surfaced as a
-- note at the top of the screen, in muted grey - dimmer than the green used
-- for success - while the button they pressed was further down a list. So the
-- button did nothing, as far as anyone could tell.
--
-- It returns the existing duel now, with status "resumed" so a caller can tell
-- the two apart, and the same duelId shape either way so a caller that does
-- not care can just navigate.
--
-- duel_already_open stays in the client message table. Nothing returns it any
-- more, and an older client still knows the word.

begin;

create or replace function public.challenge_friend(p_username text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid    uuid := auth.uid();
  v_target uuid;
  v_id     uuid;
begin
  if v_uid is null then
    return jsonb_build_object('error', 'not_authenticated');
  end if;

  v_target := public.user_id_for_username(p_username);
  if v_target is null then
    return jsonb_build_object('error', 'no_such_user');
  end if;
  if v_target = v_uid then
    return jsonb_build_object('error', 'thats_you');
  end if;

  if not exists (
    select 1 from public.friendships f
    where f.status = 'accepted'
      and ((f.requester_id = v_uid and f.addressee_id = v_target)
        or (f.addressee_id = v_uid and f.requester_id = v_target))
  ) then
    return jsonb_build_object('error', 'not_friends');
  end if;

  -- Rounds are three minutes long, so a challenge to somebody who has closed
  -- the app is a loss posted to their account before they have seen it.
  if not exists (
    select 1 from public.profiles
    where id = v_target and last_seen_at > now() - interval '2 minutes'
  ) then
    return jsonb_build_object('error', 'not_online');
  end if;

  -- Already playing them? Then this is the way back into it.
  --
  -- Refusing here was the wrong answer to the right question. Somebody
  -- pressing Challenge on a friend wants to be in a game with that friend, and
  -- being told they already have one - in the quietest text on the screen, at
  -- the top, well away from the button they pressed - reads as the button
  -- being broken. The duel they were told about is the one they wanted.
  select d.id into v_id
  from public.duels d
  where d.status in ('pending', 'active')
    and not d.ranked
    and ((d.challenger_id = v_uid and d.opponent_id = v_target)
      or (d.opponent_id = v_uid and d.challenger_id = v_target))
  order by d.created_at desc
  limit 1;

  if v_id is not null then
    return jsonb_build_object('status', 'resumed', 'duelId', v_id);
  end if;

  insert into public.duels (challenger_id, opponent_id)
  values (v_uid, v_target)
  returning id into v_id;

  return jsonb_build_object('status', 'challenged', 'duelId', v_id);
end;
$$;

revoke execute on function public.challenge_friend(text) from public, anon;
grant  execute on function public.challenge_friend(text) to authenticated;

commit;

-- Should no longer contain the refusal.
select case when pg_get_functiondef('public.challenge_friend(text)'::regprocedure)
              like '%duel_already_open%' then 'still refuses' else 'resumes' end as behaviour;

-- DESTRUCTIVE. Run the preview first and read what it lists.
--
-- Deletes the accounts that preview names, and only those: the conditions are
-- identical. Removing the auth user cascades to the profile, its games, guesses,
-- climbs, duels and friendships, so nothing is left pointing at a person who is
-- gone.
--
-- dev94751 is excluded, and anybody who has ever finished a day is excluded
-- whatever their name looks like.

delete from auth.users u
where u.id in (
  select p.id
  from public.profiles p
  where (
          p.username is null
          or (p.username ~ '^dev[0-9]+$' and p.username <> 'dev94751')
        )
    and not exists (
          select 1 from public.games g
          where g.user_id = p.id and g.status = 'complete'
        )
);

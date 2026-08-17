# Standoff — first to the number wins

A sketch, not a decision. Two players, one hidden number between 1 and 100,
and the first to name it exactly takes the round.

"Standoff" is a placeholder. It wants a name that says *both of you are aiming
at the same thing at the same time*.

## Why not alternating turns

The obvious shape — you guess, I guess, higher/lower after each, first to hit
it wins — is a solved game, and the opener wins it.

Guesses have to be inside the surviving range, otherwise a turn can be thrown
away on a number already ruled out. Given that, the range strictly shrinks, and
optimal halving runs:

```
100 → 50 → 25 → 12 → 6 → 3 → 1
  1    2    3    4    5   6   ← six guesses to reduce it to one
```

The seventh guess is forced and correct. Turns 1, 3, 5 and 7 belong to whoever
opened. So if both players simply bisect, **the opener always wins**, and the
responder's only path is to gamble — deviating from the halving, which is
strictly worse at narrowing. One player is structurally behind from the first
move of every round.

Alternating the opener across a best-of-three papers over it. It doesn't fix
the round itself, which is where the game actually lives.

## The shape instead: simultaneous commitment

Both players submit a guess for the same turn, blind. Neither sees the other's
until both are in. Then both are revealed together, both narrow the shared
range, and the turn advances.

No parity, no first-mover edge, and the mind game arrives for free: you are both
picking out of the *same* surviving range, so the question stops being "where is
the number" and becomes "where is the number, and where are they about to look".

This also matches the source video, which is the strongest evidence available
for what made it fun: the overlay carries both players' numbers side by side —
`Nic: 88` and `Cakes: 50` — held on screen together. That is a simultaneous
reveal, not a sequence of turns.

## The rules

- The server draws the answer, 1–100. Neither player ever sets it, so neither
  player is a referee with nothing to do.
- Each turn both players submit one guess, inside the surviving range, that
  they have not already used.
- A turn resolves only when both are in. Both are then revealed with their
  direction, and the range closes on whichever side each fell.
- An exact hit wins the round immediately.
- Both exact on the same turn — possible only when both pick the same number —
  is a drawn round.
- Five turns is the cap. The range collapses long before that (two guesses a
  turn takes 100 → ~33 → ~11 → ~4 → ~1), so the cap exists to stop a stall
  rather than to end a real round. If nobody has hit it, **the closest single
  guess anyone made wins** — which is where "or the closest one" earns its
  place, as a terminator rather than as the main condition.
- Best of three rounds takes the match.

## Schema

Follows the duel conventions: the answer lives in its own table with RLS on and
no policy at all, reachable only from inside a definer function.

```sql
create table public.standoffs (
  id          uuid primary key default gen_random_uuid(),
  a_id        uuid not null references auth.users(id) on delete cascade,
  b_id        uuid not null references auth.users(id) on delete cascade,
  status      text not null default 'pending'
              check (status in ('pending','active','complete','declined','abandoned')),
  round       smallint not null default 1 check (round between 1 and 3),
  winner_id   uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  accepted_at timestamptz,
  finished_at timestamptz,

  check (a_id <> b_id)
);

alter table public.standoffs enable row level security;

create policy "read own standoffs" on public.standoffs
  for select using (auth.uid() in (a_id, b_id));

-- Dark. No policy, by design.
create table public.standoff_numbers (
  standoff_id uuid not null references public.standoffs(id) on delete cascade,
  round       smallint not null check (round between 1 and 3),
  answer      smallint not null check (answer between 1 and 100),
  primary key (standoff_id, round)
);

alter table public.standoff_numbers enable row level security;

-- The public state of a round: how far the range has closed, and whose turn
-- is outstanding. Both players see all of this - it is the shared board.
create table public.standoff_rounds (
  standoff_id uuid not null references public.standoffs(id) on delete cascade,
  round       smallint not null check (round between 1 and 3),
  lo          smallint not null default 1,
  hi          smallint not null default 100,
  turn_index  smallint not null default 1,
  status      text not null default 'playing'
              check (status in ('playing','won','drawn')),
  winner_id   uuid references auth.users(id) on delete set null,
  win_kind    text check (win_kind in ('exact','closest')),
  started_at  timestamptz not null default now(),

  primary key (standoff_id, round),
  check (lo <= hi)
);

alter table public.standoff_rounds enable row level security;

create policy "read own standoff rounds" on public.standoff_rounds
  for select using (exists (
    select 1 from public.standoffs s
    where s.id = standoff_id and auth.uid() in (s.a_id, s.b_id)
  ));

create table public.standoff_guesses (
  id          uuid primary key default gen_random_uuid(),
  standoff_id uuid not null references public.standoffs(id) on delete cascade,
  round       smallint not null,
  turn_index  smallint not null,
  user_id     uuid not null references auth.users(id) on delete cascade,
  guess       smallint not null check (guess between 1 and 100),
  -- Both null until the turn resolves: writing the direction at submit time
  -- would leak the answer's side to anyone reading their own row early.
  direction   text check (direction in ('below','above','correct')),
  distance    smallint,
  revealed_at timestamptz,
  created_at  timestamptz not null default now(),

  unique (standoff_id, round, turn_index, user_id),
  unique (standoff_id, round, user_id, guess)
);

alter table public.standoff_guesses enable row level security;

-- Your own guess always; your opponent's only once the turn has resolved.
-- This predicate is the whole simultaneity guarantee - without it a client
-- polling the table sees the other player's number while they are still
-- choosing, and the mode collapses into "wait, then beat them by one".
create policy "read standoff guesses" on public.standoff_guesses
  for select using (
    user_id = auth.uid()
    or (revealed_at is not null and exists (
      select 1 from public.standoffs s
      where s.id = standoff_id and auth.uid() in (s.a_id, s.b_id)
    ))
  );
```

## Turn logic

One entry point. Everything happens inside it, under a row lock on the round,
so two submissions arriving together cannot both believe they are the second.

```
standoff_submit(p_standoff uuid, p_guess integer) -> jsonb
```

1. Reject unless the caller is in this standoff, the standoff is `active`, and
   the round is `playing`.
2. Reject `p_guess` outside `[lo, hi]` — `out_of_range`. The range is public,
   so this is never a surprise.
3. Reject a guess this player has already used this round — `duplicate_guess`.
4. Insert the row with `direction`, `distance` and `revealed_at` left null.
5. `select ... for update` on `standoff_rounds`. If the opponent has no row for
   this `turn_index`, return `{ waiting: true }` and stop. Nothing is revealed.
6. Otherwise both are in — resolve:
   - Read `answer`. Stamp both rows with direction, distance and `revealed_at`,
     which is the moment they become visible to each other.
   - Exactly one exact → round `won`, `win_kind = 'exact'`.
   - Both exact → round `drawn`.
   - Neither → close the range:
     ```
     lo = greatest(lo, max(g + 1) for guesses below answer)
     hi = least(hi,    min(g - 1) for guesses above answer)
     ```
     then `turn_index = turn_index + 1`.
   - If `turn_index` would exceed 5, the round ends on `closest`: smallest
     `distance` of any guess in the round takes it, equal distance is `drawn`.
7. When a round settles, advance `standoffs.round`, or finish the match if a
   player has taken two.

`standoff_state(p_standoff uuid) -> jsonb` returns the match, the current
round's `lo`/`hi`/`turn_index`, every revealed guess from both players, and
whether the caller's own guess for this turn is already in. It never returns
`answer` while the round is playing.

## Open questions

- **The turn clock.** Duels already treat leaving as immediate (0079) and have
  presence. A standoff turn needs the same or it hangs on somebody who closed
  the tab. Forfeit the turn, or the round?
- **Matchmaking.** `duel_queue` (0066) and the friends list both already exist
  and should be reusable rather than rebuilt.
- **A drawn round** needs a rule at match level — replay it, or count it to
  neither and let a best-of-three end 1–1–1.
- **Range of 1.** If the range ever closes to a single number, both players are
  forced onto it and the round is a guaranteed draw. The five-turn cap should
  bite first, but it is worth confirming rather than assuming.
- **Is 1–100 too small?** Two guesses a turn against a hundred numbers is over
  in about four turns. That may be exactly the point for a short mode, or it
  may want 1–500.

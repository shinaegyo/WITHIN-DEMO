# The daily leaderboard at scale

Decided 15 August 2026. Not built yet — this is the spec for the next session.

## The problem

At 10,000 players the daily board breaks. Scores run 0–300 in steps of 10, so
thousands share every score: "1,400 players in 1st place" is unreadable, and
"you are #4,127" is worse. Breaking the tie does not fix either one. It
replaces an ugly number with a discouraging one.

Clash Royale is not the comparison. Trophies are a ladder climbed over months
and the rank *is* the product. The daily is a shared puzzle played once. The
question a player is asking is not "am I 4,127th", it is "did I do well today".

The same call was already made on Rush and was right there: "2nd of 5 today"
described the size of the room rather than the run, and was replaced with the
player's own best.

## What to build

**1. Percentile, not position.** "Top 4% today." True, readable at any player
count, survives ties without pretending they are not there. The rank stays
available underneath for small player counts — the existing rule of showing a
position under 20 runs and a percentile above still applies.

**2. Your score, and how many share it.** "280 points · 1,412 players." The tie
stated as a fact rather than hidden, and genuinely interesting information.

**3. The distribution.** Already built for Rush (`rush_leaderboard` returns it,
`RushScreen` draws it, gated at 12 runs). The same shape belongs on the daily,
where it finally has enough players to have one.

**4. A strict podium, top 10 only.** Ordered by:

   1. points
   2. total guess distance, ascending
   3. completion time, ascending

Small enough that a leaderboard is the right shape, and being 7th of 10,000 is
an achievement worth stating precisely.

## Why total distance is not enough on its own

A round scored 100 was found on the first guess, so its only guess *was* the
answer and its distance is 0. The players who most need separating — the ones
crowded at the top — have the fewest guesses and therefore the least distance
to differ on. Distance works well in the middle of the field and worst exactly
where it matters. Hence time as the third key.

Time sits third deliberately. You only race someone you have already tied on
both score and precision, so nobody plays fast to climb; they play accurately.

## Notes for whoever builds it

- **Distance is free.** Every guess is already stored, so total distance is a
  sum over `guesses`, not something new to collect.
- **Time is not.** It needs a decision: sum of per-round durations (first guess
  to solve, per round) rather than wall-clock from the day opening — otherwise
  somebody who starts round one and comes back at lunch is punished for having
  a life.
- **Do not add rounds.** More rounds does increase granularity, but it fixes a
  leaderboard problem by making the game longer — charging every player five
  extra minutes a day to solve a display issue for the top 1%. Three rounds is
  the product.
- **Do not tiebreak on attempts used.** Round score is a function of attempts
  (100 for the first, down to 40 for the seventh), so two players on the same
  score used the same attempts by definition. It is the same information twice.
- **Show distance, hide time.** A visible precision column gives people
  something to compete on; a visible clock invites racing.

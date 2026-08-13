# WITHIN — where things stand

Written 2026-08-13, at the point of handing the game to the first real testers.
Read this first when picking the project back up.

## Live

- **Site:** https://withindemo.vercel.app (Vercel, auto-deploys from `main`)
- **Repo:** `shinaegyo/WITHIN-DEMO`, pushed over SSH
- **Backend:** Supabase. Every rule is server-side; the client is assumed hostile
  and never learns an answer.

## Just done

The database was wiped of test accounts on 2026-08-13. The leaderboard started
again from one real player. **Do not wipe it again** now that people have
streaks — the cost of a reset is somebody's run.

## Next, roughly in order

1. **Watch retention, not day one.** Everyone plays once out of politeness. The
   number that means something is how many come back on days 2 and 3 unprompted.
2. **A domain for Resend** (~£10/yr) so sign-in codes actually deliver. Until
   then everyone is on an anonymous account and a cleared browser loses a
   streak — the biggest hole in the current experience.
3. **Real AdMob** to replace the stubbed retry. The button deliberately no
   longer mentions an ad; restore that wording when one actually plays.
4. **Apple Developer** ($99/yr) for TestFlight and real haptics.
5. **Before any public push:** leaderboard protection against bulk accounts, and
   turn on Point-in-Time Recovery in Supabase.

## Known rough edges

- The amber warning under the board on the final attempt, and the indigo
  BONUS CLUE label, are the last two places a colour is used as decoration
  rather than meaning. Everything else was moved to the foreground colour.
- Rank is daily. All-time was rejected on purpose: a cumulative rank mostly
  measures how long someone has played, so anyone joining later can never reach
  the top — bad for a game that spreads by invitation. Rolling 7 days is the
  natural next step if daily stops being enough.
- Nothing has been tested on Android.

## Things that bite if forgotten

- Node 18 is too old for this toolchain. Every command needs
  `export PATH="/usr/local/opt/node@20/bin:$PATH"` first.
- `expo export --platform web` output goes to `dist/`; `./scripts/build-web.sh`
  wraps it.
- Puzzles generate themselves on demand, so the schedule cannot run out.
- `service_role` and Resend keys belong only in Supabase. The publishable key
  ships in the bundle by design and is safe there — every table relies on RLS
  rather than on hiding it.

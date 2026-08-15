# Avatars: people, as silhouettes

Chosen 15 August 2026, from eight rendered families. Not built.

## What it is

A head and shoulders, no face. What identifies you is **skin tone** and **hair
silhouette**, over a chosen **background colour**. A face was rejected on the
evidence: avatars live at 24px in a leaderboard row, and eyes, lips and teeth
turn to mush at that size — which is the same reason the fifty animal
characters were being replaced.

No guy/girl switch. Hair silhouettes are offered directly and are not labelled
by gender: simpler to build, and it excludes nobody.

## Parts

Three choices, stored together.

**Skin** — needs real range or it is worse than not offering it. Eight to ten
tones spanning the full spectrum, evenly stepped, none of them a token at
either end.

**Hair** — this is where the range has to be genuine. Cropped, short, waves,
curls, coils, locs, braids, long straight, ponytail, bun, headwrap, hijab,
bald. Anything less than this reads as a set that somebody was left out of.

**Colour** — the existing ten. Unchanged, and the only part that carries over.

## Storage

`"cat-blue"` cannot hold three parts. Either a delimited string —
`"skin4-coils-blue"` — or three columns on `profiles`. The string keeps the one
column and every existing read path; the columns are cleaner to query and
nothing queries this. Prefer the string for the smaller blast radius.

Every existing avatar is an animal key and will not parse. Falling back to a
default person keeps the colour they chose and loses the character. There is no
honest mapping from a crab to a person, so do not invent one — but do consider
prompting once on the profile: their old avatar is gone and they should get to
pick rather than discover a stranger.

## The picker

Three rows: skin, hair, colour, with the result rendered live above them at
both 40px and 24px, because 24 is where it will actually be seen.

## Build order

1. The part sets — skin tones and hair silhouettes, rendered for approval
   before any of it is wired. This is the part that has to be right.
2. Avatar.tsx: parse three parts, render the silhouette.
3. AvatarScreen: three rows instead of one grid.
4. Migration for the stored format, plus the one-time prompt.

## Why not the alternative

Family 12 — the fifty creatures, two-tone, faceless — was the other finalist
and is cheaper by several sessions: a render change in one file, no migration,
nobody loses their character, and distinct outlines that are easier to tell
apart at 24px than ten head-and-shoulders will be.

It lost on one thing, deliberately: people seeing themselves on the board is
worth more than people having something. If the build stalls, 12 is the fallback
and the work is not wasted — the colour palette and the picker layout are shared.

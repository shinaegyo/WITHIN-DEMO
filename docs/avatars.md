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

Four choices, stored together.

**Skin** — needs real range or it is worse than not offering it. Eight to ten
tones spanning the full spectrum, evenly stepped, none of them a token at
either end.

**Hair** — nine, cut from thirteen on the evidence of the 24px row: cropped,
short, waves and bob were one shape at that size, and four indistinguishable
options are nine real options plus four decoys. What survives is bald, cropped,
bob, curls, coils, locs, long, bun, headwrap and hijab — each tellable from the
others at leaderboard size, and the range genuine enough that nobody reads it as
a set they were left out of.

**Hair colour** — ten. Black, dark brown, brown, auburn, ginger, dark blonde,
blonde, silver, and two that do not grow: blue and pink. Without this axis a
blonde or grey-haired player cannot represent themselves, which undercuts the
whole reason this family was chosen.

**Colour** — the existing ten, for the background disc. Unchanged, and the only
part that carries over from the animals.

## The default is a monogram

Nobody starts as a person. Until somebody opens the picker, their avatar is the
first letter of their username on their colour — family 10 from the rendered
set, kept as the floor rather than as the whole system.

This is what makes the migration harmless. Every stored value is an animal key
that will not parse, and the worry was that people would open their profile and
find a stranger's face. A letter is not a stranger: it is legibly a placeholder,
it is still *theirs* because it is their initial and their colour, and it needs
no prompt, no reset and no data migration. Building a person becomes something
you opt into rather than something done to you.

It also solves the case nobody thinks about — a player who never opens the
picker at all, and every new signup before they have chosen anything.

## Storage

`"cat-blue"` cannot hold four parts. Either a delimited string —
`"skin4-coils-black-blue"` — or four columns on `profiles`. The string keeps the one
column and every existing read path; the columns are cleaner to query and
nothing queries this. Prefer the string for the smaller blast radius.

Every existing avatar is an animal key and will not parse. It falls back to the
monogram, which keeps the colour they chose and asks nothing of them.

## The picker

Four rows: skin, hair, hair colour, background, with the result rendered live
above them at both 40px and 24px, because 24 is where it will actually be seen.
The monogram sits as the first option, so somebody can go back to it.

10 skin × 10 hair × 10 hair colours × 10 backgrounds is ten thousand people,
against five hundred animals. Still one short string.

## Build order

1. The part sets — done. Ten skin tones, nine hair shapes, ten hair colours,
   rendered and approved 15 August 2026.
2. Avatar.tsx: the monogram, and a four-part parse that falls back to it. This
   ships something on its own — every animal becomes a letter, which is already
   better than what is there.
3. The silhouette renderer: bust, hair shape, hair colour.
4. AvatarScreen: four rows instead of one grid, with the monogram as the first
   option so somebody can go back to it.

No migration. The stored column is unchanged and unparseable values fall back,
which is the whole reason the monogram is the default.

## Why not the alternative

Family 12 — the fifty creatures, two-tone, faceless — was the other finalist
and is cheaper by several sessions: a render change in one file, no migration,
nobody loses their character, and distinct outlines that are easier to tell
apart at 24px than ten head-and-shoulders will be.

It lost on one thing, deliberately: people seeing themselves on the board is
worth more than people having something. If the build stalls, 12 is the fallback
and the work is not wasted — the colour palette and the picker layout are shared.

# Browsing the rank boards

Decided 15 August 2026. Not built — this is the spec.

## The problem

Every board returns a top ten. Your own card tells you where you came. Between
those two things is everybody from 11th to 50,000th, with nothing to look at
and no way to find anyone.

## The insight

Scrolling, jump-to-me and search are not three features. They are one:

> **load a window of ranks around a target.**

- Scrolling targets a position — 10, then 30, then 50.
- Find me targets you.
- Search targets whoever was typed.

So the server gets one new function and the screen gets three ways into it.

## Server

`board_window(p_board text, p_friends boolean, p_around uuid, p_offset int, p_limit int)`

- `p_board` — 'today' | 'season' | 'alltime'. The three existing functions
  already build the same shape of CTE; this factors that out rather than
  growing a fourth copy of it.
- `p_around` — when set, centre the window on that player's rank and ignore
  `p_offset`. Returns roughly three rows above and three below.
- `p_offset` — when `p_around` is null, a plain page.
- Cap `p_limit` at 50 and total depth at **500**. Past 500 nobody is reading
  names, and an unbounded scroll over 50,000 rows is a query to regret.

`find_player(p_name text, p_board text, p_friends boolean)`

- Exact username match, plus your friends by prefix.
- Returns rank, score and avg off on that board, or null.
- **Not fuzzy search over every player.** Usernames are already public on the
  board so this leaks nothing, but fuzzy browsing turns a leaderboard into a
  directory of strangers to target. You can find somebody whose name you know;
  you cannot go shopping.

## Screen

- The podium stays as it is — the top ten is still the thing you land on.
- Below it, the list continues and loads more as you reach the bottom, to 500.
- A **Find me** button pinned near the card, which scrolls to your window and
  highlights your row. This is the single most valuable piece: the point is not
  to reach 4,568, it is to see 4,565 through 4,571 and know who is one good
  morning away.
- A search field above the list. Typing a name jumps to that player's window
  with their row highlighted, on whichever board and whichever filter is
  currently active.

## Build order

1. `board_window` plus the scroll. Everything else depends on the window.
2. Find me. Cheapest addition once the window exists, and the biggest gain.
3. Search, on top of `find_player` feeding the same window.

## Notes

- The Everyone/Friends filter and the three tabs both stay live throughout —
  a window is always a window *into* the board you are looking at.
- Rank is computed over the full field and then sliced, never over the slice.
  Ranking a page would number every page from one.
- Refactoring the three existing boards onto a shared CTE is worth doing as
  part of step 1. There are already three copies of that scoring logic and this
  would make a fourth.

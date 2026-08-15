/**
 * The four arenas of a climb.
 *
 * One hue the whole way down, losing its light: The Shallows is lit water, The
 * Edge is almost nothing. Holding a single colour makes the descent read as one
 * place getting deeper rather than four skins in a row - which is why the only
 * break in it is saved for the last tier, where red on blue says something is
 * wrong here at the exact moment the game turns brutal.
 *
 * Every arena is dark, and that is structural rather than taste. Everything on
 * the screen used to take its ink from the app theme, so a pale arena and a
 * dark theme put white text on near-white: the attempts count simply vanished.
 * Dark grounds and the arena's own ink means the contrast cannot drift again.
 *
 * The bands are the attempt bands, deliberately - the background changes at the
 * exact moment the allowance does, so the change announces itself before the
 * transition card says a word.
 */
export interface Arena {
  key: string;
  name: string;
  from: number;
  attempts: number;
  /**
   * Attempts remaining when the clue appears; 99 means from the first guess.
   *
   * Mirrors endless_clue_at on the server. Two copies of one rule is a risk,
   * and the alternative was a screen that could not say when the clue is due
   * without asking - which is worse, because it has to say it before then.
   */
  clueAt: number;
  background: string;
  /** The deeper end of the vertical wash. */
  backgroundDeep: string;
  /**
   * The ground for tiles with no saturated fill of their own. It is darker
   * than the water for the first three tiers and lighter for the last, because
   * the band labels are shared with the daily and cannot move: a pale label
   * needs a dark tile, and by The Edge there is nothing darker left to use.
   */
  surface: string;
  text: string;
  muted: string;
  accent: string;
}

export const ARENAS: Arena[] = [
  {
    key: 'shallows', name: 'The Shallows', from: 1, attempts: 8, clueAt: 99,
    background: '#0F5F6E', backgroundDeep: '#0A3E4A', surface: '#04191F',
    text: '#F2FBFE', muted: '#9FE2EC', accent: '#5FD2E0',
  },
  {
    key: 'depths', name: 'The Depths', from: 20, attempts: 7, clueAt: 3,
    background: '#0E4A78', backgroundDeep: '#092E4A', surface: '#04131F',
    text: '#EFF7FD', muted: '#8FCDF0', accent: '#5AB0EE',
  },
  {
    key: 'dark', name: 'The Dark', from: 40, attempts: 6, clueAt: 2,
    background: '#0A2D48', backgroundDeep: '#061B2B', surface: '#020B11',
    text: '#EAF2F8', muted: '#79ADD2', accent: '#4E93C4',
  },
  {
    key: 'edge', name: 'The Edge', from: 80, attempts: 5, clueAt: 1,
    background: '#050A12', backgroundDeep: '#3A0A0C', surface: '#2E3339',
    text: '#FFF1EE', muted: '#FF8A7A', accent: '#E8503C',
  },
];

export function arenaFor(level: number): Arena {
  let found = ARENAS[0];
  for (const a of ARENAS) if (level >= a.from) found = a;
  return found;
}

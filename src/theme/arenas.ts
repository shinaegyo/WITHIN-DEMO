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
    key: 'shallows', name: 'The Shallows', from: 1, attempts: 8,
    background: '#12708C', backgroundDeep: '#0B4557', surface: '#051F27',
    text: '#F2FBFE', muted: '#A6E9F7', accent: '#6FDCEA',
  },
  {
    key: 'depths', name: 'The Depths', from: 20, attempts: 7,
    background: '#0E4A78', backgroundDeep: '#092E4A', surface: '#04131F',
    text: '#EFF7FD', muted: '#8FCDF0', accent: '#5AB0EE',
  },
  {
    key: 'dark', name: 'The Dark', from: 40, attempts: 6,
    background: '#0A2D48', backgroundDeep: '#061B2B', surface: '#020B11',
    text: '#EAF2F8', muted: '#79ADD2', accent: '#4E93C4',
  },
  {
    key: 'edge', name: 'The Edge', from: 80, attempts: 5,
    background: '#050A12', backgroundDeep: '#3A0A0C', surface: '#2E3339',
    text: '#FFF1EE', muted: '#FF8A7A', accent: '#E8503C',
  },
];

export function arenaFor(level: number): Arena {
  let found = ARENAS[0];
  for (const a of ARENAS) if (level >= a.from) found = a;
  return found;
}

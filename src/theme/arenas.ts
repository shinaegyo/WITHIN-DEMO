/**
 * The four arenas of a climb.
 *
 * The light drains as you descend: level 1 is a pale dawn, level 80 is a void
 * with the tiles as the only colour on screen. Nobody has to be told what that
 * means, and the last one being the most beautiful is the reward for arriving.
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
  surface: string;
  text: string;
  muted: string;
  accent: string;
}

export const ARENAS: Arena[] = [
  {
    key: 'shallows', name: 'The Shallows', from: 1, attempts: 8,
    background: '#EAF2FB', surface: '#FFFFFF', text: '#12203A', muted: '#5E708C',
    accent: '#2E5BFF',
  },
  {
    key: 'depths', name: 'The Depths', from: 20, attempts: 7,
    background: '#1B2350', surface: '#242D63', text: '#EEF1FF', muted: '#9AA6E0',
    accent: '#7C8CF8',
  },
  {
    key: 'dark', name: 'The Dark', from: 40, attempts: 6,
    background: '#08080C', surface: '#14141C', text: '#F2F2F6', muted: '#7A7A8C',
    accent: '#C2372F',
  },
  {
    key: 'edge', name: 'The Edge', from: 80, attempts: 5,
    background: '#050510', surface: '#141024', text: '#FFF6DE', muted: '#B9A77E',
    accent: '#E8B84B',
  },
];

export function arenaFor(level: number): Arena {
  let found = ARENAS[0];
  for (const a of ARENAS) if (level >= a.from) found = a;
  return found;
}

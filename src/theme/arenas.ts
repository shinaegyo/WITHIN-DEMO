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
  surface: string;
  text: string;
  muted: string;
  accent: string;
}

export const ARENAS: Arena[] = [
  {
    key: 'shallows', name: 'The Shallows', from: 1, attempts: 8,
    background: '#0F5A72', backgroundDeep: '#08334A', surface: '#12495F',
    text: '#F2FBFE', muted: '#A6E9F7', accent: '#6FDCEA',
  },
  {
    key: 'depths', name: 'The Depths', from: 20, attempts: 7,
    background: '#0C3352', backgroundDeep: '#061F35', surface: '#0F3A5C',
    text: '#EFF7FD', muted: '#7FC4EA', accent: '#4EA8E8',
  },
  {
    key: 'dark', name: 'The Dark', from: 40, attempts: 6,
    background: '#05192A', backgroundDeep: '#020B14', surface: '#0A2135',
    text: '#EAF2F8', muted: '#5E9CC4', accent: '#3E86B8',
  },
  {
    key: 'edge', name: 'The Edge', from: 80, attempts: 5,
    background: '#02080F', backgroundDeep: '#2B0709', surface: '#1A1216',
    text: '#FFF1EE', muted: '#FF8A7A', accent: '#E8503C',
  },
];

export function arenaFor(level: number): Arena {
  let found = ARENAS[0];
  for (const a of ARENAS) if (level >= a.from) found = a;
  return found;
}

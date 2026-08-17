/**
 * The four stages of a climb: ground, sky, stratosphere, orbit.
 *
 * They used to descend - The Shallows to The Edge, water losing its light -
 * while the button that starts a run says Climb. The words went one way and the
 * picture went the other, and four muddy blue-blacks sat oddly in an app that
 * is otherwise white and black.
 *
 * Going up resolves it, and the air does the work: earth at the bottom, real
 * daylight sky, deep indigo where it starts to thin, and black at the top -
 * because the sky genuinely does turn black at altitude. The last stage is as
 * dark as the old one was, but now there is a reason for it, and the blue and
 * red tiles are the only lit things on the screen at the point the game is
 * hardest.
 *
 * The first two stages are light, which the old set could not risk: everything
 * took its ink from the app theme, so a pale stage in dark mode put white text
 * on near-white. Each stage carries its own ink now, so a light ground is safe.
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
   * What running out of attempts costs, as a percentage of health.
   *
   * The difficulty dial. Attempts only fall from 7 to 5 across the whole climb,
   * because a tier where the colours cannot get you there is a coin toss rather
   * than a hard tier - so what changes with altitude is the price of a mistake:
   * ten falls on the ground, two in orbit.
   */
  fall: number;
  /** The music this tier plays. One ladder for the sky and the sound. */
  track: string;
  /**
   * A darker blue for the stages whose ground is already blue. The standard
   * tile blue vanishes into a daylight sky, and a proximity colour that cannot
   * be seen is not a proximity colour.
   */
  below?: string;
  /**
   * The attempt the clue appears on, counted forward: 1 means immediately.
   *
   * Mirrors endless_clue_at on the server, which derives the same rule from
   * each tier's allowance. Two copies of one rule is a risk, and the
   * alternative was a screen that could not say when the clue is due without
   * asking - which is worse, because it has to say it before then.
   */
  clueFrom: number;
  background: string;
  /** The deeper end of the vertical wash. */
  backgroundDeep: string;
  /**
   * The ground for tiles with no saturated fill of their own - lighter than the
   * sky while the sky is dark, darker than it while the sky is light.
   */
  surface: string;
  text: string;
  muted: string;
  accent: string;
}

export const ARENAS: Arena[] = [
  {
    key: 'ground', name: 'Ground', from: 1, attempts: 6, fall: 20, clueFrom: 1,
    track: 'climbGround',
    background: '#EDE7DC', backgroundDeep: '#DFD7C8', surface: '#FBF9F5',
    text: '#2A251C', muted: '#6F6757', accent: '#8A7A5E',
  },
  {
    key: 'sky', name: 'Sky', from: 16, attempts: 6, fall: 22, clueFrom: 1,
    track: 'climbSky',
    background: '#C4DAF2', backgroundDeep: '#A6C6E8', surface: '#F0F6FD',
    text: '#17293A', muted: '#4A6884', accent: '#2F6BA8',
    below: '#2F5BC4',
  },
  {
    key: 'strato', name: 'Stratosphere', from: 31, attempts: 6, fall: 22, clueFrom: 0,
    track: 'climbStrato',
    background: '#2A3A72', backgroundDeep: '#1A2450', surface: '#16204A',
    text: '#EDF1FC', muted: '#9FAEDC', accent: '#7F9DEB',
    below: '#6E93FF',
  },
  {
    // Between the indigo and the black: the last of the colour, and the tier
    // where a fall starts costing nearly half a day.
    key: 'thin', name: 'Thin air', from: 46, attempts: 6, fall: 22, clueFrom: 0,
    track: 'climbThin',
    background: '#141C40', backgroundDeep: '#0A0F26', surface: '#101838',
    text: '#E7ECFB', muted: '#8B99CC', accent: '#8AA4F2',
    below: '#7EA0FF',
  },
  {
    key: 'orbit', name: 'Orbit', from: 61, attempts: 5, fall: 22, clueFrom: 0,
    track: 'climbOrbit',
    background: '#080A12', backgroundDeep: '#020306', surface: '#141A2B',
    text: '#EAEDF8', muted: '#7C86A8', accent: '#8FA6FF',
  },
];

/** The top. Clearing it tops the climb out for the week. */
export const SUMMIT = 75;

export function arenaFor(level: number): Arena {
  let found = ARENAS[0];
  for (const a of ARENAS) if (level >= a.from) found = a;
  return found;
}

/** Where a fall puts you: every fifth level, and never out of your tier. */
export function checkpointFor(level: number): number {
  // Mirrors endless_checkpoint: every fifth level, never below the tier floor.
  // The tiers are fifteen deep and the checkpoints five apart, so without the
  // floor, reaching 46 and falling would drop you back into Stratosphere.
  return Math.max(Math.max(1, Math.floor(level / 5) * 5), arenaFor(level).from);
}

/** The next one up, for telling somebody what the current level is worth. */
export function nextCheckpoint(level: number): number | null {
  for (let n = level + 1; n <= SUMMIT; n++) if (checkpointFor(n) === n) return n;
  return null;
}

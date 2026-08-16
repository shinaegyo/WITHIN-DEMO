import type { Track } from './music';

/**
 * Which music the climb plays at a given level.
 *
 * Deliberately not the same ladder as the arenas. Stratosphere runs from 40 to
 * 79 - forty levels, twice the length of any other tier and several days of
 * climbing for most people - and one loop across all of it wears out long
 * before the sky changes. So it gets two: the sequencer that keeps the pressure
 * up through the fifties, and the sparse one from 60, where the air thins for a
 * second time and the climb starts leaning toward orbit.
 *
 * Everything else lines up with the arena it is painted for.
 */
const LADDER: [from: number, track: Track][] = [
  [80, 'climbOrbit'],
  [60, 'climbThin'],
  [40, 'climbStrato'],
  [20, 'climbSky'],
  [1, 'climbGround'],
];

export function climbTrack(level: number): Track {
  const found = LADDER.find(([from]) => level >= from);
  return found ? found[1] : 'climbGround';
}

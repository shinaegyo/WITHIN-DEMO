import { arenaFor } from '../theme/arenas';
import type { Track } from './music';

/**
 * Which music the climb plays at a given level.
 *
 * One ladder now. The tiers used to be four and the music five, split at 60 so
 * a forty-level Stratosphere would not wear out - and keeping two sets of
 * boundaries in step by hand was never going to survive a tuning pass. The
 * tiers are five deep now, one per track, so the sky and the sound change
 * together by construction.
 */
export function climbTrack(level: number): Track {
  return arenaFor(level).track as Track;
}

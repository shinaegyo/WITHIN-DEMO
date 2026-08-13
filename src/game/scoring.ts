import { MAX_ATTEMPTS } from './constants';

/**
 * Points awarded by the attempt number the player solved on.
 * Index 0 is the first attempt. Failing to solve scores nothing.
 *
 * The server recomputes this from its own record of the game — the client
 * value is only ever for display.
 */
const POINTS_BY_ATTEMPT = [100, 95, 90, 80, 70, 60, 50] as const;

export const MAX_POINTS = POINTS_BY_ATTEMPT[0];

export function scoreForAttempt(attemptNumber: number): number {
  if (attemptNumber < 1 || attemptNumber > MAX_ATTEMPTS) return 0;
  return POINTS_BY_ATTEMPT[attemptNumber - 1] ?? 0;
}

export function scoreForGame(solved: boolean, attemptsUsed: number): number {
  return solved ? scoreForAttempt(attemptsUsed) : 0;
}

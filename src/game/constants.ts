export const MAX_ATTEMPTS = 7;
export const MIN_NUMBER = 1;
export const MAX_NUMBER = 1000;

/**
 * The day the new scoring starts counting, matching points_epoch() on the
 * server.
 *
 * Also the day the games start needing the daily. Today's play counts toward
 * nothing, so making somebody finish three rounds to unlock Rush would be
 * charging them for a day the game has already written off - the lock begins
 * when the points do.
 */
export const POINTS_EPOCH = '2026-08-17';

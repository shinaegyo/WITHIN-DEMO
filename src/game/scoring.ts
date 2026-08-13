export const TOTAL_ROUNDS = 3;
export const MAX_ROUND_SCORE = 100;
export const MAX_DAILY_SCORE = TOTAL_ROUNDS * MAX_ROUND_SCORE;

/** Attempt 1 scores 100, dropping by 10 each attempt to 40 on the 7th. */
export function scoreForAttempt(attemptNumber: number): number {
  if (attemptNumber < 1 || attemptNumber > 7) return 0;
  return 110 - 10 * attemptNumber;
}

/** Attempts never drop below this, however many finals you scrape through. */
export const MIN_ATTEMPTS = 3;

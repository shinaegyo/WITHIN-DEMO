/**
 * Metallics for the top three, shared by the leaderboard and the home preview.
 *
 * Deliberately outside the game palette: blue and red already mean "too low"
 * and "too high" on the board, and reusing them for placement would blur that.
 */
export const MEDALS: Record<number, { ring: string; ink: string }> = {
  1: { ring: '#D4A017', ink: '#3A2A00' },
  2: { ring: '#AEB6BF', ink: '#2A2F35' },
  3: { ring: '#B87333', ink: '#3A1F0A' },
};

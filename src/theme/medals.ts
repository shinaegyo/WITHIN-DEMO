/**
 * Metallics for the top three, shared by every board and the player card.
 *
 * Gold, silver and bronze are older than any of this and everyone can read them
 * without being taught, which is worth more on a leaderboard than looking like
 * the brand. Blue and red do their work in the mark, the tiles and the level
 * bar - places where they carry meaning rather than rank.
 *
 * Ties share a rank, so two players level on points wear the same metal.
 */
export const MEDALS: Record<number, { ring: string; ink: string }> = {
  1: { ring: '#D4A017', ink: '#3A2A00' },
  2: { ring: '#AEB6BF', ink: '#2A2F35' },
  3: { ring: '#B87333', ink: '#3A1F0A' },
};

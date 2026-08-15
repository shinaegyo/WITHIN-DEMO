/**
 * The top three, in the brand pair.
 *
 * These were metallics, kept outside the game palette on the grounds that blue
 * and red already mean "too low" and "too high" and reusing them for placement
 * would blur it. That argument holds on a board you are guessing on. It does
 * not hold on a leaderboard, where there is no number to be above or below and
 * nothing to misread - and gold, silver and bronze are the one part of the app
 * that could have belonged to any game.
 *
 * Red for first because the scale runs cold to hot, blue for second, and slate
 * for third rather than a blend: the midpoint of this pair is mauve, which is
 * the muddiest colour either of them makes.
 */
export const MEDALS: Record<number, { ring: string; ink: string }> = {
  1: { ring: '#E5412F', ink: '#FFF1EE' },
  2: { ring: '#5B92DF', ink: '#F2F8FF' },
  3: { ring: '#8C97A8', ink: '#12161C' },
};

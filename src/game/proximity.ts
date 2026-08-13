import { Direction, GuessResult, ProximityTier } from './types';

/**
 * Maps an absolute distance to a proximity tier.
 * Tiers get more "intense" the closer the guess is to the answer.
 * NOTE: the numeric distance itself must never be shown to the player —
 * only the tier/direction derived here.
 */
function tierForDistance(distance: number): ProximityTier {
  if (distance <= 10) return 'intense';
  if (distance <= 24) return 'dark';
  if (distance <= 99) return 'medium';
  // The far end is split three ways. It covers most of the range and is where
  // an opening guess lands, so a single band there told the player almost
  // nothing beyond a direction.
  if (distance <= 249) return 'light';
  if (distance <= 499) return 'distant';
  return 'vast';
}

/**
 * Short label describing the proximity band, shown on the guess tile.
 * Deliberately a *band*, never the exact distance — the only precise
 * readings are ONE AWAY and CORRECT, which are intentional spec moments.
 */
export function getBandLabel(result: GuessResult): string {
  if (result.isCorrect) return 'CORRECT';
  if (result.isOneAway) return 'ONE AWAY';
  if (result.isWithin10) return 'WITHIN 10';
  if (result.tier === 'dark') return '11–24 AWAY';
  if (result.tier === 'medium') return '25–99 AWAY';
  if (result.tier === 'light') return '100–249 AWAY';
  if (result.tier === 'distant') return '250–499 AWAY';
  return '500+ AWAY';
}

export function evaluateGuess(guess: number, answer: number): GuessResult {
  const distance = Math.abs(guess - answer);
  const isCorrect = distance === 0;
  const direction: Direction = isCorrect ? 'correct' : guess < answer ? 'below' : 'above';
  const tier: ProximityTier = isCorrect ? 'correct' : tierForDistance(distance);

  return {
    guess,
    direction,
    tier,
    distance,
    isWithin10: !isCorrect && distance <= 10,
    isOneAway: !isCorrect && distance === 1,
    isCorrect,
  };
}

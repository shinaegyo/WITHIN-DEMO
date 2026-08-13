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
  return 'light';
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

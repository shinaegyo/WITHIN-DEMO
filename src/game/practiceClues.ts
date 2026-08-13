import { MAX_NUMBER, MIN_NUMBER } from './constants';

/**
 * Clue generation for practice rounds only.
 *
 * The daily puzzle's clues are authored server-side by
 * scripts/generate-puzzles.mjs and must stay there — deriving them on the
 * device would mean the device knows the answer. Practice has no such
 * constraint: the number is local and unranked, so there is nothing to
 * protect and nothing to cheat.
 */

const digits = (n: number) => String(n).split('').map(Number);
const digitSum = (n: number) => digits(n).reduce((s, d) => s + d, 0);
const hasRepeat = (n: number) => new Set(digits(n)).size !== digits(n).length;

function isPrime(n: number): boolean {
  if (n < 2) return false;
  for (let i = 2; i * i <= n; i += 1) if (n % i === 0) return false;
  return true;
}

interface Clue {
  text: string;
  holds: (n: number) => boolean;
}

const CLUE_1: Clue[] = [
  { text: 'The number is even.', holds: (n) => n % 2 === 0 },
  { text: 'The number is odd.', holds: (n) => n % 2 === 1 },
  { text: 'The number is divisible by 3.', holds: (n) => n % 3 === 0 },
  { text: 'The number is divisible by 5.', holds: (n) => n % 5 === 0 },
  ...Array.from({ length: 10 }, (_, d) => ({
    text: `The number ends in ${d}.`,
    holds: (n: number) => n % 10 === d,
  })),
];

const CLUE_2: Clue[] = [
  ...Array.from({ length: 28 }, (_, i) => ({
    text: `The digits add up to ${i}.`,
    holds: (n: number) => digitSum(n) === i,
  })),
  ...[4, 6, 7, 9, 11].map((k) => ({
    text: `The number is divisible by ${k}.`,
    holds: (n: number) => n % k === 0,
  })),
  ...Array.from({ length: 10 }, (_, d) => ({
    text: `The number contains the digit ${d}.`,
    holds: (n: number) => digits(n).includes(d),
  })),
  { text: 'The number is prime.', holds: isPrime },
  { text: 'The number is not prime.', holds: (n) => !isPrime(n) },
  { text: 'The number is greater than 500.', holds: (n) => n > 500 },
  { text: 'The number is less than 500.', holds: (n) => n < 500 },
  { text: 'The number contains a repeated digit.', holds: hasRepeat },
];

const ALL = Array.from({ length: MAX_NUMBER - MIN_NUMBER + 1 }, (_, i) => i + MIN_NUMBER);

const pick = <T,>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)];

export interface PracticeRound {
  answer: number;
  clue1: string;
  clue2: string;
}

export function createPracticeRound(): PracticeRound {
  const answer = MIN_NUMBER + Math.floor(Math.random() * (MAX_NUMBER - MIN_NUMBER + 1));

  const clue1 = pick(CLUE_1.filter((c) => c.holds(answer)));

  // Same guard the daily generator uses: a clue pair that narrows 1-1000 to a
  // handful of numbers gives the answer away.
  const options = CLUE_2.filter(
    (c) => c.holds(answer) && ALL.filter((n) => clue1.holds(n) && c.holds(n)).length >= 8,
  );
  const clue2 = options.length > 0 ? pick(options) : pick(CLUE_2.filter((c) => c.holds(answer)));

  return { answer, clue1: clue1.text, clue2: clue2.text };
}

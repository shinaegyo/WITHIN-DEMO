import { MAX_NUMBER, MIN_NUMBER } from './constants';

/**
 * Clue generation for practice rounds only.
 *
 * The daily puzzle's clues are authored server-side and must stay there —
 * deriving them on the device would mean the device knows the answer. Practice
 * has no such constraint: the number is local and unranked, so there is nothing
 * to protect and nothing to cheat.
 *
 * The clues here mirror public.pick_clue1 exactly — same facts, same wording,
 * same rule about which ones are worth saying. Practice is where people learn
 * what a clue looks like, so it cannot speak a different language from the game
 * it is practice for.
 */

const digits = (n: number) => String(n).split('').map(Number);
const digitSum = (n: number) => digits(n).reduce((s, d) => s + d, 0);

interface Clue {
  text: string;
  holds: (n: number) => boolean;
}

const first = (n: number) => digits(n)[0];
const last = (n: number) => digits(n)[digits(n).length - 1];

const CLUES: Clue[] = [
  { text: 'It is a single digit.', holds: (n) => digits(n).length === 1 },
  { text: 'It has two digits.', holds: (n) => digits(n).length === 2 },
  { text: 'It has three digits.', holds: (n) => digits(n).length === 3 },
  { text: 'It has four digits.', holds: (n) => digits(n).length === 4 },

  ...Array.from({ length: 9 }, (_, i) => i + 1).map((d) => ({
    text: `It starts with a${d === 8 ? 'n' : ''} ${d}.`,
    holds: (n: number) => first(n) === d,
  })),
  ...Array.from({ length: 10 }, (_, d) => ({
    text: `It ends in a${d === 8 ? 'n' : ''} ${d}.`,
    holds: (n: number) => last(n) === d,
  })),

  {
    text: 'Each digit is bigger than the one before it, like 245.',
    holds: (n) => digits(n).length > 1 && digits(n).every((d, i, a) => i === 0 || a[i - 1] < d),
  },
  {
    text: 'Each digit is smaller than the one before it, like 852.',
    holds: (n) => digits(n).length > 1 && digits(n).every((d, i, a) => i === 0 || a[i - 1] > d),
  },
  {
    text: 'It reads the same backwards, like 262.',
    holds: (n) => String(n) === String(n).split('').reverse().join(''),
  },
  { text: 'Two of its digits are the same, like 447.', holds: (n) => new Set(digits(n)).size !== digits(n).length },
  { text: 'No digit appears twice.', holds: (n) => new Set(digits(n)).size === digits(n).length },
  { text: 'There is a 0 in it.', holds: (n) => digits(n).includes(0) },

  { text: 'The first digit and the last digit are both even.', holds: (n) => first(n) % 2 === 0 && last(n) % 2 === 0 },
  { text: 'The first digit and the last digit are both odd.', holds: (n) => first(n) % 2 === 1 && last(n) % 2 === 1 },
  { text: 'The first digit is bigger than the last digit.', holds: (n) => first(n) > last(n) },
  { text: 'The last digit is bigger than the first digit.', holds: (n) => last(n) > first(n) },
  { text: 'It starts and ends on the same digit, like 727.', holds: (n) => digits(n).length > 1 && first(n) === last(n) },

  {
    text: 'The middle digit is the biggest of the three, like 391.',
    holds: (n) => digits(n).length === 3 && digits(n)[1] > digits(n)[0] && digits(n)[1] > digits(n)[2],
  },
  {
    text: 'The middle digit is the smallest of the three, like 715.',
    holds: (n) => digits(n).length === 3 && digits(n)[1] < digits(n)[0] && digits(n)[1] < digits(n)[2],
  },

  { text: 'Its digits add up to less than 10.', holds: (n) => digitSum(n) < 10 },
  { text: 'Its digits add up to more than 20.', holds: (n) => digitSum(n) > 20 },
];

const ALL = Array.from({ length: MAX_NUMBER - MIN_NUMBER + 1 }, (_, i) => i + MIN_NUMBER);

/**
 * How many of 1–1000 a clue covers. Anything under 80 is close to naming the
 * answer; anything over 550 barely narrows the field. Same window the server
 * applies, so practice is neither easier nor harder than the real thing.
 */
const USABLE = CLUES.filter((c) => {
  const hits = ALL.filter(c.holds).length;
  return hits >= 80 && hits <= 550;
});

const pick = <T,>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)];

export interface PracticeRound {
  answer: number;
  clue1: string;
}

export function createPracticeRound(): PracticeRound {
  const answer = MIN_NUMBER + Math.floor(Math.random() * (MAX_NUMBER - MIN_NUMBER + 1));
  const options = USABLE.filter((c) => c.holds(answer));
  // Every number in range has at least four, but a fallback beats a crash.
  const clue = options.length > 0 ? pick(options) : CLUES[0];
  return { answer, clue1: clue.text };
}

function digitsOf(n: number): number[] {
  return String(n).split('').map(Number);
}

function digitSum(n: number): number {
  return digitsOf(n).reduce((sum, d) => sum + d, 0);
}

function hasRepeatedDigit(n: number): boolean {
  const digits = digitsOf(n);
  return new Set(digits).size !== digits.length;
}

function countEvenDigits(n: number): number {
  return digitsOf(n).filter((d) => d % 2 === 0).length;
}

interface ClueTemplate {
  id: string;
  applicable: (answer: number) => boolean;
  text: (answer: number) => string;
}

// Every template here must have at least one always-applicable entry
// so the clue pool is never empty for any answer in 1-1000.
const CLUE_1_TEMPLATES: ClueTemplate[] = [
  {
    id: 'parity',
    applicable: () => true,
    text: (answer) => (answer % 2 === 0 ? 'The number is even.' : 'The number is odd.'),
  },
  {
    id: 'endsIn',
    applicable: () => true,
    text: (answer) => `The number ends in ${answer % 10}.`,
  },
  {
    id: 'divisibleBy3',
    applicable: (answer) => answer % 3 === 0,
    text: () => 'The number is divisible by 3.',
  },
  {
    id: 'twoEvenDigits',
    applicable: (answer) => countEvenDigits(answer) >= 2,
    text: () => 'The number contains two even digits.',
  },
];

const CLUE_2_TEMPLATES: ClueTemplate[] = [
  {
    id: 'digitSum',
    applicable: () => true,
    text: (answer) => `The digits add up to ${digitSum(answer)}.`,
  },
  {
    id: 'divisibleBy7',
    applicable: (answer) => answer % 7 === 0,
    text: () => 'The number is divisible by 7.',
  },
  {
    id: 'repeatedDigit',
    applicable: (answer) => hasRepeatedDigit(answer),
    text: () => 'The number contains a repeated digit.',
  },
  {
    id: 'firstGreaterThanLast',
    applicable: (answer) => {
      const digits = digitsOf(answer);
      return digits[0] > digits[digits.length - 1];
    },
    text: () => 'The first digit is greater than the last digit.',
  },
];

function pickClue(templates: ClueTemplate[], answer: number, seedOffset: number): string {
  const applicable = templates.filter((t) => t.applicable(answer));
  const pick = applicable[(answer + seedOffset) % applicable.length];
  return pick.text(answer);
}

// Deterministic per-answer selection: same answer always yields the same clue,
// which matters once this is driven by a real daily answer shared by all players.
export function getInitialClue(answer: number): string {
  return pickClue(CLUE_1_TEMPLATES, answer, 0);
}

export function getSecondClue(answer: number): string {
  return pickClue(CLUE_2_TEMPLATES, answer, 5);
}

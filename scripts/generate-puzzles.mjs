/**
 * Generates the daily puzzle runway as reviewable SQL.
 *
 *   node scripts/generate-puzzles.mjs --start 2026-08-13 --days 1000
 *
 * Numbers are a deterministic shuffle of 1..1000, one per date, so no number
 * repeats for the whole run (~2.7 years) and re-running with the same seed
 * reproduces the identical schedule.
 *
 * This is the source of truth for clue text once Phase 2 is wired up — the
 * client stops generating clues and just renders what the server sends.
 */
import { writeFileSync } from 'node:fs';

const MIN = 1;
const MAX = 1000;

// ---------------------------------------------------------------- args

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : process.argv[i + 1];
}

const START = arg('start', new Date().toISOString().slice(0, 10));
const DAYS = Math.min(Number(arg('days', 1000)), MAX);
const SEED = Number(arg('seed', 20260813));
const OUT = arg('out', 'supabase/migrations/0002_seed_puzzles.sql');

// ------------------------------------------------------- deterministic rng

/** mulberry32 — small, seedable, good enough for shuffling a puzzle order. */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled(seed) {
  const next = rng(seed);
  const pool = Array.from({ length: MAX - MIN + 1 }, (_, i) => i + MIN);
  for (let i = pool.length - 1; i > 0; i -= 1) {
    const j = Math.floor(next() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool;
}

// ------------------------------------------------------------------ clues

const digits = (n) => String(n).split('').map(Number);
const digitSum = (n) => digits(n).reduce((s, d) => s + d, 0);
const hasRepeat = (n) => new Set(digits(n)).size !== digits(n).length;
const evenDigits = (n) => digits(n).filter((d) => d % 2 === 0).length;

function isPrime(n) {
  if (n < 2) return false;
  for (let i = 2; i * i <= n; i += 1) if (n % i === 0) return false;
  return true;
}

/**
 * Each clue is a predicate over 1..1000 plus its wording. Keeping the
 * predicate alongside the text is what lets us measure how much a clue pair
 * actually narrows the field.
 */
const CLUE_1 = [
  { id: 'even', text: 'The number is even.', holds: (n) => n % 2 === 0 },
  { id: 'odd', text: 'The number is odd.', holds: (n) => n % 2 === 1 },
  { id: 'div3', text: 'The number is divisible by 3.', holds: (n) => n % 3 === 0 },
  { id: 'div5', text: 'The number is divisible by 5.', holds: (n) => n % 5 === 0 },
  { id: 'twoEven', text: 'The number contains two even digits.', holds: (n) => evenDigits(n) >= 2 },
  ...Array.from({ length: 10 }, (_, d) => ({
    id: `ends${d}`,
    text: `The number ends in ${d}.`,
    holds: (n) => n % 10 === d,
  })),
];

const CLUE_2 = [
  ...Array.from({ length: 28 }, (_, i) => ({
    id: `sum${i}`,
    text: `The digits add up to ${i}.`,
    holds: (n) => digitSum(n) === i,
  })),
  ...[4, 6, 7, 9, 11].map((k) => ({
    id: `div${k}`,
    text: `The number is divisible by ${k}.`,
    holds: (n) => n % k === 0,
  })),
  ...Array.from({ length: 10 }, (_, d) => ({
    id: `has${d}`,
    text: `The number contains the digit ${d}.`,
    holds: (n) => digits(n).includes(d),
  })),
  { id: 'sumEven', text: 'The digits add up to an even number.', holds: (n) => digitSum(n) % 2 === 0 },
  { id: 'sumOdd', text: 'The digits add up to an odd number.', holds: (n) => digitSum(n) % 2 === 1 },
  { id: 'prime', text: 'The number is prime.', holds: (n) => isPrime(n) },
  { id: 'notPrime', text: 'The number is not prime.', holds: (n) => !isPrime(n) },
  { id: 'over500', text: 'The number is greater than 500.', holds: (n) => n > 500 },
  { id: 'under500', text: 'The number is less than 500.', holds: (n) => n < 500 },
  { id: 'repeat', text: 'The number contains a repeated digit.', holds: (n) => hasRepeat(n) },
  {
    id: 'firstGtLast',
    text: 'The first digit is greater than the last digit.',
    holds: (n) => {
      const d = digits(n);
      return d[0] > d[d.length - 1];
    },
  },
  { id: 'square', text: 'The number is a perfect square.', holds: (n) => Number.isInteger(Math.sqrt(n)) },
];

const ALL = Array.from({ length: MAX - MIN + 1 }, (_, i) => i + MIN);

/** How many numbers in 1..1000 satisfy both clues? */
function candidates(c1, c2) {
  return ALL.filter((n) => c1.holds(n) && c2.holds(n)).length;
}

/**
 * Clue 1 should be broad; clue 2 should genuinely help without handing the
 * answer over. The floor matters: some pairs (e.g. "ends in 7" + "digits add
 * up to 25") leave exactly one candidate, which would give the game away.
 */
const MIN_CANDIDATES_AFTER_BOTH = 8;
const MIN_CANDIDATES_CLUE_1 = 90;

function pickClues(answer, next) {
  const c1Options = CLUE_1.filter(
    (c) => c.holds(answer) && ALL.filter(c.holds).length >= MIN_CANDIDATES_CLUE_1,
  );
  const c1 = c1Options[Math.floor(next() * c1Options.length)];

  const c2Options = CLUE_2.filter(
    (c) => c.holds(answer) && candidates(c1, c) >= MIN_CANDIDATES_AFTER_BOTH,
  );
  if (c2Options.length === 0) return null; // caller retries with another clue 1
  const c2 = c2Options[Math.floor(next() * c2Options.length)];

  return { c1, c2, remaining: candidates(c1, c2) };
}

// ------------------------------------------------------------------ build

const order = shuffled(SEED);
const next = rng(SEED ^ 0x9e3779b9);
const rows = [];
let tightest = Infinity;

for (let i = 0; i < DAYS; i += 1) {
  const answer = order[i];

  let clues = null;
  for (let attempt = 0; attempt < 40 && !clues; attempt += 1) clues = pickClues(answer, next);
  if (!clues) {
    console.error(`no valid clue pair for ${answer}; widen the clue pool`);
    process.exit(1);
  }

  const date = new Date(`${START}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + i);

  tightest = Math.min(tightest, clues.remaining);
  rows.push({ date: date.toISOString().slice(0, 10), answer, clue1: clues.c1.text, clue2: clues.c2.text });
}

const esc = (s) => s.replace(/'/g, "''");

const sql = `-- Generated by scripts/generate-puzzles.mjs — do not edit by hand.
-- start=${START} days=${DAYS} seed=${SEED}
-- Numbers are a shuffle of 1..1000, so none repeats within this run.

insert into public.puzzles (puzzle_date, clue1, clue2) values
${rows.map((r) => `  ('${r.date}', '${esc(r.clue1)}', '${esc(r.clue2)}')`).join(',\n')}
on conflict (puzzle_date) do nothing;

insert into public.puzzle_answers (puzzle_date, answer) values
${rows.map((r) => `  ('${r.date}', ${r.answer})`).join(',\n')}
on conflict (puzzle_date) do nothing;
`;

writeFileSync(OUT, sql);

console.log(`wrote ${rows.length} puzzles to ${OUT}`);
console.log(`covers ${rows[0].date} through ${rows[rows.length - 1].date}`);
console.log(`tightest clue pair still leaves ${tightest} candidates`);
console.log('\nfirst few:');
for (const r of rows.slice(0, 3)) console.log(`  ${r.date}  ${String(r.answer).padStart(4)}  "${r.clue1}" / "${r.clue2}"`);

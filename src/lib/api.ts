import { GuessResult } from '../game/types';
import { deviceTimezone, ensureSignedIn, supabase } from './supabase';

/**
 * Thin wrapper over the database functions. Everything the game needs comes
 * from these two calls — the client no longer knows the answer, generates
 * clues, or decides whether a guess is legal.
 */

export interface PlayerStats {
  currentStreak: number;
  maxStreak: number;
  gamesPlayed: number;
  gamesWon: number;
  totalPoints: number;
}

export type ServerStatus = 'playing' | 'won' | 'lost';

export interface DailyGame {
  puzzleDate: string;
  clue1: string;
  clue2: string | null;
  maxAttempts: number;
  status: ServerStatus;
  attemptsUsed: number;
  score: number;
  answer: number | null;
  guesses: GuessResult[];
  stats: PlayerStats;
}

/** Errors the server may return that the UI needs to react to by name. */
export type ApiErrorCode =
  | 'duplicate_guess'
  | 'out_of_range'
  | 'already_played'
  | 'no_puzzle_today'
  | 'not_authenticated'
  | 'network';

export class ApiError extends Error {
  constructor(public code: ApiErrorCode | string) {
    super(code);
  }
}

/** The server omits `distance` deliberately; nothing in the UI may rely on it. */
function toGuessResult(raw: any): GuessResult {
  return {
    guess: raw.guess,
    direction: raw.direction,
    tier: raw.tier,
    distance: 0,
    isWithin10: !!raw.isWithin10,
    isOneAway: !!raw.isOneAway,
    isCorrect: !!raw.isCorrect,
  };
}

function unwrap<T>(data: any, error: any): T {
  if (error) throw new ApiError(error.message ?? 'network');
  if (data?.error) throw new ApiError(data.error);
  return data as T;
}

export async function loadDailyGame(): Promise<DailyGame> {
  await ensureSignedIn();

  // Cheap and idempotent; keeps the stored zone current if the player moves.
  // Never fatal — a failure here just leaves the previous zone in place.
  try {
    await supabase.rpc('set_timezone', { p_timezone: deviceTimezone() });
  } catch {
    /* ignore */
  }

  const { data, error } = await supabase.rpc('game_state');
  const raw = unwrap<any>(data, error);

  return {
    puzzleDate: raw.puzzleDate,
    clue1: raw.clue1,
    clue2: raw.clue2 ?? null,
    maxAttempts: raw.maxAttempts,
    status: raw.status,
    attemptsUsed: raw.attemptsUsed,
    score: raw.score,
    answer: raw.answer ?? null,
    guesses: (raw.guesses ?? []).map(toGuessResult),
    stats: raw.stats,
  };
}

export interface SubmitResult {
  result: GuessResult;
  status: ServerStatus;
  attemptsUsed: number;
  score: number;
  clue2: string | null;
  answer: number | null;
}

export async function submitGuess(guess: number): Promise<SubmitResult> {
  const { data, error } = await supabase.rpc('submit_guess', { p_guess: guess });
  const raw = unwrap<any>(data, error);

  return {
    result: toGuessResult(raw.guess),
    status: raw.status,
    attemptsUsed: raw.attemptsUsed,
    score: raw.score,
    clue2: raw.clue2 ?? null,
    answer: raw.answer ?? null,
  };
}

/** Human-readable text for the errors we surface inline. */
export function messageFor(code: string, guess?: number): string {
  switch (code) {
    case 'duplicate_guess':
      return `You already guessed ${guess}.`;
    case 'out_of_range':
      return 'Enter a number between 1 and 1000.';
    case 'already_played':
      return "You've already played today.";
    case 'no_puzzle_today':
      return 'No puzzle available. Please try again later.';
    default:
      return 'Connection problem. Check your network and try again.';
  }
}

import { GuessResult } from '../game/types';
import { deviceTimezone, ensureSignedIn, supabase } from './supabase';

/**
 * Thin wrapper over the database functions. The client never learns an answer,
 * generates a clue, or decides whether a guess is legal — a day is three
 * rounds and the server owns all of it.
 */

export interface PlayerStats {
  currentStreak: number;
  maxStreak: number;
  gamesPlayed: number;
  gamesWon: number;
  totalPoints: number;
}

/** The day as a whole. */
export type DayStatus = 'playing' | 'complete' | 'eliminated';
/** A single round within the day. */
export type RoundStatus = 'playing' | 'won' | 'lost';

export interface RoundSummary {
  round: number;
  /** One entry per guess: 'below' | 'above' | 'correct'. Drives the share grid. */
  marks: string[];
  status: RoundStatus;
  score: number;
  attemptsUsed: number;
  attemptsAllowed: number;
  /** True once replayed after an elimination — such a round scores nothing. */
  retried: boolean;
}

export interface CurrentRound {
  round: number;
  status: RoundStatus;
  attemptsUsed: number;
  attemptsAllowed: number;
  score: number;
  clue1: string;
  clue2: string | null;
  answer: number | null;
  retried: boolean;
  guesses: GuessResult[];
}

const MAX_DAILY_SCORE_FALLBACK = 300;

/**
 * The day's twist or bonus. Named and described by the server so there is one
 * list of them rather than a copy here that would drift.
 */
export interface DayModifier {
  id: string;
  kind: 'standard' | 'twist' | 'bonus';
  label: string;
  detail: string;
}

export interface DailyGame {
  puzzleDate: string;
  modifier: DayModifier;
  /** 300 normally; scaled by the day's multiplier. */
  maxScore: number;
  /** Days since launch, so a shared result can name the puzzle. */
  puzzleNumber: number;
  dayStatus: DayStatus;
  currentRound: number;
  totalRounds: number;
  totalScore: number;
  retriesUsed: number;
  /** The player chose to stop; only then is the answer shown. */
  gaveUp: boolean;
  canRetry: boolean;
  round: CurrentRound;
  rounds: RoundSummary[];
  stats: PlayerStats;
}

export type ApiErrorCode =
  | 'duplicate_guess'
  | 'out_of_range'
  | 'already_played'
  | 'eliminated'
  | 'round_over'
  | 'no_puzzle_today'
  | 'not_authenticated'
  | 'network';

export class ApiError extends Error {
  constructor(public code: ApiErrorCode | string) {
    super(code);
  }
}

/** `distance` is deliberately absent from the server payload. */
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

function toRound(raw: any): CurrentRound {
  return {
    round: raw.round,
    status: raw.status,
    attemptsUsed: raw.attemptsUsed,
    attemptsAllowed: raw.attemptsAllowed,
    score: raw.score,
    clue1: raw.clue1,
    clue2: raw.clue2 ?? null,
    answer: raw.answer ?? null,
    retried: !!raw.retried,
    guesses: (raw.guesses ?? []).map(toGuessResult),
  };
}

export async function loadDailyGame(): Promise<DailyGame> {
  await ensureSignedIn();

  try {
    await supabase.rpc('set_timezone', { p_timezone: deviceTimezone() });
  } catch {
    /* a failure here just leaves the previous zone in place */
  }

  const { data, error } = await supabase.rpc('game_state');
  const raw = unwrap<any>(data, error);

  return {
    puzzleDate: raw.puzzleDate,
    puzzleNumber: raw.puzzleNumber ?? 0,
    // Older servers predate modifiers, and older ones still sent a bare
    // string; an ordinary day is the safe reading for both.
    modifier:
      raw.modifier && typeof raw.modifier === 'object'
        ? (raw.modifier as DayModifier)
        : { id: 'standard', kind: 'standard', label: '', detail: '' },
    maxScore: raw.maxScore ?? MAX_DAILY_SCORE_FALLBACK,
    dayStatus: raw.dayStatus,
    currentRound: raw.currentRound,
    totalRounds: raw.totalRounds ?? 3,
    totalScore: raw.totalScore ?? 0,
    retriesUsed: raw.retriesUsed ?? 0,
    gaveUp: !!raw.gaveUp,
    canRetry: !!raw.canRetry,
    round: toRound(raw.round),
    rounds: (raw.rounds ?? []).map((r: any) => ({ ...r, marks: r.marks ?? [] })),
    stats: raw.stats,
  };
}

export interface SubmitResult {
  result: GuessResult;
  dayStatus: DayStatus;
  roundStatus: RoundStatus;
  currentRound: number;
  totalScore: number;
  roundScore: number;
  attemptsUsed: number;
  attemptsAllowed: number;
  nextAttemptsAllowed: number | null;
  retried: boolean;
  canRetry: boolean;
  clue2: string | null;
  answer: number | null;
}

export async function submitGuess(guess: number): Promise<SubmitResult> {
  const { data, error } = await supabase.rpc('submit_guess', { p_guess: guess });
  const raw = unwrap<any>(data, error);

  return {
    result: toGuessResult(raw.guess),
    dayStatus: raw.dayStatus,
    roundStatus: raw.roundStatus,
    currentRound: raw.currentRound,
    totalScore: raw.totalScore,
    roundScore: raw.roundScore ?? 0,
    attemptsUsed: raw.attemptsUsed,
    attemptsAllowed: raw.attemptsAllowed,
    nextAttemptsAllowed: raw.nextAttemptsAllowed ?? null,
    retried: !!raw.retried,
    canRetry: !!raw.canRetry,
    clue2: raw.clue2 ?? null,
    answer: raw.answer ?? null,
  };
}

/**
 * Replays the round the player was eliminated on.
 *
 * The rewarded ad is a client concern and is currently stubbed — see
 * RetryOverlay. The server only checks that there is something to retry, so
 * swapping in a real ad later needs no change here.
 */
/** Ends the day deliberately, which is what makes the answer safe to show. */
export async function giveUp(): Promise<boolean> {
  const { data, error } = await supabase.rpc('give_up');
  return !error && !data?.error;
}

export async function retryRound(): Promise<boolean> {
  const { data, error } = await supabase.rpc('retry_round');
  return !error && !data?.error;
}

export interface LeaderboardEntry {
  rank: number;
  name: string;
  score: number;
  isMe: boolean;
  /** False for a day that ended in elimination rather than all three rounds. */
  isComplete: boolean;
  roundsWon: number;
}

export interface AllTimeEntry {
  rank: number;
  name: string;
  score: number;
  daysPlayed: number;
  bestStreak: number;
  /** ISO timestamp of the player's most recent guess, or null. */
  lastPlayedAt: string | null;
  isMe: boolean;
}

export interface AllTimeLeaderboard {
  entries: AllTimeEntry[];
  totalPlayers: number;
}

export interface Leaderboard {
  /** People part-way through today, so the finished count can explain itself. */
  stillPlaying: number;
  puzzleDate: string;
  entries: LeaderboardEntry[];
  totalPlayers: number;
}

/** The long game: cumulative points across every day played. */
export interface FriendsState {
  friends: string[];
  /** Requests waiting on you. */
  incoming: string[];
  /** Requests you are waiting on. */
  outgoing: string[];
}

export type FriendAction =
  | 'requested'
  | 'accepted'
  | 'declined'
  | 'removed'
  | 'already_friends'
  | 'already_requested';

export async function loadFriends(): Promise<FriendsState> {
  await ensureSignedIn();
  const { data, error } = await supabase.rpc('friends_state');
  const raw = unwrap<any>(data, error);
  const names = (list: any) => (list ?? []).map((e: any) => e.name as string);
  return {
    friends: names(raw.friends),
    incoming: names(raw.incoming),
    outgoing: names(raw.outgoing),
  };
}

export async function sendFriendRequest(username: string): Promise<FriendAction> {
  await ensureSignedIn();
  const { data, error } = await supabase.rpc('send_friend_request', { p_username: username });
  return unwrap<any>(data, error).status;
}

export async function respondToFriendRequest(username: string, accept: boolean): Promise<FriendAction> {
  await ensureSignedIn();
  const { data, error } = await supabase.rpc('respond_friend_request', {
    p_username: username,
    p_accept: accept,
  });
  return unwrap<any>(data, error).status;
}

export async function removeFriend(username: string): Promise<FriendAction> {
  await ensureSignedIn();
  const { data, error } = await supabase.rpc('remove_friend', { p_username: username });
  return unwrap<any>(data, error).status;
}

/** Today's board narrowed to you and your friends. Same shape as the global one. */
export async function loadFriendsLeaderboard(): Promise<LeaderboardEntry[]> {
  await ensureSignedIn();
  const { data, error } = await supabase.rpc('friends_leaderboard');
  const raw = unwrap<any>(data, error);
  return (raw.entries ?? []).map((e: any) => ({
    rank: e.rank,
    name: e.name,
    score: e.score,
    isMe: !!e.is_me,
    isComplete: !!e.is_complete,
    roundsWon: e.rounds_won ?? 0,
  }));
}

/** Whether this account has already been shown the rules. */
export async function hasOnboarded(): Promise<boolean> {
  await ensureSignedIn();
  const { data, error } = await supabase.rpc('intro_state');
  return !!unwrap<any>(data, error).onboarded;
}

export async function markOnboarded(): Promise<void> {
  await ensureSignedIn();
  const { data, error } = await supabase.rpc('mark_onboarded');
  unwrap<any>(data, error);
}

export async function loadAllTimeLeaderboard(): Promise<AllTimeLeaderboard> {
  await ensureSignedIn();
  const { data, error } = await supabase.rpc('alltime_leaderboard', { p_limit: 100 });
  const raw = unwrap<any>(data, error);
  return {
    totalPlayers: raw.totalPlayers ?? 0,
    entries: (raw.entries ?? []).map((e: any) => ({
      rank: e.rank,
      name: e.name,
      score: e.score,
      daysPlayed: e.days_played ?? 0,
      bestStreak: e.best_streak ?? 0,
      lastPlayedAt: e.last_played_at ?? null,
      isMe: !!e.is_me,
    })),
  };
}

export async function loadLeaderboard(): Promise<Leaderboard> {
  await ensureSignedIn();
  const { data, error } = await supabase.rpc('daily_leaderboard', { p_limit: 50 });
  const raw = unwrap<any>(data, error);
  return {
    puzzleDate: raw.puzzleDate,
    totalPlayers: raw.totalPlayers ?? 0,
    stillPlaying: raw.stillPlaying ?? 0,
    entries: (raw.entries ?? []).map((e: any) => ({
      rank: e.rank,
      name: e.name,
      score: e.score,
      isMe: !!e.is_me,
      isComplete: !!e.is_complete,
      roundsWon: e.rounds_won ?? 0,
    })),
  };
}

/** Dev only; the server refuses unless the caller is on the tester allowlist. */
export async function devResetToday(): Promise<boolean> {
  const { data, error } = await supabase.rpc('dev_reset_today');
  return !error && !data?.error;
}

export function messageFor(code: string, guess?: number): string {
  switch (code) {
    case 'duplicate_guess':
      return `You already guessed ${guess} this round.`;
    case 'out_of_range':
      return 'Enter a number between 1 and 1000.';
    case 'already_played':
      return "You've already finished today.";
    case 'eliminated':
      return 'You ran out of attempts for today.';
    case 'round_over':
      return 'This round is already over.';
    case 'no_puzzle_today':
      return 'No puzzle available. Please try again later.';
    case 'no_such_user':
      return "No player with that name. Names are exact, apart from capitals.";
    case 'thats_you':
      return "That's your own name.";
    case 'no_such_request':
      return 'That request is no longer waiting.';
    default:
      return 'Connection problem. Check your network and try again.';
  }
}

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
  hasBelt: boolean;
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
export interface Friend {
  name: string;
  /** Checked in within the last couple of minutes. */
  online: boolean;
}

export interface FriendsState {
  friends: Friend[];
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
    friends: (raw.friends ?? []).map((e: any) => ({ name: e.name, online: !!e.online })),
    incoming: names(raw.incoming),
    outgoing: names(raw.outgoing),
  };
}

/** Heartbeat, so friends can see you are around. */
export async function touchPresence(): Promise<void> {
  try {
    await ensureSignedIn();
    await supabase.rpc('touch_presence');
  } catch {
    /* presence is a nicety; never let it surface */
  }
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

export interface DuelSummary {
  id: string;
  status: 'pending' | 'active' | 'complete';
  opponent: string;
  iChallenged: boolean;
  myDone: number;
  theirDone: number;
  /** A ranked match rather than a friendly. */
  ranked: boolean;
  /** A number is owed for the next round. */
  needsNumber: boolean;
  /** A round is open and waiting to be played. */
  needsPlay: boolean;
  outcome: 'won' | 'lost' | 'draw' | null;
  /** Positive for a run of wins against them, negative for losses. */
  streak: number;
}

export interface DuelRoundState {
  round: number;
  attemptsUsed: number;
  attemptsAllowed: number;
  clue1: string;
  guesses: GuessResult[];
}

export interface DuelRoundRow {
  round: number;
  settled: boolean;
  /** Who took it, once both have finished. */
  result: 'won' | 'lost' | 'tie' | null;
  mine: number | null;
  mineStatus: 'playing' | 'won' | 'lost' | null;
  theirs: number | null;
  theirStatus: 'playing' | 'won' | 'lost' | null;
  /** The numbers, once the round is settled: what each of you set. */
  iSet: number | null;
  theySet: number | null;
}

export interface DuelState {
  id: string;
  status: 'pending' | 'active' | 'complete' | 'declined';
  opponent: string;
  outcome: 'won' | 'lost' | 'draw' | null;
  round: DuelRoundState | null;
  /** True while the other player still has an earlier round open. */
  waitingForThem: boolean;
  /** The round wanting a number from you, or null if none is owed. */
  pickRound: number | null;
  /** You have set yours and are waiting on theirs. */
  pickSubmitted: boolean;
  rounds: DuelRoundRow[];
}

export async function loadDuels(): Promise<DuelSummary[]> {
  await ensureSignedIn();
  const { data, error } = await supabase.rpc('duel_list');
  const raw = unwrap<any>(data, error);
  return (raw.duels ?? []).map((d: any) => ({
    id: d.id,
    status: d.status,
    opponent: d.opponent,
    iChallenged: !!d.i_challenged,
    myDone: d.my_done ?? 0,
    theirDone: d.their_done ?? 0,
    ranked: !!d.ranked,
    needsNumber: !!d.needs_number,
    needsPlay: !!d.needs_play,
    outcome: d.outcome ?? null,
    streak: d.streak ?? 0,
  }));
}

export async function challengeFriend(username: string): Promise<string> {
  await ensureSignedIn();
  const { data, error } = await supabase.rpc('challenge_friend', { p_username: username });
  return unwrap<any>(data, error).status;
}

export async function respondToDuel(duelId: string, accept: boolean): Promise<string> {
  await ensureSignedIn();
  const { data, error } = await supabase.rpc('respond_duel', {
    p_duel_id: duelId,
    p_accept: accept,
  });
  return unwrap<any>(data, error).status;
}

/** What each mode is worth opening for, gathered in one call. */
export interface HomeStatus {
  duelsWaiting: number;
  ranked: {
    rating: number | null;
    played: number;
    queued: boolean;
    inMatch: boolean;
    needsMe: boolean;
    beltHolder: string | null;
    iHoldBelt: boolean;
  };
  impossible: { runsLeft: number; best: number };
}

export async function loadHomeStatus(): Promise<HomeStatus> {
  await ensureSignedIn();
  const { data, error } = await supabase.rpc('home_status');
  const raw = unwrap<any>(data, error);
  return {
    duelsWaiting: raw.duelsWaiting ?? 0,
    ranked: {
      rating: raw.ranked?.rating ?? null,
      played: raw.ranked?.played ?? 0,
      queued: !!raw.ranked?.queued,
      inMatch: !!raw.ranked?.inMatch,
      needsMe: !!raw.ranked?.needsMe,
      beltHolder: raw.ranked?.beltHolder ?? null,
      iHoldBelt: !!raw.ranked?.iHoldBelt,
    },
    impossible: {
      runsLeft: raw.impossible?.runsLeft ?? 0,
      best: raw.impossible?.best ?? 0,
    },
  };
}

export interface RankedEntry {
  rank: number;
  name: string;
  rating: number;
  won: number;
  lost: number;
  isMe: boolean;
  hasBelt: boolean;
}

export interface RankedState {
  rating: number;
  played: number;
  won: number;
  lost: number;
  drawn: number;
  /** Still in placement matches, where the rating swings hardest. */
  placing: boolean;
  rank: number;
  of: number;
  queued: boolean;
  /** Others waiting, so an empty queue can say so. */
  waiting: number;
  beltHolder: string | null;
  iHoldBelt: boolean;
  match: { id: string; opponent: string } | null;
  board: RankedEntry[];
}

export async function loadRanked(): Promise<RankedState> {
  await ensureSignedIn();
  const { data, error } = await supabase.rpc('ranked_state');
  const raw = unwrap<any>(data, error);
  return {
    rating: raw.rating ?? 1000,
    played: raw.played ?? 0,
    won: raw.won ?? 0,
    lost: raw.lost ?? 0,
    drawn: raw.drawn ?? 0,
    placing: !!raw.placing,
    rank: raw.rank ?? 0,
    of: raw.of ?? 0,
    queued: !!raw.queued,
    waiting: raw.waiting ?? 0,
    beltHolder: raw.beltHolder ?? null,
    iHoldBelt: !!raw.iHoldBelt,
    match: raw.match ?? null,
    board: (raw.board ?? []).map((e: any) => ({
      rank: e.rank,
      name: e.name,
      rating: e.rating,
      won: e.won ?? 0,
      lost: e.lost ?? 0,
      isMe: !!e.is_me,
      hasBelt: !!e.has_belt,
    })),
  };
}

/** Queue for a match, or take one if somebody is already waiting. */
export async function findRankedMatch(): Promise<{ status: 'queued' | 'matched'; duelId?: string }> {
  await ensureSignedIn();
  const { data, error } = await supabase.rpc('ranked_find');
  const raw = unwrap<any>(data, error);
  return { status: raw.status, duelId: raw.duelId };
}

export async function leaveRankedQueue(): Promise<void> {
  await ensureSignedIn();
  const { data, error } = await supabase.rpc('ranked_leave_queue');
  unwrap<any>(data, error);
}

/**
 * Leave a duel. An accepted one goes to the other player; a challenge nobody
 * has answered is simply withdrawn.
 */
export async function forfeitDuel(duelId: string): Promise<'forfeited' | 'withdrawn'> {
  await ensureSignedIn();
  const { data, error } = await supabase.rpc('duel_forfeit', { p_duel_id: duelId });
  return unwrap<any>(data, error).status;
}

/** The number your opponent will be hunting this round. */
export async function setDuelNumber(duelId: string, value: number): Promise<void> {
  await ensureSignedIn();
  const { data, error } = await supabase.rpc('duel_set_number', {
    p_duel_id: duelId,
    p_number: value,
  });
  unwrap<any>(data, error);
}

export async function loadDuel(duelId: string): Promise<DuelState> {
  await ensureSignedIn();
  const { data, error } = await supabase.rpc('duel_state', { p_duel_id: duelId });
  const raw = unwrap<any>(data, error);
  return {
    id: raw.id,
    status: raw.status,
    opponent: raw.opponent,
    outcome: raw.outcome ?? null,
    round: raw.round
      ? {
          round: raw.round.round,
          attemptsUsed: raw.round.attemptsUsed,
          attemptsAllowed: raw.round.attemptsAllowed,
          clue1: raw.round.clue1,
          guesses: (raw.round.guesses ?? []).map(toGuessResult),
        }
      : null,
    waitingForThem: !!raw.waitingForThem,
    pickRound: raw.pickRound ?? null,
    pickSubmitted: !!raw.pickSubmitted,
    rounds: raw.rounds ?? [],
  };
}

export async function duelGuess(duelId: string, guess: number) {
  await ensureSignedIn();
  const { data, error } = await supabase.rpc('duel_guess', {
    p_duel_id: duelId,
    p_guess: guess,
  });
  const raw = unwrap<any>(data, error);
  return {
    roundStatus: raw.roundStatus as 'playing' | 'won' | 'lost',
    attemptsUsed: raw.attemptsUsed as number,
    attemptsAllowed: raw.attemptsAllowed as number,
    result: toGuessResult(raw.guess),
    answer: (raw.answer ?? null) as number | null,
  };
}

export interface EndlessState {
  week: string;
  level: number;
  attemptsUsed: number;
  attemptsAllowed: number;
  /** One clue. There is no bonus clue in any mode. */
  clue1: string;
  guesses: GuessResult[];
  best: number;
  runsLeft: number;
  hasRun: boolean;
}

export interface EndlessEntry {
  rank: number;
  name: string;
  depth: number;
  isMe: boolean;
}

export async function loadEndless(): Promise<EndlessState> {
  await ensureSignedIn();
  const { data, error } = await supabase.rpc('endless_state');
  const raw = unwrap<any>(data, error);
  return {
    week: raw.week,
    level: raw.level,
    attemptsUsed: raw.attemptsUsed,
    attemptsAllowed: raw.attemptsAllowed,
    clue1: raw.clue1,
    guesses: (raw.guesses ?? []).map(toGuessResult),
    best: raw.best ?? 0,
    runsLeft: raw.runsLeft ?? 0,
    hasRun: !!raw.hasRun,
  };
}

export async function endlessGuess(guess: number) {
  await ensureSignedIn();
  const { data, error } = await supabase.rpc('endless_guess', { p_guess: guess });
  const raw = unwrap<any>(data, error);
  return {
    solved: !!raw.solved,
    runOver: !!raw.runOver,
    level: raw.level as number,
    attemptsAllowed: raw.attemptsAllowed as number,
    result: toGuessResult(raw.guess),
    answer: (raw.answer ?? null) as number | null,
  };
}

export async function endlessRestart(): Promise<void> {
  await ensureSignedIn();
  const { data, error } = await supabase.rpc('endless_restart');
  unwrap<any>(data, error);
}

export async function loadEndlessBoard(): Promise<EndlessEntry[]> {
  await ensureSignedIn();
  const { data, error } = await supabase.rpc('endless_leaderboard', { p_limit: 50 });
  const raw = unwrap<any>(data, error);
  return (raw.entries ?? []).map((e: any) => ({
    rank: e.rank,
    name: e.name,
    depth: e.depth,
    isMe: !!e.is_me,
  }));
}

/** One player, as seen by someone else: what a name on a board is worth. */
export interface PlayerCard {
  name: string;
  isMe: boolean;
  friendship: 'none' | 'sent' | 'received' | 'friends';
  online: boolean;
  points: number;
  daysPlayed: number;
  streak: number;
  bestStreak: number;
  rank: number;
  of: number;
  /** Holds the one belt in the game. */
  hasBelt: boolean;
  /** Null until they have played a ranked match. */
  ranked: { rating: number; won: number; lost: number } | null;
  lastPlayedAt: string | null;
  /** Today's score, only once their day is finished. */
  todayScore: number | null;
  /** Numbers cleared in this week's Impossible, or null if they haven't run it. */
  impossible: number | null;
  /** The head-to-head, from your side. Null when the card is your own. */
  duels: { won: number; lost: number; drawn: number; streak: number } | null;
}

export async function loadPlayerCard(username: string): Promise<PlayerCard> {
  await ensureSignedIn();
  const { data, error } = await supabase.rpc('player_card', { p_username: username });
  const raw = unwrap<any>(data, error);
  return {
    name: raw.name,
    isMe: !!raw.isMe,
    friendship: raw.friendship ?? 'none',
    online: !!raw.online,
    points: raw.points ?? 0,
    daysPlayed: raw.daysPlayed ?? 0,
    streak: raw.streak ?? 0,
    bestStreak: raw.bestStreak ?? 0,
    rank: raw.rank ?? 0,
    of: raw.of ?? 0,
    hasBelt: !!raw.hasBelt,
    ranked: raw.ranked ?? null,
    lastPlayedAt: raw.lastPlayedAt ?? null,
    todayScore: raw.today?.score ?? null,
    impossible: raw.impossible ?? null,
    duels: raw.duels
      ? {
          won: raw.duels.won ?? 0,
          lost: raw.duels.lost ?? 0,
          drawn: raw.duels.drawn ?? 0,
          streak: raw.duels.streak ?? 0,
        }
      : null,
  };
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
      hasBelt: !!e.has_belt,
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
    case 'no_such_player':
      return "No player with that name. Names are exact, apart from capitals.";
    case 'thats_you':
      return "That's your own name.";
    case 'no_such_request':
      return 'That request is no longer waiting.';
    case 'not_friends':
      return 'You can only challenge someone you are friends with.';
    case 'duel_already_open':
      return 'You already have a duel going with them.';
    case 'no_such_duel':
      return 'That duel is no longer available.';
    case 'ranked_already_open':
      return 'Finish your ranked match first.';
    case 'no_such_challenge':
      return 'That challenge is no longer waiting.';
    case 'waiting_for_them':
      return 'They still have this round to play.';
    case 'not_picking':
      return 'No number to set right now.';
    case 'already_set':
      return "You've already set their number for this round.";
    case 'no_run':
      return 'No run in progress. Start a new one.';
    case 'no_runs_left':
      return "That's all five runs for today. More tomorrow.";
    default:
      return 'Connection problem. Check your network and try again.';
  }
}

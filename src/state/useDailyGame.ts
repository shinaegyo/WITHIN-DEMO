import { useCallback, useEffect, useState } from 'react';
import { ClueKind } from '../components/ChooseYourClue';
import { GuessResult } from '../game/types';
import {
  ApiError,
  DailyGame,
  dailyBet,
  dailyCall,
  dailyClue,
  devResetToday,
  loadDailyGame,
  messageFor,
  giveUp,
  retryRound,
  submitGuess,
  SubmitResult,
} from '../lib/api';
import { signOutForTesting } from '../lib/supabase';

type Phase = 'loading' | 'ready' | 'failed';

export interface UseDailyGameResult {
  phase: Phase;
  game: DailyGame | null;
  loadError: string | null;
  submitting: boolean;
  /** The most recent guess, for triggering feedback animations. */
  lastResult: GuessResult | null;
  /** The full server response for the last guess — drives the round summary. */
  lastSubmit: SubmitResult | null;
  submit: (guess: number) => Promise<{ ok: true } | { ok: false; error: string }>;
  /** Moves to the next round after its summary has been dismissed. */
  advance: () => Promise<void>;
  /** True while the next round is being fetched, so the button can say so. */
  advancing: boolean;
  retry: () => Promise<void>;
  /** Stop for the day and reveal the answer. */
  concede: () => Promise<void>;
  /** Round one — say how many guesses it will take, before the first one. */
  call: (guesses: number) => Promise<void>;
  /** Round two — pick which kind of fact the clue will be. */
  chooseClue: (kind: ClueKind) => Promise<void>;
  /** Round three — name the range, which also ends the round. */
  commitRange: (lo: number, hi: number) => Promise<void>;
  /** True while any of the three above is in flight. */
  deciding: boolean;
  reload: () => void;
  /** Refetch in place, without dropping the screen back to a spinner. */
  refresh: () => Promise<void>;
  /** Dev only — signs in as a new anonymous player. */
  startFreshTestPlayer: () => Promise<void>;
  /** Dev only — replays today as the same player. */
  resetToday: () => Promise<void>;
}

export function useDailyGame(): UseDailyGameResult {
  const [phase, setPhase] = useState<Phase>('loading');
  const [game, setGame] = useState<DailyGame | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [advancing, setAdvancing] = useState(false);
  const [lastResult, setLastResult] = useState<GuessResult | null>(null);
  const [lastSubmit, setLastSubmit] = useState<SubmitResult | null>(null);

  const load = useCallback(async () => {
    setPhase('loading');
    setLoadError(null);
    try {
      setGame(await loadDailyGame());
      setPhase('ready');
    } catch (err) {
      setLoadError(messageFor(err instanceof ApiError ? err.code : 'network'));
      setPhase('failed');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  /** Refetch without dropping back to the loading screen. */
  const refresh = useCallback(async () => {
    try {
      setGame(await loadDailyGame());
    } catch {
      /* keep showing what we have */
    }
  }, []);

  const submit = useCallback(
    async (guess: number) => {
      if (!game || submitting || game.round.status !== 'playing' || game.dayStatus !== 'playing') {
        return { ok: false as const, error: 'Not accepting guesses right now.' };
      }
      if (!Number.isInteger(guess) || guess < 1 || guess > 1000) {
        return { ok: false as const, error: messageFor('out_of_range') };
      }

      setSubmitting(true);
      try {
        const res = await submitGuess(guess);
        setLastResult(res.result);
        setLastSubmit(res);

        // Reflect the guess immediately; the server stays the source of truth
        // for round and day status.
        setGame((prev) =>
          prev
            ? {
                ...prev,
                dayStatus: res.dayStatus,
                // The server advances the round on a win; without copying it
                // across, the summary still names the round just finished.
                currentRound: res.currentRound,
                totalScore: res.totalScore,
                round: {
                  ...prev.round,
                  status: res.roundStatus,
                  attemptsUsed: res.attemptsUsed,
                  score: res.roundScore,
                  answer: res.answer ?? prev.round.answer,
                  guesses: [...prev.round.guesses, res.result],
                },
                // The progress bar reads from here. Left stale, the round just
                // finished stayed unfinished while currentRound had already
                // moved on, so the segment emptied out instead of filling and
                // the highlight jumped ahead a round.
                rounds: prev.rounds.map((r) =>
                  r.round === prev.round.round
                    ? {
                        ...r,
                        status: res.roundStatus,
                        score: res.roundScore,
                        attemptsUsed: res.attemptsUsed,
                      }
                    : r,
                ),
              }
            : prev,
        );
        // Closing the day makes the server recompute lifetime stats. Without
        // pulling them back, Home shows a total from before the last round —
        // visibly lower than the day the player has just finished.
        if (res.dayStatus !== 'playing') void refresh();

        return { ok: true as const };
      } catch (err) {
        const code = err instanceof ApiError ? err.code : 'network';
        if (code === 'already_played' || code === 'eliminated' || code === 'round_over') load();
        return { ok: false as const, error: messageFor(code, guess) };
      } finally {
        setSubmitting(false);
      }
    },
    [game, submitting, load, refresh],
  );

  /**
   * Pulls the next round's clue and empty board.
   *
   * Order matters. Clearing the summary first left the finished board on
   * screen for the length of the round trip — and, because the round was still
   * won, the summary sprang straight back up before the new round arrived. The
   * fetch happens first now, so the summary stays put until there is something
   * to replace it with.
   */
  const advance = useCallback(async () => {
    if (advancing) return;
    setAdvancing(true);
    try {
      await refresh();
      setLastResult(null);
      setLastSubmit(null);
    } finally {
      setAdvancing(false);
    }
  }, [refresh, advancing]);

  const retry = useCallback(async () => {
    setPhase('loading');
    setLastResult(null);
    setLastSubmit(null);
    await retryRound();
    await load();
  }, [load]);

  const concede = useCallback(async () => {
    await giveUp();
    await refresh();
  }, [refresh]);

  /**
   * The three things a round can ask for before it will take a guess.
   *
   * Each writes the decision on the server and then refetches rather than
   * patching state here: a call changes what the round pays, a clue changes
   * what is on screen, and a range ends the round outright. Only the server
   * knows what the round becomes, and a refresh is cheap next to guessing.
   */
  const [deciding, setDeciding] = useState(false);

  const decide = useCallback(
    async (fn: () => Promise<unknown>) => {
      if (deciding) return;
      setDeciding(true);
      try {
        await fn();
        // The range ends round three without a guess, so the summary is held
        // back waiting on an animation for a free guess made a minute ago.
        setLastResult(null);
        setLastSubmit(null);
        await refresh();
      } finally {
        setDeciding(false);
      }
    },
    [deciding, refresh],
  );

  const call = useCallback((n: number) => decide(() => dailyCall(n)), [decide]);
  const chooseClue = useCallback((k: ClueKind) => decide(() => dailyClue(k)), [decide]);
  const commitRange = useCallback(
    (lo: number, hi: number) => decide(() => dailyBet(lo, hi)),
    [decide],
  );

  const startFreshTestPlayer = useCallback(async () => {
    setPhase('loading');
    await signOutForTesting();
    await load();
  }, [load]);

  const resetToday = useCallback(async () => {
    setPhase('loading');
    setLastResult(null);
    setLastSubmit(null);
    await devResetToday();
    await load();
  }, [load]);

  return {
    phase,
    game,
    loadError,
    submitting,
    advancing,
    lastResult,
    lastSubmit,
    submit,
    advance,
    retry,
    concede,
    call,
    chooseClue,
    commitRange,
    deciding,
    reload: load,
    refresh,
    startFreshTestPlayer,
    resetToday,
  };
}

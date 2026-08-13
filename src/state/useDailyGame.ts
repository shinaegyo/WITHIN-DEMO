import { useCallback, useEffect, useState } from 'react';
import { GuessResult } from '../game/types';
import {
  ApiError,
  DailyGame,
  devResetToday,
  loadDailyGame,
  messageFor,
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
  retry: () => Promise<void>;
  reload: () => void;
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
                  clue2: res.clue2 ?? prev.round.clue2,
                  answer: res.answer ?? prev.round.answer,
                  guesses: [...prev.round.guesses, res.result],
                },
              }
            : prev,
        );
        return { ok: true as const };
      } catch (err) {
        const code = err instanceof ApiError ? err.code : 'network';
        if (code === 'already_played' || code === 'eliminated' || code === 'round_over') load();
        return { ok: false as const, error: messageFor(code, guess) };
      } finally {
        setSubmitting(false);
      }
    },
    [game, submitting, load],
  );

  /** Pulls the next round's clue and empty board once the summary is dismissed. */
  const advance = useCallback(async () => {
    setLastResult(null);
    setLastSubmit(null);
    await refresh();
  }, [refresh]);

  const retry = useCallback(async () => {
    setPhase('loading');
    setLastResult(null);
    setLastSubmit(null);
    await retryRound();
    await load();
  }, [load]);

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
    lastResult,
    lastSubmit,
    submit,
    advance,
    retry,
    reload: load,
    startFreshTestPlayer,
    resetToday,
  };
}

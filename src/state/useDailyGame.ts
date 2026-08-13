import { useCallback, useEffect, useState } from 'react';
import { ApiError, DailyGame, loadDailyGame, messageFor, submitGuess } from '../lib/api';
import { GuessResult } from '../game/types';

type Phase = 'loading' | 'ready' | 'failed';

export interface UseDailyGameResult {
  phase: Phase;
  game: DailyGame | null;
  loadError: string | null;
  submitting: boolean;
  /** The most recent guess, for triggering feedback animations. */
  lastResult: GuessResult | null;
  submit: (guess: number) => Promise<{ ok: true } | { ok: false; error: string }>;
  reload: () => void;
}

export function useDailyGame(): UseDailyGameResult {
  const [phase, setPhase] = useState<Phase>('loading');
  const [game, setGame] = useState<DailyGame | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [lastResult, setLastResult] = useState<GuessResult | null>(null);

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

  const submit = useCallback(
    async (guess: number) => {
      if (!game || submitting || game.status !== 'playing') {
        return { ok: false as const, error: 'Not accepting guesses right now.' };
      }

      // Validate locally only to avoid an obviously-doomed round trip; the
      // server checks all of this again and its answer is the one that counts.
      if (!Number.isInteger(guess) || guess < 1 || guess > 1000) {
        return { ok: false as const, error: messageFor('out_of_range') };
      }

      setSubmitting(true);
      try {
        const res = await submitGuess(guess);
        setLastResult(res.result);
        setGame((prev) =>
          prev
            ? {
                ...prev,
                guesses: [...prev.guesses, res.result],
                status: res.status,
                attemptsUsed: res.attemptsUsed,
                score: res.score,
                clue2: res.clue2 ?? prev.clue2,
                answer: res.answer ?? prev.answer,
              }
            : prev,
        );
        return { ok: true as const };
      } catch (err) {
        const code = err instanceof ApiError ? err.code : 'network';
        // The server is the source of truth for whether the game is over, so
        // resync rather than guessing at the new state locally.
        if (code === 'already_played') load();
        return { ok: false as const, error: messageFor(code, guess) };
      } finally {
        setSubmitting(false);
      }
    },
    [game, submitting, load],
  );

  return { phase, game, loadError, submitting, lastResult, submit, reload: load };
}

import { useCallback, useReducer } from 'react';
import { MAX_ATTEMPTS, MAX_NUMBER, MIN_NUMBER } from '../game/constants';
import { getInitialClue, getSecondClue } from '../game/clues';
import { evaluateGuess } from '../game/proximity';
import { GameState, GuessResult } from '../game/types';

function buildInitialState(answer: number): GameState {
  return {
    answer,
    maxAttempts: MAX_ATTEMPTS,
    guesses: [],
    status: 'playing',
    clue1: getInitialClue(answer),
    clue2: getSecondClue(answer),
    clue2Unlocked: false,
  };
}

type Action =
  | { type: 'SUBMIT_GUESS'; guess: number }
  | { type: 'RESET'; answer: number };

function reducer(state: GameState, action: Action): GameState {
  switch (action.type) {
    case 'RESET':
      return buildInitialState(action.answer);
    case 'SUBMIT_GUESS': {
      if (state.status !== 'playing') return state;

      const result: GuessResult = evaluateGuess(action.guess, state.answer);
      const guesses = [...state.guesses, result];
      const clue2Unlocked = state.clue2Unlocked || result.isWithin10 || result.isCorrect;

      let status: GameState['status'] = state.status;
      if (result.isCorrect) {
        status = 'won';
      } else if (guesses.length >= state.maxAttempts) {
        status = 'lost';
      }

      return { ...state, guesses, status, clue2Unlocked };
    }
    default:
      return state;
  }
}

export interface UseGameStateResult {
  state: GameState;
  submitGuess: (guess: number) => { ok: true } | { ok: false; error: string };
  reset: (answer: number) => void;
}

export function useGameState(initialAnswer: number): UseGameStateResult {
  const [state, dispatch] = useReducer(reducer, initialAnswer, buildInitialState);

  const submitGuess = useCallback(
    (guess: number) => {
      if (!Number.isInteger(guess)) {
        return { ok: false as const, error: 'Enter a whole number.' };
      }
      if (guess < MIN_NUMBER || guess > MAX_NUMBER) {
        return { ok: false as const, error: `Enter a number between ${MIN_NUMBER} and ${MAX_NUMBER}.` };
      }
      if (state.status !== 'playing') {
        return { ok: false as const, error: 'The game is already over.' };
      }
      dispatch({ type: 'SUBMIT_GUESS', guess });
      return { ok: true as const };
    },
    [state.status],
  );

  const reset = useCallback((answer: number) => {
    dispatch({ type: 'RESET', answer });
  }, []);

  return { state, submitGuess, reset };
}

export type Direction = 'below' | 'above' | 'correct';

export type ProximityTier =
  | 'vast'
  | 'distant'
  | 'light'
  | 'medium'
  | 'dark'
  | 'intense'
  | 'correct';

export interface GuessResult {
  guess: number;
  direction: Direction;
  tier: ProximityTier;
  distance: number;
  isWithin10: boolean;
  isOneAway: boolean;
  isCorrect: boolean;
}

export type GameStatus = 'playing' | 'won' | 'lost';

export interface GameState {
  answer: number;
  maxAttempts: number;
  guesses: GuessResult[];
  status: GameStatus;
  clue1: string;
  clue2: string;
  clue2Unlocked: boolean;
}

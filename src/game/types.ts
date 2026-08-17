// 'hidden' is Thin air: the tile still says how close, never which way. It is
// an output state only - the server stores the true direction and withholds it
// on the way out, so nothing downstream has to trust a guess it cannot see.
export type Direction = 'below' | 'above' | 'correct' | 'hidden';

export type ProximityTier =
  // Stratosphere holds a colour back until the next guess lands. The tile is
  // drawn but uncoloured, so a player sees they guessed and not yet how close.
  | 'pending'
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
}

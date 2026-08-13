export interface ThemeColors {
  background: string;
  surface: string;
  surfaceAlt: string;
  border: string;
  text: string;
  textMuted: string;
  accent: string;
  danger: string;
}

export const lightColors: ThemeColors = {
  background: '#F7F8FA',
  surface: '#FFFFFF',
  surfaceAlt: '#EEF0F3',
  border: '#DDE1E6',
  text: '#15161A',
  textMuted: '#6B7280',
  accent: '#4F46E5',
  danger: '#DC2626',
};

export const darkColors: ThemeColors = {
  background: '#0E0F13',
  surface: '#1A1C22',
  surfaceAlt: '#22252C',
  border: '#2E3138',
  text: '#F5F5F7',
  textMuted: '#9CA3AF',
  accent: '#818CF8',
  danger: '#F87171',
};

// Proximity tile colors are intentionally constant across light/dark mode —
// same convention as Wordle: the tiles are the game's identity, only the
// surrounding chrome adapts to theme.
//
// Both families intensify rather than simply darkening as the guess closes in:
// orange heats toward red, blue toward electric. This keeps close guesses
// feeling urgent instead of muddy, while direction stays readable at a glance.
export const proximityColors = {
  below: {
    light: '#A9C9EF',
    medium: '#5B92DF',
    dark: '#2563EB',
    intense: '#1230C4',
  },
  above: {
    light: '#FBC38E',
    medium: '#F5913C',
    dark: '#ED5F22',
    intense: '#D01C1C',
  },
  correct: '#22A559',
};

// The two lightest tiers need dark text to stay legible; the two most intense
// tiers are dark enough to carry white.
const INK = '#15161A';


export const feedbackColors = {
  within10: '#F5A524',
  oneAway: '#E8452C',
  correct: '#22A559',
};

export function getTileColor(direction: 'below' | 'above' | 'correct', tier: string): string {
  if (direction === 'correct') return proximityColors.correct;
  const scale = direction === 'below' ? proximityColors.below : proximityColors.above;
  return (scale as Record<string, string>)[tier] ?? scale.light;
}

/** Text colour that stays legible on the given tile. */
export function getTileTextColor(direction: 'below' | 'above' | 'correct', tier: string): string {
  if (direction === 'correct') return '#FFFFFF';
  return tier === 'light' || tier === 'medium' ? INK : '#FFFFFF';
}

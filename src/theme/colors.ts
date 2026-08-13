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

// NOTE: `background` for each theme is duplicated in app.json as the splash
// screen colour (light + dark). Keep them in sync, otherwise launching the app
// flashes the wrong colour before the first frame renders.
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

/**
 * Tiles are drawn translucent over the app background rather than as solid
 * blocks. Opacity climbs as the guess closes in, so distant guesses recede and
 * only the guess that matters carries real colour — the board reads much
 * calmer while "am I getting warmer?" stays obvious.
 */
const TIER_ALPHA: Record<string, number> = {
  light: 0.22,
  medium: 0.34,
  dark: 0.48,
  intense: 0.62,
};

function withAlpha(hex: string, alpha: number): string {
  const value = hex.replace('#', '');
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}


export const feedbackColors = {
  within10: '#F5A524',
  oneAway: '#E8452C',
  correct: '#22A559',
};

export function getTileColor(direction: 'below' | 'above' | 'correct', tier: string): string {
  // The winning tile stays fully opaque — it's the payoff, it should shout.
  if (direction === 'correct') return proximityColors.correct;
  const scale = direction === 'below' ? proximityColors.below : proximityColors.above;
  const base = (scale as Record<string, string>)[tier] ?? scale.light;
  return withAlpha(base, TIER_ALPHA[tier] ?? TIER_ALPHA.light);
}

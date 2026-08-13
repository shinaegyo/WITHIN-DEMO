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
// surrounding chrome adapts to theme. All are tuned to stay legible with
// white bold text.
export const proximityColors = {
  below: {
    light: '#8FB4DE',
    medium: '#4E7FC4',
    dark: '#2A5090',
    intense: '#0F2E63',
  },
  above: {
    light: '#F0B37E',
    medium: '#E08A3D',
    dark: '#B8630F',
    intense: '#7A3D00',
  },
  correct: '#22A559',
};

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

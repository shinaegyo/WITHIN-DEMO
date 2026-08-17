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
// Cool rather than neutral. The greys were the default grey of every app, and
// blue and red sitting on them read as two colours that wandered in; a faint
// cool cast makes the pair look chosen. The accent is the tiles' own blue -
// there is no reason for a third hue when the game already has one.
export const lightColors: ThemeColors = {
  background: '#F4F7FC',
  surface: '#FFFFFF',
  surfaceAlt: '#E8EEF8',
  border: '#D4DEEC',
  text: '#0F141C',
  textMuted: '#586376',
  accent: '#2563EB',
  danger: '#D93A2F',
};

export const darkColors: ThemeColors = {
  background: '#0E0F13',
  surface: '#1A1C22',
  surfaceAlt: '#22252C',
  border: '#2E3138',
  text: '#F5F5F7',
  textMuted: '#9CA3AF',
  // The tiles' blue, lifted for a dark ground. Indigo was a fourth colour in a
  // game that only has two.
  accent: '#6FA5EE',
  danger: '#FF7A6B',
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
    // Two steps beyond the old far tier, paling as the guess gets colder. They
    // carry no fill, so this is the accent bar and the label only — it has to
    // stay legible on white without competing with the close tiers.
    vast: '#D3E3F7',
    distant: '#BED7F3',
    light: '#A9C9EF',
    medium: '#5B92DF',
    dark: '#2563EB',
    intense: '#1230C4',
  },
  // Deliberately coral→red rather than amber→red. Brown *is* dark desaturated
  // orange, so any amber hue turns brown once it's dimmed or laid over a dark
  // background. Keeping the green and blue channels close together holds these
  // in the red family at every opacity, on either theme.
  above: {
    vast: '#FFDCD5',
    distant: '#FFC7BE',
    light: '#FFB3A7',
    medium: '#FF8A75',
    dark: '#F4453F',
    intense: '#E01B1B',
  },
  correct: '#22A559',
};

/**
 * Fill opacity per tier. The far tiers are deliberately 0 — a warm hue at low
 * opacity loses most of its saturation and the eye reads the result as brown,
 * which no amount of hue tuning fixes. So distant guesses get no fill at all
 * and carry their colour in a full-saturation accent bar instead; only the
 * close tiers, which stay saturated enough to read as true red or blue, are
 * filled. The board stays calm and brown never appears.
 */
const TIER_ALPHA: Record<string, number> = {
  vast: 0,
  distant: 0,
  light: 0,
  medium: 0,
  dark: 0.5,
  intense: 0.72,
};

function withAlpha(hex: string, alpha: number): string {
  const value = hex.replace('#', '');
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}


/**
 * The wordmark gradient runs cold to hot — the same blue-to-red scale the
 * tiles use for "too low" through "too high", so the logo carries the
 * mechanic. Defined here so every surface that shows the name shares it.
 */
export const wordmarkGradient = ['#5B92DF', '#E5412F'] as const;

/**
 * Thin air, where the arrow is withheld.
 *
 * Greyscale rather than a third hue. Blue and red mean "aim up" and "aim down"
 * everywhere else in the game, so reusing either to mean nothing but distance
 * would actively mislead - and colors.ts is explicit that the palette has two
 * hues on purpose. Draining the colour out is the honest reading: intensity
 * still says how close, and there is no hue left to say which way.
 */
export const hiddenColors = {
  vast: '#DCDFE6',
  distant: '#C6CAD4',
  light: '#AEB4C1',
  medium: '#7C8698',
  dark: '#4A5364',
  intense: '#2B3240',
};

export const feedbackColors = {
  within10: '#FFA51F',
  oneAway: '#E8452C',
  correct: '#22A559',
};

/**
 * Ink for the label and arrow on an unfilled tile.
 *
 * The bar can be as pale as the scale likes — it is a solid block and reads
 * fine. Text cannot: the two farthest rungs dropped below legible contrast on a
 * white surface, so the ink stops paling at the 100-249 step while the bar
 * carries on. The distance is still stated in words on the same row, so nothing
 * is lost by holding the colour steady.
 */
export function getTileInk(direction: string, tier: string): string {
  const floored = tier === 'vast' || tier === 'distant' ? 'light' : tier;
  return getTileAccent(direction, floored);
}

/** Full-saturation colour for the tier — used for the accent bar and labels. */
export function getTileAccent(direction: string, tier: string): string {
  if (direction === 'correct') return proximityColors.correct;
  if (direction === 'hidden') {
    return (hiddenColors as Record<string, string>)[tier] ?? hiddenColors.light;
  }
  // Withheld, not absent: the palest rung of the direction's own scale, so the
  // arrow still reads and the shade says nothing yet.
  if (tier === 'pending') {
    return direction === 'below' ? proximityColors.below.vast : proximityColors.above.vast;
  }
  const scale = direction === 'below' ? proximityColors.below : proximityColors.above;
  return (scale as Record<string, string>)[tier] ?? scale.light;
}

/**
 * Tile fill. Returns null for the far tiers, meaning "use the neutral surface"
 * — see TIER_ALPHA for why they aren't tinted.
 */
export function getTileFill(direction: string, tier: string): string | null {
  // The winning tile stays fully opaque — it's the payoff, it should shout.
  if (direction === 'correct') return proximityColors.correct;
  // No fill while the colour is still owed.
  if (tier === 'pending') return null;
  if (direction === 'hidden') {
    const alpha = TIER_ALPHA[tier] ?? 0;
    return alpha === 0 ? null : withAlpha(getTileAccent(direction, tier), alpha);
  }
  const alpha = TIER_ALPHA[tier] ?? 0;
  if (alpha === 0) return null;
  return withAlpha(getTileAccent(direction, tier), alpha);
}

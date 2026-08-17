import React from 'react';
import Svg, { Path } from 'react-native-svg';

/**
 * The glyphs above streak and points, so the three cards on the profile are
 * the same shape as one another.
 *
 * The league card has carried a badge since the leagues went in, and the row
 * stretches to its tallest member - so streak and points became numbers
 * floating in a box sized for something they did not have. They looked
 * unfilled because they were: two elements in a card built for three, and the
 * only one of the three carrying any colour was the league.
 *
 * Solid silhouettes on the same 30x30 box as LeagueBadge, for the same reason
 * given there: an outline at this size is a smudge, and these are drawn at
 * twenty-two pixels.
 */
export type StatGlyph = 'streak' | 'points' | 'summit';

const PATHS: Record<StatGlyph, string> = {
  // A flame. The shoulder notch is what stops it reading as a leaf once the
  // colour is dimmed on a streak of zero.
  streak:
    'M15 2.5c3.6 4.6 6.8 7.4 6.8 11.9a6.8 6.8 0 1 1-13.6 0c0-2.3.9-4.3 2.6-6 .1 2 .9 3.3 2.2 3.8-.6-3.6.4-7.2 2-9.7z',
  // Four points rather than five, because Gold's badge is a five-pointed star
  // and two stars in a row of three cards would read as a matching pair.
  points: 'M15 3l2.7 9.3L27 15l-9.3 2.7L15 27l-2.7-9.3L3 15l9.3-2.7z',
  // Two peaks, the taller one off centre. A single symmetrical triangle reads
  // as a play button or a warning sign at this size; the second peak is what
  // makes it a mountain at a glance.
  summit: 'M1 25L10.5 6.5 16.5 17.5 20.5 10.5 29 25z',
};

export function StatIcon({
  glyph,
  color,
  size = 22,
}: {
  glyph: StatGlyph;
  color: string;
  size?: number;
}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 30 30">
      <Path d={PATHS[glyph]} fill={color} />
    </Svg>
  );
}

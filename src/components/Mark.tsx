import React from 'react';
import Svg, { Circle, Path } from 'react-native-svg';
import { proximityColors } from '../theme/colors';

/**
 * The WITHIN mark: two arrows closing on a point.
 *
 * The blue one pushes up and the red one pushes down, which is the game's whole
 * language - and the number is caught between them, which is the name. One
 * shape carrying the mechanic, the word and the icon, and it still reads at
 * 16px, which a six-letter gradient never could.
 *
 * The two colours live here and in the tiles, and nowhere else. A colour that
 * means "go higher" stops meaning anything the moment it is also used because
 * it looks nice.
 */
export function Mark({ size = 32, ink = '#F7F8FA' }: { size?: number; ink?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 60 60">
      <Path
        d="M20 13 12 30l8 17"
        stroke={proximityColors.below.medium}
        strokeWidth={5.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <Path
        d="M40 13l8 17-8 17"
        stroke={proximityColors.above.dark}
        strokeWidth={5.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <Circle cx="30" cy="30" r="5" fill={ink} />
    </Svg>
  );
}

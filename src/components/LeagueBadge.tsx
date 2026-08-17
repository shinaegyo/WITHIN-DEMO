import React from 'react';
import Svg, { Path } from 'react-native-svg';
import { League } from '../lib/api';
import { LEAGUE_INK } from '../theme/leagues';

/**
 * One silhouette per league, filled, in that league's colour.
 *
 * Solid shapes rather than outlines or counters: an outline at eighteen pixels
 * on a board row is a smudge, and a ring small enough to fit a stat slot reads
 * as a dot. Every badge here fills its box.
 *
 * The shapes get more complicated as they climb - block, shield, star, denser
 * star, cut gem, crown - so the silhouette alone says roughly how high somebody
 * is before the colour is read at all. That matters on a leaderboard, where the
 * badge is eighteen pixels and nobody has learned the palette yet.
 */
const PATHS: Record<League, string> = {
  Bronze: 'M15 2l12 6.5v13L15 28 3 21.5v-13z',
  Silver: 'M15 2l11 3.5V15c0 7-4.8 11-11 13C8.8 26 4 22 4 15V5.5z',
  Gold: 'M15 2l3.9 8 8.6 1.2-6.3 6.1 1.5 8.6L15 21.8 7.3 26l1.5-8.6L2.5 11.2 11.1 10z',
  Platinum:
    'M15 1l3 7.4 7.1-3.5-3.5 7.1L29 15l-7.4 3 3.5 7.1-7.1-3.5L15 29l-3-7.4-7.1 3.5 3.5-7.1L1 15l7.4-3-3.5-7.1L12 8.4z',
  Diamond: 'M9.5 4h11l5.5 8-11 16-11-16z',
  Legend: 'M3 9l5 5.5L15 4l7 10.5L27 9v14H3z',
};

export function LeagueBadge({
  league,
  size = 30,
  ink,
}: {
  league: League;
  size?: number;
  /** Overrides the league's own colour, for a badge sitting on its own metal. */
  ink?: string;
}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 30 30">
      <Path d={PATHS[league]} fill={ink ?? LEAGUE_INK[league]} />
    </Svg>
  );
}

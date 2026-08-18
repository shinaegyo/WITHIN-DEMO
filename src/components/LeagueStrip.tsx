import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from './AppText';
import { LeagueBadge } from './LeagueBadge';
import { fonts } from '../theme/fonts';
import { useTheme } from '../theme/ThemeContext';
import { League } from '../lib/api';
import { LEAGUE_FLOOR, LEAGUE_INK, nextLeague } from '../theme/leagues';
import { playTap } from '../utils/sound';

/**
 * Where you are on the ladder, and how far the next rung is.
 *
 * The badge on its own was never the useful part. "Bronze" tells a player
 * nothing they can act on; "122 to Silver" is the whole reason a ladder is
 * worth showing, and until this existed the app had no surface that said it.
 *
 * The bar fills within the current band rather than across the whole season, so
 * it empties on promotion instead of creeping to full once and staying there.
 * Legend has no band above it and so gets no bar - a full one would read as
 * unfinished business at the top of the ladder.
 */
export function LeagueStrip({
  league,
  points,
  onPress,
}: {
  league: League;
  points: number;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const next = nextLeague(league);
  const floor = LEAGUE_FLOOR[league];
  const ink = LEAGUE_INK[league];

  const span = next ? next.points - floor : 0;
  const done = next ? Math.max(0, Math.min(1, (points - floor) / span)) : 1;

  return (
    <Pressable
      onPress={() => { playTap(); onPress(); }}
      style={({ pressed }) => [
        styles.wrap,
        { borderColor: colors.border, backgroundColor: colors.surface, opacity: pressed ? 0.85 : 1 },
      ]}
    >
      <View style={styles.top}>
        <LeagueBadge league={league} size={22} />
        <View style={styles.names}>
          <Text style={[styles.league, { color: colors.text }]}>{league}</Text>
          <Text style={[styles.sub, { color: colors.textMuted }]}>
            {points.toLocaleString()} points this season
          </Text>
        </View>
        {next ? (
          <Text style={[styles.togo, { color: colors.textMuted }]} numberOfLines={2}>
            {(next.points - points).toLocaleString()} to{'\n'}{next.league}
          </Text>
        ) : (
          <Text style={[styles.togo, { color: ink }]}>top of{'\n'}the ladder</Text>
        )}
      </View>

      {next && (
        <View style={[styles.track, { backgroundColor: colors.border }]}>
          <View style={[styles.fill, { width: `${done * 100}%`, backgroundColor: ink }]} />
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { borderWidth: 1, borderRadius: 14, padding: 12, marginBottom: 14 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  names: { flex: 1 },
  league: { fontSize: 14.5, fontFamily: fonts.bold },
  sub: { fontSize: 12, fontFamily: fonts.medium, marginTop: 1 },
  togo: { fontSize: 11.5, fontFamily: fonts.semiBold, textAlign: 'right', lineHeight: 15 },
  track: { height: 6, borderRadius: 3, marginTop: 10, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 3 },
});

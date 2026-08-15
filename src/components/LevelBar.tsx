import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from './AppText';
import { XpState } from '../lib/api';
import { proximityColors } from '../theme/colors';
import { fonts } from '../theme/fonts';
import { useTheme } from '../theme/ThemeContext';

/**
 * The player level, and how close the next one is.
 *
 * Every mode pays into the same number, which is the point of it: the daily is
 * three minutes and Impossible is twenty, and until now only one of them left
 * anything behind. The bar matters more than the total - a level you can see
 * yourself approaching is worth more than a score you have to interpret.
 */
export function LevelBar({ xp, compact }: { xp: XpState | null; compact?: boolean }) {
  const { colors } = useTheme();
  const pct = xp && xp.needed > 0 ? Math.min(1, Math.max(0, xp.into / xp.needed)) : 0;

  return (
    <View style={styles.wrap}>
      <View style={styles.top}>
        <Text style={[styles.level, { color: colors.text }]}>
          LEVEL {xp ? xp.level : '—'}
        </Text>
        {!compact && (
          <Text style={[styles.progress, { color: colors.textMuted }]}>
            {xp ? `${xp.into} / ${xp.needed} XP` : ''}
          </Text>
        )}
      </View>
      {/* Cold to hot across the level, the same way the tiles run. The gradient
          is laid across the whole track and the fill is a window onto it, so a
          level just begun shows only the blue end and one nearly finished
          carries the red - the bar heats up as the level closes. */}
      <View style={[styles.track, { backgroundColor: colors.border }]}>
        <View style={[styles.fill, { width: `${pct * 100}%` }]}>
          <LinearGradient
            colors={[proximityColors.below.medium, proximityColors.above.dark]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={{ width: pct > 0 ? `${100 / pct}%` : '100%', height: '100%' }}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  top: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  level: { fontSize: 12, fontFamily: fonts.extraBold, letterSpacing: 1.2 },
  progress: { fontSize: 11, fontFamily: fonts.bold },
  track: { height: 8, borderRadius: 4, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 4, overflow: 'hidden' },
});

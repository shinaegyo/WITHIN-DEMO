import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from './AppText';
import { fonts } from '../theme/fonts';
import { useTheme } from '../theme/ThemeContext';
import { Wordmark } from './Wordmark';
import { Mark } from './Mark';
import { radius, border } from '../theme/tokens';

/**
 * `onBack` is only supplied while a game can still be abandoned — see
 * GameScreen. `points` and `clock` turn the right-hand side into the day's two
 * numbers: what it has scored and how long it has taken. A screen that hands
 * those over has no room for the theme toggle, and no need for one - it lives
 * on home, where nothing is being timed.
 */
export function Header({
  onBack,
  points,
  clock,
}: {
  onBack?: () => void;
  points?: number;
  clock?: string | null;
}) {
  const { colors, mode, toggle } = useTheme();
  const meta = points !== undefined || !!clock;

  return (
    <View style={styles.wrap}>
      <View style={styles.left}>
        {onBack && (
          <Pressable onPress={onBack} hitSlop={12} accessibilityLabel="Back to home">
            <Text style={[styles.back, { color: colors.textMuted }]}>‹</Text>
          </Pressable>
        )}
        <Mark size={22} ink={colors.text} />
        <Wordmark size={24} color={colors.text} />
      </View>

      {meta ? (
        <View style={styles.meta}>
          {points !== undefined && (
            <View style={[styles.pill, { borderColor: colors.border }]}>
              <Text style={[styles.pillText, { color: colors.text }]}>{points} pts</Text>
            </View>
          )}
          {!!clock && (
            <View style={[styles.pill, { borderColor: colors.border }]}>
              <Text style={[styles.pillText, { color: colors.text }]}>{clock}</Text>
            </View>
          )}
        </View>
      ) : (
        <Pressable
          style={[styles.iconButton, { backgroundColor: colors.surfaceAlt }]}
          onPress={toggle}
          accessibilityLabel="Toggle light/dark mode"
        >
          <Text style={styles.iconText}>{mode === 'dark' ? '☀' : '☾'}</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  left: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  back: {
    fontSize: 30,
    lineHeight: 32,
    fontFamily: fonts.bold,
  },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  pill: {
    borderWidth: border.hairline,
    borderRadius: radius.pill,
    paddingHorizontal: 13,
    paddingVertical: 6,
    minWidth: 62,
    alignItems: 'center',
  },
  pillText: { fontSize: 13, fontFamily: fonts.extraBold, fontVariant: ['tabular-nums'] },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: radius.panel,
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconText: {
    fontSize: 17,
  },
});

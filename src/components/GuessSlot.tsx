import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { getBandLabel } from '../game/proximity';
import { GuessResult } from '../game/types';
import { getTileAccent, getTileFill } from '../theme/colors';
import { fonts } from '../theme/fonts';
import { useTheme } from '../theme/ThemeContext';

// Slots flex to share the available board height, but never grow so tall
// they stop reading as a row of boxes.
const slotBase = {
  flex: 1,
  minHeight: 44,
  maxHeight: 84,
  borderRadius: 14,
  flexDirection: 'row',
  alignItems: 'center',
  paddingLeft: 20,
  paddingRight: 16,
  overflow: 'hidden',
} as const;

export function EmptySlot({ attemptNumber }: { attemptNumber: number }) {
  const { colors } = useTheme();

  return (
    <View style={[styles.slot, styles.empty, { borderColor: colors.border }]}>
      <Text style={[styles.attemptLabel, { color: colors.textMuted }]}>#{attemptNumber}</Text>
    </View>
  );
}

export function FilledSlot({ result, attemptNumber }: { result: GuessResult; attemptNumber: number }) {
  const { colors } = useTheme();
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(anim, {
      toValue: 1,
      useNativeDriver: true,
      friction: 7,
      tension: 60,
    }).start();
  }, [anim]);

  const accent = getTileAccent(result.direction, result.tier);
  const fill = getTileFill(result.direction, result.tier);

  // Filled tiles are saturated enough to carry white; unfilled ones sit on the
  // neutral surface and use normal theme text.
  const ink = fill ? '#FFFFFF' : colors.text;
  // On an unfilled tile the accent is the only colour, so it does the work of
  // signalling direction and closeness.
  const bandInk = fill ? '#FFFFFF' : accent;
  const arrow = result.direction === 'correct' ? '✓' : result.direction === 'below' ? '▲' : '▼';
  const arrowLabel =
    result.direction === 'correct'
      ? 'Correct'
      : result.direction === 'below'
        ? 'Guess too low'
        : 'Guess too high';

  return (
    <Animated.View
      style={[
        styles.slot,
        {
          backgroundColor: fill ?? colors.surface,
          opacity: anim,
          transform: [
            { translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) },
            { scale: anim.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1] }) },
          ],
        },
      ]}
    >
      <View style={[styles.accentBar, { backgroundColor: accent }]} />
      <Text style={[styles.attemptLabelFilled, { color: ink, opacity: 0.65 }]}>#{attemptNumber}</Text>
      <Text style={[styles.guessText, { color: ink }]}>{result.guess}</Text>
      <Text style={[styles.band, { color: bandInk }]}>{getBandLabel(result)}</Text>
      <Text style={[styles.arrow, { color: bandInk }]} accessibilityLabel={arrowLabel}>
        {arrow}
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  slot: slotBase,
  empty: {
    borderWidth: 1.5,
  },
  // Full-saturation stripe: the one element that never dims, so direction and
  // closeness stay readable even on the unfilled tiles.
  accentBar: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 6,
  },
  attemptLabel: {
    fontSize: 12,
    fontFamily: fonts.semiBold,
    opacity: 0.6,
  },
  attemptLabelFilled: {
    fontSize: 12,
    fontFamily: fonts.semiBold,
    width: 26,
  },
  guessText: {
    flex: 1,
    fontSize: 24,
    fontFamily: fonts.extraBold,
    letterSpacing: 0.5,
  },
  band: {
    fontSize: 11,
    fontFamily: fonts.extraBold,
    letterSpacing: 0.6,
  },
  arrow: {
    fontSize: 18,
    marginLeft: 10,
    width: 18,
    textAlign: 'right',
  },
});

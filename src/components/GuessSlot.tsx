import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { getBandLabel } from '../game/proximity';
import { GuessResult } from '../game/types';
import { getTileColor, getTileTextColor } from '../theme/colors';
import { fonts } from '../theme/fonts';
import { useTheme } from '../theme/ThemeContext';

// Slots flex to share the available board height, but never grow so tall
// they stop reading as a row of boxes.
const slotBase = {
  flex: 1,
  minHeight: 44,
  maxHeight: 66,
  borderRadius: 14,
  flexDirection: 'row',
  alignItems: 'center',
  paddingHorizontal: 16,
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
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(anim, {
      toValue: 1,
      useNativeDriver: true,
      friction: 7,
      tension: 60,
    }).start();
  }, [anim]);

  const ink = getTileTextColor(result.direction, result.tier);
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
          backgroundColor: getTileColor(result.direction, result.tier),
          opacity: anim,
          transform: [
            { translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) },
            { scale: anim.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1] }) },
          ],
        },
      ]}
    >
      <Text style={[styles.attemptLabelFilled, { color: ink, opacity: 0.7 }]}>#{attemptNumber}</Text>
      <Text style={[styles.guessText, { color: ink }]}>{result.guess}</Text>
      <Text style={[styles.band, { color: ink, opacity: 0.9 }]}>{getBandLabel(result)}</Text>
      <Text style={[styles.arrow, { color: ink }]} accessibilityLabel={arrowLabel}>
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

import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { getBandLabel } from '../game/proximity';
import { GuessResult } from '../game/types';
import { getTileColor } from '../theme/colors';
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
      <Text style={styles.attemptLabelFilled}>#{attemptNumber}</Text>
      <Text style={styles.guessText}>{result.guess}</Text>
      <Text style={styles.band}>{getBandLabel(result)}</Text>
      <Text style={styles.arrow} accessibilityLabel={arrowLabel}>
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
    fontWeight: '600',
    opacity: 0.6,
  },
  attemptLabelFilled: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
    fontWeight: '600',
    width: 26,
  },
  guessText: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  band: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  arrow: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '900',
    marginLeft: 10,
    width: 18,
    textAlign: 'right',
  },
});

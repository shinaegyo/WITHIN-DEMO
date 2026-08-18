import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { Text } from './AppText';
import { getBandLabel } from '../game/proximity';
import { GuessResult } from '../game/types';
import { getTileAccent, getTileFill, getTileInk } from '../theme/colors';
import { fonts } from '../theme/fonts';
import { useTheme } from '../theme/ThemeContext';
import { radius, border } from '../theme/tokens';

// Slots flex to share the available board height, but never grow so tall
// they stop reading as a row of boxes.
const slotBase = {
  flex: 1,
  minHeight: 44,
  maxHeight: 84,
  borderRadius: radius.card,
  flexDirection: 'row',
  alignItems: 'center',
  paddingLeft: 20,
  paddingRight: 16,
  overflow: 'hidden',
} as const;

export function FilledSlot({
  result,
  attemptNumber,
  blindOneAway,
  surface,
  ink: inkOverride,
  belowFill,
}: {
  result: GuessResult;
  attemptNumber: number;
  /**
   * Drop the arrow on a one-away guess. ONE AWAY plus a direction is the number
   * itself, which Impossible cannot afford to hand over; the daily can, because
   * there the tension is the clock rather than the depth.
   */
  blindOneAway?: boolean;
  /**
   * The ground an unfilled tile sits on, and the ink it carries there.
   *
   * Only the close bands get a saturated fill; everything further out falls
   * back to a surface, and taking that from the app theme put a black card on
   * a teal arena in dark mode and a white one in light. Impossible passes its
   * arena instead, so a distant guess belongs to the tier it was made in.
   */
  surface?: string;
  ink?: string;
  /**
   * A stage's own blue, for grounds that would swallow the standard one.
   *
   * Sky is a daylight blue and the tile meaning "go higher" is a blue of about
   * the same weight, so on that stage the strongest signal in the game became
   * the hardest to see. Only the below direction takes it; red has no ground
   * here that competes with it.
   */
  belowFill?: string;
}) {
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
  const base = getTileFill(result.direction, result.tier);
  const fill = base && result.direction === 'below' && belowFill ? belowFill : base;

  // Filled tiles are saturated enough to carry white; unfilled ones sit on the
  // neutral surface and use normal theme text.
  const ink = fill ? '#FFFFFF' : (inkOverride ?? colors.text);
  // On an unfilled tile the accent is the only colour, so it does the work of
  // signalling direction and closeness.
  const bandInk = fill ? '#FFFFFF' : getTileInk(result.direction, result.tier);
  // Thin air withholds the arrow entirely - a dot, because an empty space
  // reads as a tile that failed to render rather than one that is keeping
  // something from you.
  const arrow =
    result.direction === 'correct'
      ? '✓'
      : result.direction === 'hidden'
        ? '•'
        : result.direction === 'below'
          ? '▲'
          : '▼';
  const arrowLabel =
    result.direction === 'correct'
      ? 'Correct'
      : result.direction === 'hidden'
        ? 'Direction withheld'
        : result.direction === 'below'
          ? 'Guess too low'
          : 'Guess too high';

  return (
    <Animated.View
      style={[
        styles.slot,
        {
          backgroundColor: fill ?? surface ?? colors.surface,
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
      {!(blindOneAway && result.isOneAway) && (
        <Text style={[styles.arrow, { color: bandInk }]} accessibilityLabel={arrowLabel}>
          {arrow}
        </Text>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  slot: slotBase,
  empty: {
    borderWidth: border.selectable,
    justifyContent: 'space-between',
  },
  finalSlot: {
    borderStyle: 'dashed',
  },
  finalNote: {
    fontSize: 9,
    fontFamily: fonts.bold,
    letterSpacing: 1,
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

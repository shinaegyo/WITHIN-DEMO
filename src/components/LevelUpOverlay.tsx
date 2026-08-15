import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, StyleSheet, View } from 'react-native';
import { Text } from './AppText';
import { Mark } from './Mark';
import { fonts } from '../theme/fonts';
import { useTheme } from '../theme/ThemeContext';
import { hapticCorrect } from '../utils/haptics';
import { playWin } from '../utils/sound';

interface Props {
  from: number;
  to: number;
  /** Where the new level starts: 0 of whatever the next one costs. */
  needed: number;
  onDone: () => void;
}

/**
 * The one moment the game stops to say well done.
 *
 * Levelling is the only thing in WITHIN that every mode feeds - the daily, a
 * climb, a duel, a Rush run, a Window commit - and until now it happened in
 * silence, discovered later as a different number in the corner of the home
 * screen. A thing that takes a week to earn should interrupt something.
 *
 * The sequence is deliberately slow enough to read: the card rises, the old
 * number leaves upward and the new one arrives from below, then the bar fills
 * to the top of the level just finished and empties into the next. Nothing is
 * dismissable until the numbers have landed, because a card you can tap away
 * in the first frame is a card most people will never actually see.
 */
export function LevelUpOverlay({ from, to, needed, onDone }: Props) {
  const { colors } = useTheme();

  const rise = useRef(new Animated.Value(0)).current;
  const roll = useRef(new Animated.Value(0)).current;
  const fill = useRef(new Animated.Value(0)).current;
  const ready = useRef(false);

  useEffect(() => {
    // Ahead of the animation and outside it. A haptic that throws on a
    // platform without one - the web, which is every player today - took the
    // whole sequence with it, leaving a full-screen scrim over a card still
    // sitting at opacity zero and no way to tap past it.
    try {
      hapticCorrect();
      playWin();
    } catch {
      /* the card is the celebration; the noise is a bonus */
    }

    Animated.sequence([
      Animated.timing(rise, {
        toValue: 1,
        duration: 320,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.delay(220),
      Animated.timing(roll, {
        toValue: 1,
        duration: 520,
        easing: Easing.inOut(Easing.cubic),
        useNativeDriver: true,
      }),
      // Not on the native driver: width is a layout property.
      Animated.timing(fill, {
        toValue: 1,
        duration: 620,
        easing: Easing.inOut(Easing.cubic),
        useNativeDriver: false,
      }),
    ]).start(() => {
      ready.current = true;
    });
  }, [rise, roll, fill]);

  // The old number leaves upward as the new one arrives from below, both
  // fading, so the two never read as a single number changing its mind.
  const oldY = roll.interpolate({ inputRange: [0, 1], outputRange: [0, -54] });
  const newY = roll.interpolate({ inputRange: [0, 1], outputRange: [54, 0] });
  const oldOpacity = roll.interpolate({ inputRange: [0, 0.55], outputRange: [1, 0] });
  const newOpacity = roll.interpolate({ inputRange: [0.45, 1], outputRange: [0, 1] });

  // Fills to full for the level just finished, then drops to empty for the
  // next: the same bar telling both halves of what happened.
  const barWidth = fill.interpolate({
    inputRange: [0, 0.55, 0.56, 1],
    outputRange: ['0%', '100%', '0%', '0%'],
  });

  return (
    <Pressable
      style={[StyleSheet.absoluteFill, styles.scrim, { backgroundColor: colors.background }]}
      onPress={() => {
        // Ignored until the numbers have landed, so a stray tap on the way in
        // does not throw the whole thing away.
        if (ready.current) onDone();
      }}
    >
      <Animated.View
        style={[
          styles.card,
          {
            opacity: rise,
            transform: [
              { translateY: rise.interpolate({ inputRange: [0, 1], outputRange: [26, 0] }) },
            ],
          },
        ]}
      >
        <Mark size={44} ink={colors.text} />

        <Text style={[styles.title, { color: colors.textMuted }]}>LEVEL UP</Text>

        <View style={styles.numbers}>
          <Animated.View
            style={[StyleSheet.absoluteFill, styles.centre, { opacity: oldOpacity, transform: [{ translateY: oldY }] }]}
          >
            <Text style={[styles.number, { color: colors.textMuted }]}>{from}</Text>
          </Animated.View>
          <Animated.View
            style={[styles.centre, { opacity: newOpacity, transform: [{ translateY: newY }] }]}
          >
            <Text style={[styles.number, { color: colors.text }]}>{to}</Text>
          </Animated.View>
        </View>

        <View style={[styles.track, { backgroundColor: colors.border }]}>
          <Animated.View style={[styles.bar, { width: barWidth, backgroundColor: colors.text }]} />
        </View>

        <Text style={[styles.needed, { color: colors.textMuted }]}>
          {needed} XP to level {to + 1}
        </Text>

        <Text style={[styles.dismiss, { color: colors.textMuted }]}>Tap to continue</Text>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  scrim: { alignItems: 'center', justifyContent: 'center', zIndex: 20 },
  // Stretched, so the bar spans the card rather than shrinking to the width of
  // whichever line of text happens to be longest.
  card: { alignSelf: 'stretch', alignItems: 'center', paddingHorizontal: 44, gap: 10 },
  title: { fontSize: 12, fontFamily: fonts.bold, letterSpacing: 3, marginTop: 6 },
  numbers: { height: 118, justifyContent: 'center', alignSelf: 'stretch' },
  centre: { alignItems: 'center', justifyContent: 'center' },
  number: { fontSize: 104, fontFamily: fonts.extraBold, letterSpacing: -5, lineHeight: 114 },
  track: { height: 8, borderRadius: 4, alignSelf: 'stretch', overflow: 'hidden', marginTop: 4 },
  bar: { height: 8, borderRadius: 4 },
  needed: { fontSize: 12.5, fontFamily: fonts.bold },
  dismiss: { fontSize: 12, fontFamily: fonts.medium, marginTop: 26 },
});

import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, StyleSheet, View } from 'react-native';
import { Text } from './AppText';
import { League } from '../lib/api';
import { LEAGUE_INK } from '../theme/leagues';
import { fonts } from '../theme/fonts';
import { noHit } from '../theme/styles';
import { useTheme } from '../theme/ThemeContext';
import { hapticCorrect } from '../utils/haptics';
import { playWin } from '../utils/sound';
import { Confetti } from './Confetti';
import { LeagueBadge } from './LeagueBadge';
import { Rings } from './effects/Rings';
import { radius } from '../theme/tokens';

/**
 * Moving up a league, said once, on the way in.
 *
 * The promotion happens on the server the moment a day's points cross the band,
 * which is the middle of a round summary - the worst place to interrupt. Home
 * is where every mode returns to, so the card waits there, the same way the
 * level card does.
 *
 * The old league leaves and the new one arrives in its place rather than both
 * being on screen at once: a promotion is a replacement, and two badges side by
 * side reads as a comparison.
 */
export function LeagueUpOverlay({
  from,
  to,
  onDone,
}: {
  from: League;
  to: League;
  onDone: () => void;
}) {
  const { colors } = useTheme();
  const rise = useRef(new Animated.Value(0)).current;
  const swap = useRef(new Animated.Value(0)).current;

  useEffect(() => {
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
      Animated.delay(260),
      Animated.timing(swap, {
        toValue: 1,
        duration: 620,
        easing: Easing.inOut(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, [rise, swap]);

  return (
    <View style={[StyleSheet.absoluteFill, styles.backdrop]}>
      <Confetti />
      <View style={[StyleSheet.absoluteFill, styles.rings, noHit]}>
        <Rings color={LEAGUE_INK[to]} count={3} size={200} maxScale={3.2} duration={1200} />
      </View>

      <Animated.View
        style={[
          styles.card,
          {
            backgroundColor: colors.surface,
            opacity: rise,
            transform: [{ translateY: rise.interpolate({ inputRange: [0, 1], outputRange: [26, 0] }) }],
          },
        ]}
      >
        <Text style={[styles.label, { color: colors.textMuted }]}>PROMOTED</Text>

        <Animated.View
          style={{
            marginTop: 14,
            opacity: swap.interpolate({ inputRange: [0.4, 1], outputRange: [0, 1] }),
            transform: [{ scale: swap.interpolate({ inputRange: [0.4, 1], outputRange: [0.7, 1] }) }],
          }}
        >
          <LeagueBadge league={to} size={64} />
        </Animated.View>

        <View style={styles.swapWrap}>
          <Animated.Text
            style={[
              styles.league,
              {
                color: LEAGUE_INK[from],
                opacity: swap.interpolate({ inputRange: [0, 0.45], outputRange: [1, 0] }),
                transform: [
                  { translateY: swap.interpolate({ inputRange: [0, 1], outputRange: [0, -30] }) },
                ],
              },
            ]}
          >
            {from}
          </Animated.Text>

          <Animated.Text
            style={[
              styles.league,
              styles.incoming,
              {
                color: LEAGUE_INK[to],
                opacity: swap.interpolate({ inputRange: [0.45, 1], outputRange: [0, 1] }),
                transform: [
                  { translateY: swap.interpolate({ inputRange: [0, 1], outputRange: [34, 0] }) },
                ],
              },
            ]}
          >
            {to}
          </Animated.Text>
        </View>

        {/* Said here because this is the one screen where somebody might think
            the climb or a duel got them here. */}
        <Text style={[styles.sub, { color: colors.textMuted }]}>
          {to === 'Legend'
            ? 'The top of the ladder. A thousand points this season, and forty a day.'
            : 'Your season points from the daily. The other games are for fun — they do not count.'}
        </Text>

        <Pressable
          onPress={onDone}
          style={({ pressed }) => [
            styles.button,
            { backgroundColor: colors.text, opacity: pressed ? 0.85 : 1 },
          ]}
        >
          <Text style={[styles.buttonText, { color: colors.background }]}>Keep going</Text>
        </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    backgroundColor: 'rgba(0,0,0,0.72)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 26,
    zIndex: 20,
  },
  rings: { alignItems: 'center', justifyContent: 'center' },
  card: { width: '100%', borderRadius: 22, padding: 24, alignItems: 'center' },
  label: { fontSize: 11, fontFamily: fonts.extraBold, letterSpacing: 1.4 },
  swapWrap: { height: 52, justifyContent: 'center', marginTop: 10 },
  league: { fontSize: 40, fontFamily: fonts.extraBold, letterSpacing: -1, textAlign: 'center' },
  incoming: { position: 'absolute', left: 0, right: 0 },
  sub: { fontSize: 13, fontFamily: fonts.medium, lineHeight: 19, textAlign: 'center', marginTop: 10 },
  button: { marginTop: 20, borderRadius: radius.button, paddingVertical: 14, paddingHorizontal: 34 },
  buttonText: { fontSize: 15, fontFamily: fonts.extraBold },
});

import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from './AppText';
import { fonts } from '../theme/fonts';
import { useTheme } from '../theme/ThemeContext';
import { playTap } from '../utils/sound';

/**
 * Round one asks for a bet before it asks for a guess.
 *
 * Say how many guesses you need. Hit the call and take the points listed; find
 * it later and take 5; never find it and take 3. Seven is the whole
 * allowance for the smallest prize, so refusing to bet is itself a bet - there
 * is no opt-out to hide in, and the only route to thirty is saying out loud
 * that one guess will do.
 *
 * It is not the mathematically optimal play and never will be: a cold search
 * finds the number in three guesses about six times in a hundred. That is the
 * point. The bold call is a story, not a strategy, and the game should pay it
 * like one.
 */

export const CALLS: { n: number; pay: number }[] = [
  { n: 1, pay: 30 },
  { n: 2, pay: 20 },
  { n: 3, pay: 18 },
  { n: 4, pay: 16 },
  { n: 5, pay: 14 },
  { n: 6, pay: 12 },
  { n: 7, pay: 10 },
];

export const LATE_PAY = 5;
export const MISS_PAY = 3;

export function CallYourShot({ onCall, busy }: { onCall: (n: number) => void; busy?: boolean }) {
  const { colors } = useTheme();

  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Text style={[styles.label, { color: colors.textMuted }]}>CALL YOUR SHOT</Text>
      <Text style={[styles.lede, { color: colors.textMuted }]}>
        Say how many guesses you'll need. Hit your call and take the points below. Find it later
        and take {LATE_PAY}; never find it and take {MISS_PAY}.
      </Text>

      {/* One list rather than seven cards: this is a single decision, and seven
          bordered boxes for it filled the screen and read as a form. */}
      <View style={[styles.list, { borderColor: colors.border }]}>
        {CALLS.map((c, i) => (
          <Pressable
            key={c.n}
            disabled={busy}
            onPress={() => {
              playTap();
              onCall(c.n);
            }}
            style={({ pressed }) => [
              styles.row,
              {
                borderTopWidth: i === 0 ? 0 : 1,
                borderColor: colors.border,
                backgroundColor: pressed ? colors.surfaceAlt : colors.surface,
              },
            ]}
          >
            {/* Numerals on both sides, so the trade reads straight across
                rather than asking anybody to turn a word into a number. Seven
                used to be greyed as the safe option, which read as disabled. */}
            <Text style={[styles.n, { color: colors.text }]}>
              {c.n} {c.n === 1 ? 'guess' : 'guesses'}
            </Text>
            <View style={styles.payRow}>
              <Text style={[styles.pay, { color: colors.text }]}>{c.pay}</Text>
              <Text style={[styles.unit, { color: colors.textMuted }]}>pts</Text>
            </View>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 18, padding: 16 },
  label: { fontSize: 10.5, fontFamily: fonts.extraBold, letterSpacing: 1.2 },
  lede: { fontSize: 13, fontFamily: fonts.medium, lineHeight: 19, marginTop: 6 },
  list: { borderWidth: 1.5, borderRadius: 16, overflow: 'hidden', marginTop: 12 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  n: { fontSize: 15.5, fontFamily: fonts.extraBold },
  payRow: { flexDirection: 'row', alignItems: 'baseline', gap: 4 },
  pay: { fontSize: 19, fontFamily: fonts.extraBold },
  unit: { fontSize: 11.5, fontFamily: fonts.bold },
});

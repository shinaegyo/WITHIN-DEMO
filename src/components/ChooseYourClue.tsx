import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from './AppText';
import { fonts } from '../theme/fonts';
import { useTheme } from '../theme/ThemeContext';
import { playTap } from '../utils/sound';

/**
 * Round two hands over a fact, and lets you choose what kind of fact it is.
 *
 * The choice is the point, and so is the trade inside it: digits and factors
 * are scattered through the range and take working out, where-it-sits is
 * contiguous and easy to act on and tells you the least. Nobody can know which
 * is better until they see it, which is what makes picking one interesting
 * rather than administrative.
 *
 * The clue is written down on the server when it is chosen, so closing the app
 * and coming back cannot reroll it into a kinder one.
 */

export type ClueKind = 'digits' | 'factors' | 'where';

/**
 * Six guesses, and what finding it on each one pays.
 *
 * Where-it-sits fences the number between two round hundreds: the least work
 * and the most immediately useful, so it tops out lower. The other two are
 * scattered through the range and take working out, and they keep the full
 * ladder. That is what makes the choice a decision rather than a preference.
 */
export const CLUE_PAYS: Record<ClueKind, number[]> = {
  digits: [16, 14, 12, 10, 8, 6],
  factors: [16, 14, 12, 10, 8, 6],
  where: [12, 10, 9, 8, 7, 6],
};

const KINDS: { kind: ClueKind; title: string; detail: string }[] = [
  {
    kind: 'digits',
    title: 'How it is written',
    detail: 'What its digits add to, which ones appear, how they run',
  },
  {
    kind: 'factors',
    title: 'What it is made of',
    detail: 'What divides it, and what it is built from',
  },
  {
    kind: 'where',
    title: 'Where it sits',
    detail: 'Fenced between two things you already know',
  },
];

export function ChooseYourClue({
  onChoose,
  busy,
}: {
  onChoose: (kind: ClueKind) => void;
  busy?: boolean;
}) {
  const { colors } = useTheme();

  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Text style={[styles.label, { color: colors.textMuted }]}>CHOOSE YOUR CLUE</Text>
      <Text style={[styles.lede, { color: colors.textMuted }]}>
        One of them, and you only find out what it says after you pick.
      </Text>

      <View style={styles.choices}>
        {KINDS.map((k) => (
          <Pressable
            key={k.kind}
            disabled={busy}
            onPress={() => {
              playTap();
              onChoose(k.kind);
            }}
            style={({ pressed }) => [
              styles.choice,
              {
                borderColor: pressed ? colors.accent : colors.border,
                backgroundColor: colors.surface,
              },
            ]}
          >
            <View style={styles.head}>
              <Text style={[styles.title, { color: colors.text }]}>{k.title}</Text>
              {/* The ceiling, said on the card. The choice is only a decision
                  if the price of the easy one is visible before it is made. */}
              <Text style={[styles.upTo, { color: colors.textMuted }]}>
                up to {CLUE_PAYS[k.kind][0]}
              </Text>
            </View>
            <Text style={[styles.detail, { color: colors.textMuted }]}>{k.detail}</Text>
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
  choices: { gap: 9, marginTop: 12 },
  choice: { borderWidth: 1.5, borderRadius: 16, paddingVertical: 13, paddingHorizontal: 16 },
  head: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 },
  title: { fontSize: 15.5, fontFamily: fonts.extraBold, flexShrink: 1 },
  upTo: { fontSize: 11.5, fontFamily: fonts.bold },
  detail: { fontSize: 12.5, fontFamily: fonts.medium, marginTop: 3, lineHeight: 17 },
});

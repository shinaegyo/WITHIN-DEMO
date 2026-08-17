import React, { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Text } from './AppText';
import { fonts } from '../theme/fonts';
import { useTheme } from '../theme/ThemeContext';
import { playTap } from '../utils/sound';

/**
 * Round three stops asking what the number is and asks how sure you are.
 *
 * Three free guesses have already been spent by the time this appears - they
 * cost nothing and end nothing, which is what makes the range a decision rather
 * than a shrug. The narrower it is the more it pays, naming it exactly pays
 * nearly double the next step down, and a miss still pays the floor.
 *
 * A center and a spread rather than two ends: asking for "812 to 823" makes the
 * player do the arithmetic the game is about to score them on, and hides the
 * only number that matters - how wide they were willing to be.
 */

export const SPREADS = [0, 1, 3, 5, 8, 12, 18, 25, 35];
export const SPREAD_PAYS = [24, 18, 16, 14, 12, 10, 8, 6, 4];
const DEFAULT_SPREAD = 3; // ±5
const MISS_PAY = 3;

export function CommitRange({
  onCommit,
  busy,
}: {
  onCommit: (lo: number, hi: number) => void;
  busy?: boolean;
}) {
  const { colors } = useTheme();
  const [center, setCenter] = useState('');
  const [idx, setIdx] = useState(DEFAULT_SPREAD);

  const spread = SPREADS[idx];
  const c = parseInt(center, 10);
  const valid = !!c && c >= 1 && c <= 1000;
  const lo = valid ? Math.max(1, c - spread) : null;
  const hi = valid ? Math.min(1000, c + spread) : null;

  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Text style={[styles.label, { color: colors.textMuted }]}>COMMIT TO A RANGE</Text>
      <Text style={[styles.lede, { color: colors.textMuted }]}>
        No more guesses. Name a range you believe it is inside — the narrower it is, the more it
        pays. Name it exactly and it pays double.
      </Text>

      <TextInput
        value={center}
        onChangeText={(t) => setCenter(t.replace(/[^0-9]/g, '').slice(0, 4))}
        placeholder="Enter number"
        placeholderTextColor={colors.textMuted}
        keyboardType="number-pad"
        style={[
          styles.input,
          { borderColor: colors.border, color: colors.text, backgroundColor: colors.background },
        ]}
      />

      <View style={styles.stepper}>
        <Pressable
          onPress={() => { playTap(); setIdx((i) => Math.max(0, i - 1)); }}
          style={[styles.step, { backgroundColor: colors.surfaceAlt }]}
        >
          <Text style={[styles.stepText, { color: colors.text }]}>−</Text>
        </Pressable>

        <View style={styles.middle}>
          <Text style={[styles.spread, { color: colors.text }]}>
            {spread === 0 ? 'exactly' : `±${spread}`}
          </Text>
          <Text style={[styles.width, { color: colors.textMuted }]}>
            {spread === 0 ? 'one number' : `${2 * spread + 1} wide`}
          </Text>
        </View>

        <Pressable
          onPress={() => { playTap(); setIdx((i) => Math.min(SPREADS.length - 1, i + 1)); }}
          style={[styles.step, { backgroundColor: colors.surfaceAlt }]}
        >
          <Text style={[styles.stepText, { color: colors.text }]}>+</Text>
        </Pressable>
      </View>

      <Text style={[styles.range, { color: colors.text }]}>
        {valid ? (spread === 0 ? `exactly ${c}` : `${lo} to ${hi}`) : 'Pick a center'}
      </Text>
      <Text style={[styles.pays, { color: colors.textMuted }]}>
        Inside pays {SPREAD_PAYS[idx]} pts · outside pays {MISS_PAY} pts
      </Text>

      <Pressable
        disabled={!valid || busy}
        onPress={() => {
          playTap();
          if (lo !== null && hi !== null) onCommit(lo, hi);
        }}
        style={({ pressed }) => [
          styles.commit,
          { backgroundColor: colors.text, opacity: !valid || busy ? 0.4 : pressed ? 0.85 : 1 },
        ]}
      >
        <Text style={[styles.commitText, { color: colors.background }]}>Commit</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 18, padding: 16, gap: 12 },
  label: { fontSize: 10.5, fontFamily: fonts.extraBold, letterSpacing: 1.2 },
  lede: { fontSize: 13, fontFamily: fonts.medium, lineHeight: 19 },
  input: {
    borderWidth: 2,
    borderRadius: 15,
    paddingHorizontal: 15,
    paddingVertical: 13,
    fontSize: 20,
    fontFamily: fonts.bold,
  },
  stepper: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  step: { borderRadius: 14, paddingVertical: 9, paddingHorizontal: 20 },
  stepText: { fontSize: 20, fontFamily: fonts.extraBold },
  middle: { alignItems: 'center' },
  spread: { fontSize: 28, fontFamily: fonts.extraBold, letterSpacing: -0.5 },
  width: { fontSize: 12, fontFamily: fonts.semiBold, marginTop: 2 },
  range: { fontSize: 15, fontFamily: fonts.bold, textAlign: 'center' },
  pays: { fontSize: 12.5, fontFamily: fonts.bold, textAlign: 'center' },
  commit: { borderRadius: 16, paddingVertical: 15, alignItems: 'center' },
  commitText: { fontSize: 16, fontFamily: fonts.extraBold },
});

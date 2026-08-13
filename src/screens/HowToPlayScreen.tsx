import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { proximityColors } from '../theme/colors';
import { fonts } from '../theme/fonts';
import { useTheme } from '../theme/ThemeContext';

/** Nothing in the game explains the colour system, so this screen does. */
export function HowToPlayScreen() {
  const { colors } = useTheme();

  const Row = ({ color, label, meaning }: { color: string; label: string; meaning: string }) => (
    <View style={styles.row}>
      <View style={[styles.swatch, { backgroundColor: color }]} />
      <View style={styles.rowText}>
        <Text style={[styles.rowLabel, { color: colors.text }]}>{label}</Text>
        <Text style={[styles.rowMeaning, { color: colors.textMuted }]}>{meaning}</Text>
      </View>
    </View>
  );

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <Text style={[styles.h1, { color: colors.text }]}>How to play</Text>
      <Text style={[styles.body, { color: colors.textMuted }]}>
        One number between 1 and 1000 is chosen each day. Everyone gets the same number, and you have
        seven guesses to find it.
      </Text>

      <Text style={[styles.h2, { color: colors.text }]}>Reading a guess</Text>
      <Text style={[styles.body, { color: colors.textMuted }]}>
        An arrow tells you which way to go: ▲ means the answer is higher than your guess, ▼ means it's
        lower. The colour tells you how close you are — blue when you're too low, red when you're too
        high. The stronger the colour, the closer you are.
      </Text>

      <View style={styles.rows}>
        <Row color={proximityColors.below.light} label="100+ away" meaning="Not close yet" />
        <Row color={proximityColors.below.medium} label="25–99 away" meaning="Getting warmer" />
        <Row color={proximityColors.below.dark} label="11–24 away" meaning="Close" />
        <Row color={proximityColors.below.intense} label="Within 10" meaning="Very close" />
      </View>

      <Text style={[styles.h2, { color: colors.text }]}>Clues</Text>
      <Text style={[styles.body, { color: colors.textMuted }]}>
        You start with one clue about the number. Land a guess within 10 and a second, more useful clue
        unlocks for the rest of the game.
      </Text>

      <Text style={[styles.h2, { color: colors.text }]}>Scoring</Text>
      <Text style={[styles.body, { color: colors.textMuted }]}>
        The sooner you find it, the more you score.
      </Text>
      <View style={[styles.scoreBox, { borderColor: colors.border }]}>
        {[
          ['1st guess', 100],
          ['2nd guess', 95],
          ['3rd guess', 90],
          ['4th guess', 80],
          ['5th guess', 70],
          ['6th guess', 60],
          ['7th guess', 50],
        ].map(([label, points]) => (
          <View key={String(label)} style={styles.scoreRow}>
            <Text style={[styles.scoreLabel, { color: colors.textMuted }]}>{label}</Text>
            <Text style={[styles.scoreValue, { color: colors.text }]}>{points}</Text>
          </View>
        ))}
        <View style={styles.scoreRow}>
          <Text style={[styles.scoreLabel, { color: colors.textMuted }]}>Out of guesses</Text>
          <Text style={[styles.scoreValue, { color: colors.text }]}>0</Text>
        </View>
      </View>

      <Text style={[styles.h2, { color: colors.text }]}>Streaks</Text>
      <Text style={[styles.body, { color: colors.textMuted }]}>
        Solve the number every day to build a streak. Miss a day, or run out of guesses, and it starts
        again from zero. A new number arrives at midnight, your time.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 24, paddingBottom: 60 },
  h1: { fontSize: 30, fontFamily: fonts.logo, letterSpacing: -0.6, marginBottom: 14 },
  h2: { fontSize: 17, fontFamily: fonts.extraBold, marginTop: 26, marginBottom: 6 },
  body: { fontSize: 15, fontFamily: fonts.medium, lineHeight: 22 },
  rows: { marginTop: 14, gap: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  swatch: { width: 34, height: 34, borderRadius: 9 },
  rowText: { flex: 1 },
  rowLabel: { fontSize: 14, fontFamily: fonts.bold },
  rowMeaning: { fontSize: 12, fontFamily: fonts.medium },
  scoreBox: { borderWidth: 1, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 6, marginTop: 12 },
  scoreRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 7 },
  scoreLabel: { fontSize: 14, fontFamily: fonts.medium },
  scoreValue: { fontSize: 15, fontFamily: fonts.extraBold },
});

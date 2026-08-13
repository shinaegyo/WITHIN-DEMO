import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { RoundSummary } from '../lib/api';
import { feedbackColors } from '../theme/colors';
import { fonts } from '../theme/fonts';
import { useTheme } from '../theme/ThemeContext';

interface Props {
  currentRound: number;
  totalRounds: number;
  rounds: RoundSummary[];
  totalScore: number;
}

/**
 * Three segments, one per round, so a player can see at a glance where they
 * are in the day and what each finished round scored.
 */
export function RoundProgress({ currentRound, totalRounds, rounds, totalScore }: Props) {
  const { colors } = useTheme();

  const byRound = new Map(rounds.map((r) => [r.round, r]));

  return (
    <View style={styles.wrap}>
      <View style={styles.headRow}>
        <Text style={[styles.label, { color: colors.textMuted }]}>
          ROUND {currentRound} OF {totalRounds}
        </Text>
        <Text style={[styles.score, { color: colors.text }]}>
          {totalScore}
          <Text style={[styles.scoreMax, { color: colors.textMuted }]}> / 300</Text>
        </Text>
      </View>

      <View style={styles.bar}>
        {Array.from({ length: totalRounds }).map((_, i) => {
          const n = i + 1;
          const r = byRound.get(n);
          const done = r?.status === 'won';
          const failed = r?.status === 'lost';
          const active = n === currentRound && !done && !failed;

          return (
            <View
              key={n}
              style={[
                styles.segment,
                {
                  backgroundColor: done
                    ? feedbackColors.correct
                    : failed
                      ? feedbackColors.oneAway
                      : active
                        ? colors.accent
                        : colors.border,
                },
              ]}
            >
              {done && <Text style={styles.segmentText}>{r?.score}</Text>}
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  headRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  label: { fontSize: 10, fontFamily: fonts.bold, letterSpacing: 1.2 },
  score: { fontSize: 16, fontFamily: fonts.extraBold },
  scoreMax: { fontSize: 12, fontFamily: fonts.bold },
  bar: { flexDirection: 'row', gap: 6 },
  segment: {
    flex: 1,
    height: 8,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentText: {
    color: '#FFFFFF',
    fontSize: 7,
    fontFamily: fonts.bold,
  },
});

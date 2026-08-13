import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme/ThemeContext';

interface Props {
  clue1: string;
  clue2: string;
  clue2Unlocked: boolean;
}

export function ClueCard({ clue1, clue2, clue2Unlocked }: Props) {
  const { colors } = useTheme();

  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={styles.clueRow}>
        <Text style={[styles.clueLabel, { color: colors.textMuted }]}>CLUE 1</Text>
        <Text style={[styles.clueText, { color: colors.text }]}>{clue1}</Text>
      </View>
      <View style={[styles.divider, { backgroundColor: colors.border }]} />
      <View style={styles.clueRow}>
        <Text style={[styles.clueLabel, { color: colors.textMuted }]}>CLUE 2</Text>
        {clue2Unlocked ? (
          <Text style={[styles.clueText, { color: colors.text }]}>{clue2}</Text>
        ) : (
          <Text style={[styles.clueText, styles.locked, { color: colors.textMuted }]}>
            🔒 Unlocks when you get WITHIN 10
          </Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  clueRow: {
    gap: 4,
  },
  clueLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  clueText: {
    fontSize: 15,
    fontWeight: '600',
  },
  locked: {
    fontStyle: 'italic',
    fontWeight: '500',
  },
  divider: {
    height: 1,
    marginVertical: 10,
  },
});

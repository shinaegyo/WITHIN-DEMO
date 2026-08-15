import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from './AppText';
import { fonts } from '../theme/fonts';
import { useTheme } from '../theme/ThemeContext';

/**
 * The round's clue.
 *
 * One clue, always. A second used to unlock at WITHIN 10 - the moment a round
 * is already as good as won - so it arrived where it was least needed and made
 * the card jump while somebody was reading it.
 */
export function ClueCard({ clue }: { clue: string }) {
  const { colors } = useTheme();

  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Text style={[styles.label, { color: colors.textMuted }]}>CLUE</Text>
      <Text style={[styles.clueText, { color: colors.text }]}>{clue}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  label: {
    fontSize: 11,
    fontFamily: fonts.bold,
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  clueText: { fontSize: 15.5, fontFamily: fonts.bold, textAlign: 'center', lineHeight: 21 },
});

import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { GuessResult } from '../game/types';
import { useTheme } from '../theme/ThemeContext';
import { GuessRow } from './GuessRow';

interface Props {
  guesses: GuessResult[];
}

export function GuessHistory({ guesses }: Props) {
  const { colors } = useTheme();

  if (guesses.length === 0) {
    return (
      <View style={styles.emptyWrap}>
        <Text style={[styles.emptyText, { color: colors.textMuted }]}>Your guesses will appear here.</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      {guesses.map((result, index) => (
        <GuessRow key={index} result={result} attemptNumber={index + 1} />
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
  },
  content: {
    paddingBottom: 8,
  },
  emptyWrap: {
    paddingVertical: 24,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 14,
  },
});

import React from 'react';
import { StyleSheet, View } from 'react-native';
import { GuessResult } from '../game/types';
import { EmptySlot, FilledSlot } from './GuessSlot';

interface Props {
  guesses: GuessResult[];
  maxAttempts: number;
}

/**
 * Always renders every attempt slot so the player can see up front how many
 * guesses they get; slots fill in from the top as guesses are made.
 */
export function GuessBoard({ guesses, maxAttempts }: Props) {
  return (
    <View style={styles.board}>
      {Array.from({ length: maxAttempts }).map((_, index) => {
        const result = guesses[index];
        return result ? (
          <FilledSlot key={index} result={result} attemptNumber={index + 1} />
        ) : (
          <EmptySlot key={index} attemptNumber={index + 1} />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  board: {
    flex: 1,
    gap: 8,
  },
});

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { GuessResult } from '../game/types';
import { fonts } from '../theme/fonts';
import { useTheme } from '../theme/ThemeContext';
import { FilledSlot } from './GuessSlot';

interface Props {
  guesses: GuessResult[];
  /** Drives the count shown under the board. */
  attemptsAllowed: number;
  /** Hidden once the round is over, when the count no longer means anything. */
  showRemaining?: boolean;
  /** Extra line on the final guess. Round-specific, so the screen supplies it. */
  finalNote?: string;
}

/**
 * Only the guesses actually made, newest at the top.
 *
 * The input sits above this, so the most recent guess is the one directly under
 * the field the player is typing in — they read the answer to what they just
 * did without moving their eyes down the list. Older guesses fall away beneath.
 *
 * Laying out every empty slot in advance, as this once did, turned the board
 * into a countdown of everything still to lose; the count is stated in words
 * instead.
 */
export function GuessBoard({ guesses, attemptsAllowed, showRemaining = true, finalNote }: Props) {
  const { colors } = useTheme();
  const remaining = Math.max(0, attemptsAllowed - guesses.length);

  return (
    <View style={styles.board}>
      {showRemaining && remaining > 0 && (
        <View style={styles.header}>
          {remaining === 1 ? (
            <>
              <Text style={[styles.count, { color: colors.text }]}>LAST GUESS</Text>
              {!!finalNote && (
                <Text style={[styles.note, { color: colors.textMuted }]}>{finalNote}</Text>
              )}
            </>
          ) : (
            <Text style={[styles.count, { color: colors.text }]}>{remaining} GUESSES LEFT</Text>
          )}
        </View>
      )}

      {guesses
        .map((result, index) => ({ result, attemptNumber: index + 1 }))
        .reverse()
        .map(({ result, attemptNumber }) => (
          <FilledSlot key={attemptNumber} result={result} attemptNumber={attemptNumber} />
        ))}
    </View>
  );
}

const styles = StyleSheet.create({
  board: {
    flex: 1,
    gap: 8,
  },
  header: {
    alignItems: 'center',
    paddingBottom: 2,
  },
  count: {
    fontSize: 14,
    fontFamily: fonts.extraBold,
    letterSpacing: 1.4,
  },
  note: {
    fontSize: 11.5,
    fontFamily: fonts.medium,
    textAlign: 'center',
    marginTop: 3,
  },
});

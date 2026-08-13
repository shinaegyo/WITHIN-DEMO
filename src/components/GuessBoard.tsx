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
 * Only the guesses actually made. Laying out every empty slot in advance turned
 * the board into a countdown of everything still to lose, and left the real
 * guesses squeezed into a strip at the top. The board now grows with the round,
 * and how many guesses remain is stated in words underneath instead.
 */
export function GuessBoard({ guesses, attemptsAllowed, showRemaining = true, finalNote }: Props) {
  const { colors } = useTheme();
  const remaining = Math.max(0, attemptsAllowed - guesses.length);

  return (
    <View style={styles.board}>
      {guesses.map((result, index) => (
        <FilledSlot key={index} result={result} attemptNumber={index + 1} />
      ))}

      {showRemaining && remaining > 0 && (
        <View style={styles.footer}>
          {remaining === 1 ? (
            <>
              <Text style={[styles.count, { color: colors.text }]}>LAST GUESS</Text>
              {!!finalNote && (
                <Text style={[styles.note, { color: colors.textMuted }]}>{finalNote}</Text>
              )}
            </>
          ) : (
            <Text style={[styles.count, { color: colors.textMuted }]}>{remaining} GUESSES LEFT</Text>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  board: {
    flex: 1,
    gap: 8,
    // Guesses stack upward from the input rather than down from the clue.
    // With rounds as short as five attempts, top-aligning left a wide gap
    // between the last guess and the field, and put the newest guess furthest
    // from where the player is typing.
    justifyContent: 'flex-end',
  },
  footer: {
    alignItems: 'center',
    paddingTop: 4,
  },
  count: {
    fontSize: 11,
    fontFamily: fonts.bold,
    letterSpacing: 1.4,
  },
  note: {
    fontSize: 11.5,
    fontFamily: fonts.medium,
    textAlign: 'center',
    marginTop: 3,
  },
});

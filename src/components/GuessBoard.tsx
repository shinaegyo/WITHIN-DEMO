import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from './AppText';
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
  /** Impossible only: a one-away guess keeps its label but loses its arrow. */
  blindOneAway?: boolean;
  /**
   * Overrides the theme ink. Impossible paints its own arena, and the count
   * above the board is the first thing to disappear when the two disagree.
   */
  ink?: string;
  inkMuted?: string;
  /** Ground for the tiles that have no saturated fill of their own. */
  tileSurface?: string;
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
export function GuessBoard({
  guesses,
  attemptsAllowed,
  showRemaining = true,
  finalNote,
  blindOneAway,
  ink,
  inkMuted,
  tileSurface,
}: Props) {
  const { colors } = useTheme();
  const remaining = Math.max(0, attemptsAllowed - guesses.length);
  const strong = ink ?? colors.text;
  const soft = inkMuted ?? colors.textMuted;

  return (
    <View style={styles.board}>
      {showRemaining && remaining > 0 && (
        <View style={styles.header}>
          {remaining === 1 ? (
            <>
              <Text style={[styles.count, { color: strong }]}>LAST GUESS</Text>
              {!!finalNote && <Text style={[styles.note, { color: soft }]}>{finalNote}</Text>}
            </>
          ) : (
            <Text style={[styles.count, { color: strong }]}>{remaining} GUESSES LEFT</Text>
          )}
        </View>
      )}

      {guesses
        .map((result, index) => ({ result, attemptNumber: index + 1 }))
        .reverse()
        .map(({ result, attemptNumber }) => (
          <FilledSlot
            key={attemptNumber}
            result={result}
            attemptNumber={attemptNumber}
            blindOneAway={blindOneAway}
            surface={tileSurface}
            ink={ink}
          />
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

import React from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { useTheme } from '../theme/ThemeContext';

/**
 * A phone-shaped column, on screens wider than a phone.
 *
 * Every screen in the app was laid out at 375 points and nothing capped its
 * width, so on an iPad or a laptop the same rows stretched to whatever the
 * window happened to be: a name at the far left, its score a hand's width away
 * at the far right, and a guess input the length of a desk. Nothing was broken
 * and all of it looked wrong.
 *
 * One column, centred, at the width the layouts were designed for. It goes
 * here rather than into fifteen screens because it is the same answer for all
 * of them, and a screen added next month gets it without knowing.
 *
 * The edges are drawn only when there is something either side of them to
 * separate - on a phone the column is the window, and a hairline down both
 * sides of the screen would be a frame around nothing.
 */

/** What the screens were drawn for, with room for the widest phone. */
const COLUMN = 460;

export function AppFrame({ children }: { children: React.ReactNode }) {
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const wide = width > COLUMN;

  return (
    <View style={[styles.outer, { backgroundColor: colors.background }]}>
      <View
        style={[
          styles.column,
          wide && { borderLeftWidth: 1, borderRightWidth: 1, borderColor: colors.border },
        ]}
      >
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  outer: { flex: 1, alignItems: 'center' },
  column: { flex: 1, width: '100%', maxWidth: COLUMN },
});

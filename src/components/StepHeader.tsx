import React from 'react';
import { StyleSheet, View } from 'react-native';
import { BackButton } from './BackButton';
import { useTheme } from '../theme/ThemeContext';

/**
 * The way out of a step.
 *
 * Onboarding ran forwards only. Every screen in it could be reached and none
 * could be left, so a name with a typo in it, or a face picked by a thumb on
 * the way past, was settled until the whole tutorial had been sat through -
 * and the name is the one people most want back, which is why the rule that
 * governs it has a grace day written into it.
 *
 * Back only, on purpose. Forwards is what the button at the bottom of each
 * step is for, and it is the button because going on is the step's own work -
 * saving a name, keeping a face, finishing a round. An arrow beside it doing
 * the same job either duplicates that work or skips it, and a control that
 * sometimes skips the step it sits on is worse than no control.
 */
export function StepHeader({ onBack }: { onBack?: () => void }) {
  const { colors } = useTheme();

  if (!onBack) return null;

  return (
    <View style={styles.row}>
      <BackButton color={colors.text} onPress={onBack} />
    </View>
  );
}

const styles = StyleSheet.create({
  // Sits low enough to read as part of the screen rather than as something
  // stuck to the top edge of it. On a phone the safe area has already pushed
  // this down; the padding is what keeps the arrow clear of the camera
  // housing everywhere else.
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 2,
  },
});

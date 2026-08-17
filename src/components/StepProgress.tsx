import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from './AppText';
import { fonts } from '../theme/fonts';
import { useTheme } from '../theme/ThemeContext';

/**
 * Where you are in onboarding: the count, and the same thing as a bar.
 *
 * Lifted out of the first screen rather than reinvented per screen. Step one
 * counted itself against a four segment bar while step two put a bare "STEP 2
 * OF 4" in the top corner, so the two screens either side of a single press
 * disagreed about what a step even looked like - and the corner version sat
 * up beside the back arrow, which is chrome, rather than with the heading,
 * which is what it is actually about.
 */
export function StepProgress({ step, total }: { step: number; total: number }) {
  const { colors } = useTheme();

  return (
    <>
      <Text style={[styles.label, { color: colors.textMuted }]}>
        STEP {step} OF {total}
      </Text>
      <View style={styles.bar}>
        {Array.from({ length: total }, (_, i) => i + 1).map((n) => (
          <View
            key={n}
            style={[
              styles.segment,
              { backgroundColor: n <= step ? colors.accent : colors.border },
            ]}
          />
        ))}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 10, fontFamily: fonts.bold, letterSpacing: 1.4, marginBottom: 8 },
  bar: { flexDirection: 'row', gap: 6, marginBottom: 30 },
  segment: { flex: 1, height: 4, borderRadius: 2 },
});

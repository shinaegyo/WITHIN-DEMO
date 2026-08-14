import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { HowToPlayScreen } from './HowToPlayScreen';
import { fonts } from '../theme/fonts';
import { useTheme } from '../theme/ThemeContext';

/**
 * The rules, shown once, before a new player's first round.
 *
 * Wraps the How to Play screen rather than restating it. Two copies of the
 * rules would drift the first time one of them changed, and this one would be
 * the copy nobody remembered to update.
 */
export function IntroScreen({ onNext }: { onNext: () => void }) {
  const { colors } = useTheme();

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]} edges={['top', 'bottom']}>
      <View style={styles.head}>
        <Text style={[styles.title, { color: colors.text }]}>How it works</Text>
        <Text style={[styles.sub, { color: colors.textMuted }]}>
          Two screens, then a round that costs you nothing.
        </Text>
      </View>

      <View style={styles.body}>
        <HowToPlayScreen showTitle={false} compact />
      </View>

      <View style={[styles.foot, { borderColor: colors.border }]}>
        <Pressable
          style={({ pressed }) => [
            styles.button,
            { backgroundColor: colors.text, opacity: pressed ? 0.85 : 1 },
          ]}
          onPress={onNext}
        >
          <Text style={[styles.buttonText, { color: colors.background }]}>Try a practice round</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  head: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 4 },
  title: { fontSize: 26, fontFamily: fonts.extraBold, letterSpacing: -0.5 },
  sub: { fontSize: 13, fontFamily: fonts.medium, marginTop: 2 },
  body: { flex: 1 },
  foot: { borderTopWidth: 1, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8 },
  button: { borderRadius: 15, paddingVertical: 16, alignItems: 'center' },
  buttonText: { fontSize: 15.5, fontFamily: fonts.extraBold },
});

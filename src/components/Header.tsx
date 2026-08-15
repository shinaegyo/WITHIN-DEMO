import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from './AppText';
import { fonts } from '../theme/fonts';
import { useTheme } from '../theme/ThemeContext';
import { Wordmark } from './Wordmark';

/** `onBack` is only supplied while a game can still be abandoned — see GameScreen. */
export function Header({ onBack }: { onBack?: () => void }) {
  const { colors, mode, toggle } = useTheme();

  return (
    <View style={styles.wrap}>
      <View style={styles.left}>
        {onBack && (
          <Pressable onPress={onBack} hitSlop={12} accessibilityLabel="Back to home">
            <Text style={[styles.back, { color: colors.textMuted }]}>‹</Text>
          </Pressable>
        )}
        <Wordmark size={24} color={colors.text} />
      </View>

      <Pressable
        style={[styles.iconButton, { backgroundColor: colors.surfaceAlt }]}
        onPress={toggle}
        accessibilityLabel="Toggle light/dark mode"
      >
        <Text style={styles.iconText}>{mode === 'dark' ? '☀' : '☾'}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  left: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  back: {
    fontSize: 30,
    lineHeight: 32,
    fontFamily: fonts.bold,
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconText: {
    fontSize: 17,
  },
});

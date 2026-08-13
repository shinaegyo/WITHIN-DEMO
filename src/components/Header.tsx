import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { fonts } from '../theme/fonts';
import { useTheme } from '../theme/ThemeContext';

interface Props {
  onReset: () => void;
}

export function Header({ onReset }: Props) {
  const { colors, mode, toggle } = useTheme();

  return (
    <View style={styles.wrap}>
      <Text style={[styles.title, { color: colors.text }]}>WITHIN</Text>
      <View style={styles.actions}>
        <Pressable
          style={[styles.iconButton, { backgroundColor: colors.surfaceAlt }]}
          onPress={toggle}
          accessibilityLabel="Toggle light/dark mode"
        >
          <Text style={styles.iconText}>{mode === 'dark' ? '☀️' : '🌙'}</Text>
        </Pressable>
        {__DEV__ && (
          <Pressable
            style={[styles.iconButton, { backgroundColor: colors.surfaceAlt }]}
            onPress={onReset}
            accessibilityLabel="Reset game (dev)"
          >
            <Text style={styles.iconText}>↺</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    fontSize: 24,
    fontFamily: fonts.logo,
    letterSpacing: -0.5,
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconText: {
    fontSize: 18,
  },
});

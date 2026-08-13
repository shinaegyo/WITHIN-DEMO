import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Wordmark } from './Wordmark';
import { fonts } from '../theme/fonts';
import { useTheme } from '../theme/ThemeContext';

export function Header() {
  const { colors, mode, toggle } = useTheme();

  return (
    <View style={styles.wrap}>
      <Wordmark size={24} />
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
  title: {
    fontSize: 24,
    fontFamily: fonts.logo,
    letterSpacing: -0.5,
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

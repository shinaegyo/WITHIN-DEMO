import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { Text } from './AppText';
import { Mark } from './Mark';
import { Wordmark } from './Wordmark';
import { fonts } from '../theme/fonts';
import { useTheme } from '../theme/ThemeContext';

/** Full-screen loading and failure states for the daily fetch. */
export function StatusScreen({
  loading,
  message,
  onRetry,
}: {
  loading?: boolean;
  message?: string | null;
  onRetry?: () => void;
}) {
  const { colors } = useTheme();

  return (
    <View style={styles.wrap}>
      {/* The first thing anyone sees while the day loads, so it is the mark
          rather than the name alone. */}
      <Mark size={40} ink={colors.text} />
      <Wordmark size={30} color={colors.text} />
      {loading ? (
        <ActivityIndicator color={colors.accent} style={styles.spinner} />
      ) : (
        <>
          <Text style={[styles.message, { color: colors.textMuted }]}>{message}</Text>
          {onRetry && (
            <Pressable
              style={({ pressed }) => [
                styles.button,
                { backgroundColor: colors.accent, opacity: pressed ? 0.85 : 1 },
              ]}
              onPress={onRetry}
            >
              <Text style={styles.buttonText}>Try again</Text>
            </Pressable>
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 14,
  },
  logo: {
    fontSize: 30,
    fontFamily: fonts.logo,
    letterSpacing: -0.5,
  },
  spinner: {
    marginTop: 6,
  },
  message: {
    fontSize: 15,
    fontFamily: fonts.medium,
    textAlign: 'center',
  },
  button: {
    borderRadius: 14,
    paddingVertical: 13,
    paddingHorizontal: 26,
    marginTop: 4,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontFamily: fonts.bold,
  },
});

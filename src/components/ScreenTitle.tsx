import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from './AppText';
import { BackButton } from './BackButton';
import { fonts } from '../theme/fonts';
import { useTheme } from '../theme/ThemeContext';

/**
 * How every screen in the app opens.
 *
 * There were three headers doing this job: Rush drew its own arrow with a big
 * title under it, Duels and Impossible used the navigator's chrome header, and
 * the tabs had a centred line of their own. Four modes are coming; three
 * answers to one question is where that ends.
 *
 * A large title, because these are destinations somebody chose from Games
 * rather than steps in a flow, and the chrome header set the name of a mode
 * smaller than a row of the leaderboard underneath it. It also behaves the same
 * on web as on a phone, which the platform header does not - iOS collapses a
 * large title on scroll and the web build simply would not.
 *
 * The subtitle is part of the block rather than the first line of the body, so
 * the space between the name and the content is the same everywhere.
 */
export function ScreenTitle({
  title,
  subtitle,
  onBack,
  action,
}: {
  title: string;
  subtitle?: string;
  /** Omitted on the tabs, which have nowhere to go back to. */
  onBack?: () => void;
  /**
   * Sits on the title's own line, right-aligned. For a control that governs
   * the whole screen rather than any one thing on it - a title bar is where
   * something applying to everything below belongs, and it costs no row.
   */
  action?: React.ReactNode;
}) {
  const { colors } = useTheme();

  return (
    <View style={styles.wrap}>
      {onBack ? <BackButton color={colors.text} onPress={onBack} /> : <View style={styles.gap} />}
      <View style={styles.titleRow}>
        <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
        {action}
      </View>
      {!!subtitle && (
        <Text style={[styles.subtitle, { color: colors.textMuted }]}>{subtitle}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: 18, paddingTop: 6, paddingBottom: 10 },
  gap: { height: 8 },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  title: { flexShrink: 1, fontSize: 38, fontFamily: fonts.extraBold, letterSpacing: -1, marginTop: 2 },
  subtitle: { fontSize: 13, fontFamily: fonts.medium, lineHeight: 19, marginTop: 6 },
});

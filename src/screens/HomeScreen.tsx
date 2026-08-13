import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusScreen } from '../components/StatusScreen';
import { useDailyGameContext } from '../state/DailyGameContext';
import { feedbackColors } from '../theme/colors';
import { fonts } from '../theme/fonts';
import { useTheme } from '../theme/ThemeContext';
import { formatCountdown, msUntilLocalMidnight } from '../utils/countdown';

interface Props {
  onPlay: () => void;
  onOpenMenu: () => void;
}

export function HomeScreen({ onPlay, onOpenMenu }: Props) {
  const { colors, mode, toggle } = useTheme();
  const { phase, game, loadError, reload } = useDailyGameContext();
  const [remaining, setRemaining] = useState(msUntilLocalMidnight());

  useEffect(() => {
    const id = setInterval(() => setRemaining(msUntilLocalMidnight()), 1000);
    return () => clearInterval(id);
  }, []);

  if (phase === 'loading') {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]} edges={['top', 'bottom']}>
        <StatusScreen loading />
      </SafeAreaView>
    );
  }

  if (phase === 'failed' || !game) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]} edges={['top', 'bottom']}>
        <StatusScreen message={loadError} onRetry={reload} />
      </SafeAreaView>
    );
  }

  const finished = game.status !== 'playing';
  const inProgress = game.status === 'playing' && game.attemptsUsed > 0;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable
          style={[styles.iconButton, { backgroundColor: colors.surfaceAlt }]}
          onPress={onOpenMenu}
          accessibilityLabel="Open menu"
        >
          <Text style={[styles.menuIcon, { color: colors.text }]}>☰</Text>
        </Pressable>
        <Pressable
          style={[styles.iconButton, { backgroundColor: colors.surfaceAlt }]}
          onPress={toggle}
          accessibilityLabel="Toggle light/dark mode"
        >
          <Text style={styles.iconText}>{mode === 'dark' ? '☀' : '☾'}</Text>
        </Pressable>
      </View>

      <View style={styles.body}>
        <Text style={[styles.logo, { color: colors.text }]}>WITHIN</Text>
        <Text style={[styles.tagline, { color: colors.textMuted }]}>One number. Seven guesses.</Text>

        <View style={[styles.streakCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.streakValue, { color: colors.text }]}>{game.stats.currentStreak}</Text>
          <Text style={[styles.streakLabel, { color: colors.textMuted }]}>
            {game.stats.currentStreak === 1 ? 'DAY STREAK' : 'DAY STREAK'}
          </Text>
          {game.stats.totalPoints > 0 && (
            <Text style={[styles.totalPoints, { color: colors.textMuted }]}>
              {game.stats.totalPoints} total points
            </Text>
          )}
        </View>

        {finished ? (
          <View style={styles.doneBlock}>
            <Text style={[styles.doneTitle, { color: colors.text }]}>
              {game.status === 'won' ? `Solved for ${game.score} points` : `Today's number was ${game.answer}`}
            </Text>
            <Text style={[styles.nextLabel, { color: colors.textMuted }]}>NEXT NUMBER IN</Text>
            <Text style={[styles.countdown, { color: colors.text }]}>{formatCountdown(remaining)}</Text>
            <Pressable
              style={({ pressed }) => [
                styles.secondaryButton,
                { borderColor: colors.border, opacity: pressed ? 0.7 : 1 },
              ]}
              onPress={onPlay}
            >
              <Text style={[styles.secondaryText, { color: colors.text }]}>See today's board</Text>
            </Pressable>
          </View>
        ) : (
          <Pressable
            style={({ pressed }) => [
              styles.playButton,
              { backgroundColor: colors.accent, opacity: pressed ? 0.88 : 1 },
            ]}
            onPress={onPlay}
          >
            <Text style={styles.playText}>{inProgress ? 'CONTINUE' : 'READY TO START?'}</Text>
          </Pressable>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  menuIcon: { fontSize: 19, fontFamily: fonts.bold },
  iconText: { fontSize: 17 },
  body: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
    gap: 6,
  },
  logo: {
    fontSize: 46,
    fontFamily: fonts.logo,
    letterSpacing: -1,
  },
  tagline: {
    fontSize: 14,
    fontFamily: fonts.medium,
    marginBottom: 26,
  },
  streakCard: {
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 20,
    paddingVertical: 20,
    paddingHorizontal: 40,
    marginBottom: 30,
  },
  streakValue: {
    fontSize: 46,
    fontFamily: fonts.logo,
    letterSpacing: -1,
  },
  streakLabel: {
    fontSize: 10,
    fontFamily: fonts.bold,
    letterSpacing: 1.2,
  },
  totalPoints: {
    fontSize: 12,
    fontFamily: fonts.medium,
    marginTop: 8,
  },
  playButton: {
    borderRadius: 16,
    paddingVertical: 18,
    paddingHorizontal: 40,
    alignSelf: 'stretch',
    alignItems: 'center',
  },
  playText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontFamily: fonts.logo,
    letterSpacing: 0.4,
  },
  doneBlock: { alignItems: 'center', alignSelf: 'stretch' },
  doneTitle: {
    fontSize: 16,
    fontFamily: fonts.semiBold,
    marginBottom: 18,
    textAlign: 'center',
  },
  nextLabel: {
    fontSize: 10,
    fontFamily: fonts.bold,
    letterSpacing: 1.2,
  },
  countdown: {
    fontSize: 40,
    fontFamily: fonts.extraBold,
    letterSpacing: 1,
    marginTop: 2,
    color: feedbackColors.correct,
  },
  secondaryButton: {
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 13,
    paddingHorizontal: 24,
    marginTop: 24,
  },
  secondaryText: {
    fontSize: 14,
    fontFamily: fonts.bold,
  },
});

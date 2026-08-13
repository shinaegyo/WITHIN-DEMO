import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusScreen } from '../components/StatusScreen';
import { useDailyGameContext } from '../state/DailyGameContext';
import { feedbackColors } from '../theme/colors';
import { fonts } from '../theme/fonts';
import { useTheme } from '../theme/ThemeContext';
import { formatCountdown, msUntilLocalMidnight } from '../utils/countdown';
import { practiceRemaining } from '../utils/practiceLimit';

interface Props {
  onPlay: () => void;
  onPractice: () => void;
  onOpenMenu: () => void;
  /** Bumped by the navigator so the count refreshes on return from practice. */
  practiceEpoch: number;
}

export function HomeScreen({ onPlay, onPractice, onOpenMenu, practiceEpoch }: Props) {
  const { colors, mode, toggle } = useTheme();
  const { phase, game, loadError, reload } = useDailyGameContext();
  const [remaining, setRemaining] = useState(msUntilLocalMidnight());
  const [practiceLeft, setPracticeLeft] = useState<number | null>(null);

  useEffect(() => {
    practiceRemaining().then(setPracticeLeft);
  }, [practiceEpoch]);

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
  // Separators keep five- and six-figure totals readable rather than a wall of digits.
  const points = game.stats.totalPoints.toLocaleString();

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
        {/* Points sit above the wordmark, where they have the full screen width
            to grow into — a six-figure total still fits on one line. */}
        <Text style={[styles.points, { color: colors.text }]} numberOfLines={1} adjustsFontSizeToFit>
          {points}
        </Text>
        <Text style={[styles.pointsLabel, { color: colors.textMuted }]}>TOTAL POINTS</Text>

        <Text style={[styles.logo, { color: colors.text }]}>WITHIN</Text>
        <Text style={[styles.tagline, { color: colors.textMuted }]}>One number. Seven guesses.</Text>

        <View style={[styles.streakPill, { borderColor: colors.border, backgroundColor: colors.surface }]}>
          <Text style={[styles.streakValue, { color: colors.text }]}>{game.stats.currentStreak}</Text>
          <Text style={[styles.streakLabel, { color: colors.textMuted }]}>DAY STREAK</Text>
        </View>

        {finished ? (
          <View style={styles.doneBlock}>
            <Text style={[styles.doneTitle, { color: colors.text }]}>
              {game.status === 'won' ? `Solved for ${game.score} points` : `Today's number was ${game.answer}`}
            </Text>
            <Text style={[styles.nextLabel, { color: colors.textMuted }]}>NEXT NUMBER IN</Text>
            <Text style={[styles.countdown, { color: colors.text }]}>{formatCountdown(remaining)}</Text>
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

        {/* Practice unlocks after the daily, so it tops up a session rather
            than replacing the thing people came for. */}
        {finished && practiceLeft !== null && (
          <Pressable
            disabled={practiceLeft === 0}
            style={({ pressed }) => [
              styles.practiceButton,
              {
                borderColor: colors.border,
                backgroundColor: pressed && practiceLeft > 0 ? colors.surfaceAlt : 'transparent',
                opacity: practiceLeft === 0 ? 0.45 : 1,
              },
            ]}
            onPress={onPractice}
          >
            <Text style={[styles.practiceText, { color: colors.text }]}>
              {practiceLeft > 0 ? 'Play a practice round' : 'No practice rounds left today'}
            </Text>
            <Text style={[styles.practiceMeta, { color: colors.textMuted }]}>
              {practiceLeft > 0 ? `${practiceLeft} of 5 left today · unranked` : 'Resets at midnight'}
            </Text>
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
  },
  points: {
    fontSize: 40,
    fontFamily: fonts.extraBold,
    letterSpacing: -0.5,
    alignSelf: 'stretch',
    textAlign: 'center',
  },
  pointsLabel: {
    fontSize: 10,
    fontFamily: fonts.bold,
    letterSpacing: 1.4,
    marginBottom: 22,
  },
  logo: {
    fontSize: 64,
    fontFamily: fonts.logo,
    letterSpacing: -2,
  },
  tagline: {
    fontSize: 14,
    fontFamily: fonts.medium,
    marginTop: 2,
  },
  streakPill: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
    borderWidth: 1,
    borderRadius: 99,
    paddingVertical: 9,
    paddingHorizontal: 18,
    marginTop: 22,
    marginBottom: 34,
  },
  streakValue: { fontSize: 20, fontFamily: fonts.extraBold },
  streakLabel: { fontSize: 10, fontFamily: fonts.bold, letterSpacing: 1.2 },
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
    marginBottom: 16,
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
  practiceButton: {
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 22,
    marginTop: 24,
    alignItems: 'center',
    alignSelf: 'stretch',
  },
  practiceText: { fontSize: 14, fontFamily: fonts.bold },
  practiceMeta: { fontSize: 11, fontFamily: fonts.medium, marginTop: 2 },
});

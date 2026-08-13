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

const POINTS_MAX_SIZE = 128;
const POINTS_MIN_SIZE = 34;

/**
 * Approximate width of the string in em units for Archivo ExtraBold, then
 * divide the available width by it. Digits are near-monospaced in this face;
 * separators are much narrower.
 */
function pointsFontSize(text: string, available: number): number {
  if (!available) return POINTS_MIN_SIZE;
  let units = 0;
  for (const ch of text) units += ch >= '0' && ch <= '9' ? 0.64 : 0.32;
  // 4% margin: the per-character estimate is close but not exact, and glyph
  // measurement showed longer totals overshooting the container without it.
  const size = (available * 0.96) / Math.max(units, 0.64);
  return Math.max(POINTS_MIN_SIZE, Math.min(POINTS_MAX_SIZE, size));
}

export function HomeScreen({ onPlay, onPractice, onOpenMenu, practiceEpoch }: Props) {
  const { colors, mode, toggle } = useTheme();
  const { phase, game, loadError, reload } = useDailyGameContext();
  const [remaining, setRemaining] = useState(msUntilLocalMidnight());
  const [practiceLeft, setPracticeLeft] = useState<number | null>(null);
  const [pointsWidth, setPointsWidth] = useState(0);

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
        {/* Sized to fill the available width rather than sitting at a fixed
            size. adjustsFontSizeToFit only ever shrinks text, so a short total
            like "95" would stay small; this scales up to fill and back down as
            digits are added. */}
        <View style={styles.pointsRow} onLayout={(e) => setPointsWidth(e.nativeEvent.layout.width)}>
          <Text
            style={[styles.points, { color: colors.text, fontSize: pointsFontSize(points, pointsWidth) }]}
            numberOfLines={1}
            adjustsFontSizeToFit
          >
            {points}
          </Text>
        </View>
        <Text style={[styles.pointsLabel, { color: colors.textMuted }]}>TOTAL POINTS</Text>

        <Text style={[styles.logo, { color: colors.text }]}>WITHIN</Text>
        <Text style={[styles.tagline, { color: colors.textMuted }]}>One number. Seven guesses.</Text>

        <View style={[styles.streakPill, { borderColor: colors.border, backgroundColor: colors.surface }]}>
          <Text style={[styles.streakValue, { color: colors.text }]}>{game.stats.currentStreak}</Text>
          <Text style={[styles.streakLabel, { color: colors.textMuted }]}>DAY STREAK</Text>
        </View>

        {finished ? (
          <Text style={[styles.doneTitle, { color: colors.text }]}>
            {game.status === 'won' ? `Solved for ${game.score} points` : `Today's number was ${game.answer}`}
          </Text>
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

      {finished && (
        <View style={styles.footer}>
          <Text style={[styles.nextLabel, { color: colors.textMuted }]}>NEXT NUMBER IN</Text>
          <Text style={[styles.countdown, { color: colors.text }]}>{formatCountdown(remaining)}</Text>
        </View>
      )}
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
  pointsRow: { alignSelf: 'stretch' },
  points: {
    fontFamily: fonts.extraBold,
    letterSpacing: -2,
    textAlign: 'center',
    includeFontPadding: false,
  },
  pointsLabel: {
    fontSize: 11,
    fontFamily: fonts.bold,
    letterSpacing: 1.6,
    marginTop: 2,
    marginBottom: 24,
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
  doneTitle: {
    fontSize: 16,
    fontFamily: fonts.semiBold,
    textAlign: 'center',
  },
  footer: {
    alignItems: 'center',
    paddingBottom: 18,
    paddingHorizontal: 28,
  },
  nextLabel: {
    fontSize: 10,
    fontFamily: fonts.bold,
    letterSpacing: 1.2,
  },
  countdown: {
    fontSize: 34,
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

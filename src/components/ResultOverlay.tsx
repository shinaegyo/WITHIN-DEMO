import React, { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { PlayerStats, ServerStatus } from '../lib/api';
import { feedbackColors } from '../theme/colors';
import { fonts } from '../theme/fonts';
import { noHit } from '../theme/styles';
import { useTheme } from '../theme/ThemeContext';
import { formatCountdown, msUntilLocalMidnight } from '../utils/countdown';
import { Confetti } from './Confetti';
import { Rings } from './effects/Rings';

interface Props {
  status: ServerStatus;
  answer: number | null;
  attemptsUsed: number;
  score: number;
  stats: PlayerStats;
  /** True when the game was already over on load, so we skip the celebration. */
  resumed: boolean;
}

export function ResultOverlay({ status, answer, attemptsUsed, score, stats, resumed }: Props) {
  const { colors } = useTheme();
  const scale = useRef(new Animated.Value(resumed ? 1 : 0.7)).current;
  const opacity = useRef(new Animated.Value(resumed ? 1 : 0)).current;
  const [remaining, setRemaining] = useState(msUntilLocalMidnight());

  useEffect(() => {
    if (status === 'playing' || resumed) return;
    scale.setValue(0.7);
    opacity.setValue(0);
    Animated.parallel([
      Animated.spring(scale, { toValue: 1, useNativeDriver: true, friction: 6, tension: 80 }),
      Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
    ]).start();
  }, [status, resumed, scale, opacity]);

  useEffect(() => {
    if (status === 'playing') return;
    const id = setInterval(() => setRemaining(msUntilLocalMidnight()), 1000);
    return () => clearInterval(id);
  }, [status]);

  if (status === 'playing') return null;

  const isWin = status === 'won';

  return (
    <View style={[StyleSheet.absoluteFill, styles.backdrop]}>
      {isWin && !resumed && (
        <>
          <Confetti />
          <View style={[StyleSheet.absoluteFill, styles.rings, noHit]}>
            <Rings color={feedbackColors.correct} count={3} size={180} maxScale={3.4} duration={1100} />
          </View>
        </>
      )}

      <Animated.View style={[styles.card, { backgroundColor: colors.surface, opacity, transform: [{ scale }] }]}>
        <Text style={styles.emoji}>{isWin ? '🎉' : '💔'}</Text>

        <Text
          style={[styles.title, { color: colors.text }]}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.7}
        >
          {isWin ? 'CORRECT!' : 'OUT OF ATTEMPTS'}
        </Text>

        <Text
          style={[styles.points, { color: isWin ? feedbackColors.correct : colors.textMuted }]}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.7}
        >
          {score} POINTS
        </Text>

        <Text style={[styles.subtitle, { color: colors.textMuted }]}>
          {isWin
            ? `Solved in ${attemptsUsed} ${attemptsUsed === 1 ? 'attempt' : 'attempts'}`
            : `The number was ${answer}.`}
        </Text>

        <View style={[styles.statsRow, { borderColor: colors.border }]}>
          <Stat label="STREAK" value={stats.currentStreak} />
          <Stat label="BEST" value={stats.maxStreak} />
          <Stat label="PLAYED" value={stats.gamesPlayed} />
          <Stat label="POINTS" value={stats.totalPoints} />
        </View>

        <Text style={[styles.nextLabel, { color: colors.textMuted }]}>NEXT NUMBER IN</Text>
        <Text style={[styles.countdown, { color: colors.text }]}>{formatCountdown(remaining)}</Text>
      </Animated.View>
    </View>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  const { colors } = useTheme();
  return (
    <View style={styles.stat}>
      <Text style={[styles.statValue, { color: colors.text }]}>{value}</Text>
      <Text style={[styles.statLabel, { color: colors.textMuted }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 30,
  },
  rings: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    width: '88%',
    borderRadius: 24,
    paddingVertical: 28,
    paddingHorizontal: 22,
    alignItems: 'center',
  },
  emoji: {
    fontSize: 44,
    marginBottom: 6,
  },
  title: {
    fontSize: 25,
    fontFamily: fonts.logo,
    letterSpacing: -0.4,
    marginBottom: 6,
    textAlign: 'center',
  },
  points: {
    fontSize: 40,
    fontFamily: fonts.logo,
    letterSpacing: -0.5,
    marginTop: 2,
  },
  subtitle: {
    fontSize: 15,
    fontFamily: fonts.medium,
    textAlign: 'center',
    marginTop: 4,
  },
  statsRow: {
    flexDirection: 'row',
    borderTopWidth: 1,
    marginTop: 20,
    paddingTop: 16,
    alignSelf: 'stretch',
  },
  stat: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 22,
    fontFamily: fonts.extraBold,
  },
  statLabel: {
    fontSize: 9,
    fontFamily: fonts.bold,
    letterSpacing: 0.7,
    marginTop: 2,
  },
  nextLabel: {
    fontSize: 10,
    fontFamily: fonts.bold,
    letterSpacing: 1,
    marginTop: 18,
  },
  countdown: {
    fontSize: 26,
    fontFamily: fonts.extraBold,
    letterSpacing: 1,
    marginTop: 2,
  },
});

import React, { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { DailyGame, SubmitResult } from '../lib/api';
import { MAX_DAILY_SCORE } from '../game/scoring';
import { feedbackColors } from '../theme/colors';
import { fonts } from '../theme/fonts';
import { noHit } from '../theme/styles';
import { useTheme } from '../theme/ThemeContext';
import { formatCountdown, msUntilLocalMidnight } from '../utils/countdown';
import { Confetti } from './Confetti';
import { Rings } from './effects/Rings';

interface Props {
  game: DailyGame;
  submit: SubmitResult | null;
  onNextRound: () => void;
  onRetry: () => void;
  onConcede: () => void;
  onExit: () => void;
}

/**
 * Shown between rounds and at the end of the day. Three shapes:
 * round won with more to play, day complete, and eliminated.
 */
export function RoundOverlay({ game, submit, onNextRound, onRetry, onConcede, onExit }: Props) {
  const { colors } = useTheme();
  const scale = useRef(new Animated.Value(0.7)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const [remaining, setRemaining] = useState(msUntilLocalMidnight());

  const dayOver = game.dayStatus !== 'playing';
  const eliminated = game.dayStatus === 'eliminated';
  const roundWon = game.round.status === 'won';
  const moreRounds = roundWon && !dayOver;

  useEffect(() => {
    scale.setValue(0.7);
    opacity.setValue(0);
    Animated.parallel([
      Animated.spring(scale, { toValue: 1, useNativeDriver: true, friction: 6, tension: 80 }),
      Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
    ]).start();
  }, [scale, opacity]);

  useEffect(() => {
    if (!dayOver) return;
    const id = setInterval(() => setRemaining(msUntilLocalMidnight()), 1000);
    return () => clearInterval(id);
  }, [dayOver]);

  // Solving on the final attempt costs an attempt next round; say so plainly
  // rather than letting the player discover a shorter board later.
  const attemptsCut =
    !!submit && submit.nextAttemptsAllowed !== null && submit.nextAttemptsAllowed < submit.attemptsAllowed;

  // Retry is still open, so the number must stay hidden — showing it here is
  // what let players read the answer and retype it for full marks.
  const canRetry = game.canRetry;
  const title = eliminated ? 'OUT OF ATTEMPTS' : roundWon ? 'CORRECT!' : 'ROUND OVER';

  return (
    <View style={[StyleSheet.absoluteFill, styles.backdrop]}>
      {roundWon && (
        <>
          <Confetti />
          <View style={[StyleSheet.absoluteFill, styles.rings, noHit]}>
            <Rings color={feedbackColors.correct} count={3} size={180} maxScale={3.4} duration={1100} />
          </View>
        </>
      )}

      <Animated.View style={[styles.card, { backgroundColor: colors.surface, opacity, transform: [{ scale }] }]}>
        <Text style={[styles.title, { color: colors.text }]} numberOfLines={1} adjustsFontSizeToFit>
          {title}
        </Text>

        {roundWon ? (
          <>
            <Text style={[styles.points, { color: feedbackColors.correct }]} numberOfLines={1} adjustsFontSizeToFit>
              +{game.round.score}
            </Text>
            <Text style={[styles.sub, { color: colors.textMuted }]}>
              Round {game.round.round} solved in {game.round.attemptsUsed}{' '}
              {game.round.attemptsUsed === 1 ? 'attempt' : 'attempts'}
              {game.round.retried ? ' · retried, so no points' : ''}
            </Text>
          </>
        ) : game.round.answer !== null ? (
          <Text style={[styles.sub, { color: colors.textMuted }]}>
            The number was {game.round.answer}.
          </Text>
        ) : (
          <Text style={[styles.sub, { color: colors.textMuted }]}>
            Round {game.round.round} got away from you.
          </Text>
        )}

        <View style={[styles.totalRow, { borderColor: colors.border }]}>
          <Text style={[styles.totalLabel, { color: colors.textMuted }]}>TODAY'S SCORE</Text>
          <Text style={[styles.totalValue, { color: colors.text }]}>
            {game.totalScore}
            <Text style={[styles.totalMax, { color: colors.textMuted }]}> / {MAX_DAILY_SCORE}</Text>
          </Text>
        </View>

        {attemptsCut && (
          <Text style={[styles.warn, { color: feedbackColors.within10 }]}>
            You solved that on your last attempt — the next round has{' '}
            {submit?.nextAttemptsAllowed} attempts.
          </Text>
        )}

        {moreRounds && (
          <Pressable
            style={({ pressed }) => [styles.primary, { backgroundColor: colors.accent, opacity: pressed ? 0.88 : 1 }]}
            onPress={onNextRound}
          >
            <Text style={styles.primaryText}>Start round {game.currentRound}</Text>
          </Pressable>
        )}

        {eliminated && canRetry && (
          <>
            <Text style={[styles.sub, { color: colors.textMuted, marginTop: 12 }]}>
              You keep your {game.totalScore} points. Watch an ad for another go at round{' '}
              {game.currentRound}: the round won't score and today won't count toward your streak,
              but you can finish the day and still place on the leaderboard.
            </Text>
            <Pressable
              style={({ pressed }) => [styles.primary, { backgroundColor: colors.accent, opacity: pressed ? 0.88 : 1 }]}
              onPress={onRetry}
            >
              {/* Stubbed: grants the retry immediately. Swapping in a real
                  rewarded ad only changes what happens before onRetry runs. */}
              <Text style={styles.primaryText}>Watch ad to retry (0 points)</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.secondary, { borderColor: colors.border, opacity: pressed ? 0.7 : 1 }]}
              onPress={onConcede}
            >
              <Text style={[styles.secondaryText, { color: colors.text }]}>End my day and show the number</Text>
            </Pressable>
          </>
        )}

        {dayOver && game.retriesUsed > 0 && (
          <Text style={[styles.warn, { color: feedbackColors.within10 }]}>
            You used a retry, so today doesn't extend your streak.
          </Text>
        )}

        {dayOver && (
          <>
            <Text style={[styles.nextLabel, { color: colors.textMuted }]}>NEXT NUMBERS IN</Text>
            <Text style={[styles.countdown, { color: colors.text }]}>{formatCountdown(remaining)}</Text>
          </>
        )}

        <Pressable
          style={({ pressed }) => [styles.secondary, { borderColor: colors.border, opacity: pressed ? 0.7 : 1 }]}
          onPress={onExit}
        >
          <Text style={[styles.secondaryText, { color: colors.text }]}>Back to home</Text>
        </Pressable>
      </Animated.View>
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
  rings: { alignItems: 'center', justifyContent: 'center' },
  card: {
    width: '88%',
    borderRadius: 24,
    paddingVertical: 26,
    paddingHorizontal: 22,
    alignItems: 'center',
  },
  title: { fontSize: 25, fontFamily: fonts.logo, letterSpacing: -0.4, textAlign: 'center' },
  points: { fontSize: 44, fontFamily: fonts.logo, letterSpacing: -1, marginTop: 2 },
  sub: { fontSize: 14, fontFamily: fonts.medium, textAlign: 'center', marginTop: 4 },
  totalRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    alignSelf: 'stretch',
    borderTopWidth: 1,
    marginTop: 18,
    paddingTop: 14,
  },
  totalLabel: { fontSize: 10, fontFamily: fonts.bold, letterSpacing: 1 },
  totalValue: { fontSize: 22, fontFamily: fonts.extraBold },
  totalMax: { fontSize: 13, fontFamily: fonts.bold },
  warn: { fontSize: 12, fontFamily: fonts.semiBold, textAlign: 'center', marginTop: 12 },
  primary: {
    borderRadius: 14,
    paddingVertical: 14,
    alignSelf: 'stretch',
    alignItems: 'center',
    marginTop: 18,
  },
  primaryText: { color: '#FFFFFF', fontSize: 16, fontFamily: fonts.bold },
  secondary: {
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 22,
    marginTop: 10,
  },
  secondaryText: { fontSize: 14, fontFamily: fonts.bold },
  nextLabel: { fontSize: 10, fontFamily: fonts.bold, letterSpacing: 1, marginTop: 18 },
  countdown: { fontSize: 26, fontFamily: fonts.extraBold, letterSpacing: 1, marginTop: 2 },
});

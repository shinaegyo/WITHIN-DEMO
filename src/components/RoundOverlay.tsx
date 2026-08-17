import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Pressable, StyleSheet, View } from 'react-native';
import { Text } from './AppText';
import { DailyGame, RoundSummary, SubmitResult } from '../lib/api';
import { feedbackColors } from '../theme/colors';
import { fonts } from '../theme/fonts';
import { noHit } from '../theme/styles';
import { useTheme } from '../theme/ThemeContext';
import { formatCountdown, msUntilLocalMidnight } from '../utils/countdown';
import { shareResult } from '../utils/share';
import { Confetti } from './Confetti';
import { Rings } from './effects/Rings';

interface Props {
  game: DailyGame;
  submit: SubmitResult | null;
  onNextRound: () => void;
  onRetry: () => void;
  onConcede: () => void;
  onExit: () => void;
  advancing?: boolean;
}

/**
 * One line per round at the end of the day.
 *
 * Three rounds that each asked something different need three sentences that
 * each answer the thing that was asked - a call is kept or it isn't, a range is
 * around the number or it isn't - and none of them is "solved in 4 attempts".
 */
function recapFor(r: RoundSummary): string {
  if (r.round === 3) return r.status === 'won' ? 'inside your range' : 'outside your range';
  if (r.status !== 'won') return 'never found it';
  if (r.called != null) return `called ${r.called}, found in ${r.attemptsUsed}`;
  return `found in ${r.attemptsUsed}`;
}

/**
 * Shown between rounds and at the end of the day. Three shapes:
 * round won with more to play, day complete, and eliminated.
 */
export function RoundOverlay({
  game,
  submit,
  onNextRound,
  onRetry,
  onConcede,
  onExit,
  advancing = false,
}: Props) {
  const { colors } = useTheme();
  const scale = useRef(new Animated.Value(0.7)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const [remaining, setRemaining] = useState(msUntilLocalMidnight());
  const [shareNote, setShareNote] = useState<string | null>(null);
  const [shareFailed, setShareFailed] = useState(false);

  const dayOver = game.dayStatus !== 'playing';
  const eliminated = game.dayStatus === 'eliminated';
  const roundWon = game.round.status === 'won';
  // A lost round no longer ends the day, so the way on is offered whether the
  // round was solved or not.
  const moreRounds = !dayOver;

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

  // Rounds get shorter anyway now — 7, then 6, then 5 — so a drop in the
  // allowance no longer means the penalty was applied. Comparing the two
  // numbers claimed a last-attempt solve on every transition, including rounds
  // the player had just lost. Only an actual solve on the final attempt counts.
  const solvedOnLast =
    !!submit && submit.roundStatus === 'won' && submit.attemptsUsed === submit.attemptsAllowed;
  const nextAllowed = submit?.nextAttemptsAllowed ?? null;

  // Retry is still open, so the number must stay hidden — showing it here is
  // what let players read the answer and retype it for full marks.
  const canRetry = game.canRetry;

  /**
   * Three rounds, three ways to end. Round one was called out loud, so the card
   * has to say whether the call held. Round three ends on a range rather than a
   * guess, and "correct" is the wrong word for a range - it was either around
   * the number or it wasn't.
   */
  const { kind, called, answer, betLo, betHi, attemptsUsed, score } = game.round;
  const isBet = kind === 'bet';
  const inside =
    isBet &&
    answer !== null &&
    betLo !== null &&
    betHi !== null &&
    answer >= betLo &&
    answer <= betHi;
  const late = kind === 'cold' && roundWon && called !== null && attemptsUsed > called;

  const title = isBet
    ? inside
      ? 'INSIDE'
      : 'OUTSIDE'
    : late
      ? 'FOUND IT LATE'
      : roundWon
        ? called !== null
          ? 'CALLED IT'
          : 'CORRECT!'
        : 'OUT OF ATTEMPTS';

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

        {isBet ? (
          <>
            <Text
              style={[styles.points, { color: inside ? feedbackColors.correct : colors.text }]}
              numberOfLines={1}
              adjustsFontSizeToFit
            >
              +{score}
            </Text>
            <Text style={[styles.sub, { color: colors.textMuted }]}>
              The number was {answer}.{' '}
              {betLo === betHi ? `You named ${betLo}.` : `You said ${betLo} to ${betHi}.`}
            </Text>
          </>
        ) : roundWon ? (
          <>
            <Text style={[styles.points, { color: feedbackColors.correct }]} numberOfLines={1} adjustsFontSizeToFit>
              +{score}
            </Text>
            <Text style={[styles.sub, { color: colors.textMuted }]}>
              {called !== null
                ? late
                  ? `You called ${called}, and found it in ${attemptsUsed}.`
                  : `Called ${called}, found it in ${attemptsUsed}.`
                : `Round ${game.round.round} solved in ${attemptsUsed} ${
                    attemptsUsed === 1 ? 'attempt' : 'attempts'
                  }`}
              {game.round.retried ? ' · retried, so no points' : ''}
            </Text>
          </>
        ) : answer !== null ? (
          <>
            {/* Every finished round pays something now, so the card says what
                it paid even when the round was lost. */}
            {score > 0 && (
              <Text style={[styles.points, { color: colors.text }]} numberOfLines={1} adjustsFontSizeToFit>
                +{score}
              </Text>
            )}
            <Text style={[styles.sub, { color: colors.textMuted }]}>The number was {answer}.</Text>
          </>
        ) : (
          <Text style={[styles.sub, { color: colors.textMuted }]}>
            Round {game.round.round} got away from you.
          </Text>
        )}

        {dayOver && kind !== null && (
          <View style={styles.recap}>
            {game.rounds.map((r) => (
              <View key={r.round} style={styles.recapRow}>
                <Text style={[styles.recapNum, { color: colors.textMuted }]}>{r.round}</Text>
                <Text style={[styles.recapWhat, { color: colors.text }]} numberOfLines={1}>
                  {recapFor(r)}
                </Text>
                <Text style={[styles.recapPts, { color: colors.text }]}>{r.score}</Text>
              </View>
            ))}
          </View>
        )}

        <View style={[styles.totalRow, { borderColor: colors.border }]}>
          <Text style={[styles.totalLabel, { color: colors.textMuted }]}>TODAY'S SCORE</Text>
          {/* No denominator. 140 is a good day; 140 / 300 reads as a shortfall
              against a maximum almost nobody reaches, and the same change was
              made on the home screen for the same reason. */}
          <Text style={[styles.totalValue, { color: colors.text }]}>
            {game.totalScore}
            <Text style={[styles.totalMax, { color: colors.textMuted }]}> points</Text>
          </Text>
        </View>

        {/* Two statements, not one sentence: the penalty is a consequence of
            what just happened, the allowance is a fact about what comes next.
            Kept out of the warning colour — the board already spends amber on
            proximity, and a rule being explained is not an alarm. */}
        {/* Each round is now a different question, so what is worth saying
            between them is which question is coming - not a count of attempts
            that no longer changes. */}
        {moreRounds && kind !== null && (
          <View style={styles.nextInfo}>
            <Text style={[styles.warnSub, { color: colors.textMuted }]}>
              {game.currentRound === 2
                ? 'Next round comes with a clue, and you choose what kind.'
                : 'Last round: three free guesses, then you name a range.'}
            </Text>
          </View>
        )}

        {moreRounds && kind === null && nextAllowed !== null && (
          <View style={styles.nextInfo}>
            {solvedOnLast && (
              <Text style={[styles.warn, { color: colors.text }]}>
                You solved that on your last attempt.
              </Text>
            )}
            <Text style={[styles.warnSub, { color: colors.textMuted }]}>
              Next round has {nextAllowed} attempts.
            </Text>
          </View>
        )}

        {moreRounds && (
          <Pressable
            disabled={advancing}
            style={({ pressed }) => [
              styles.primary,
              { backgroundColor: colors.accent, opacity: advancing ? 0.7 : pressed ? 0.88 : 1 },
            ]}
            onPress={onNextRound}
          >
            {advancing ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.primaryText}>Start round {game.currentRound}</Text>
            )}
          </Pressable>
        )}

        {eliminated && canRetry && (
          <>
            <Text style={[styles.sub, { color: colors.textMuted, marginTop: 12 }]}>
              You keep your {game.totalScore} points. Take another go at round{' '}
              {game.currentRound}: the round won't score and today won't count toward your streak,
              but you can finish the day and still place on the leaderboard.
            </Text>
            <Pressable
              style={({ pressed }) => [styles.primary, { backgroundColor: colors.accent, opacity: pressed ? 0.88 : 1 }]}
              onPress={onRetry}
            >
              {/* No ad is served yet, so the copy doesn't promise one — a
                  button that offers an ad and then silently skips it reads as
                  broken. Wiring up a real rewarded ad changes what happens
                  before onRetry runs, and this label goes back to naming it. */}
              <Text style={styles.primaryText}>Retry this round (0 points)</Text>
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
          <Text style={[styles.warnSub, { color: colors.textMuted, marginTop: 12 }]}>
            You used a retry, so today doesn't extend your streak.
          </Text>
        )}

        {dayOver && (
          <Pressable
            style={({ pressed }) => [
              styles.primary,
              { backgroundColor: feedbackColors.correct, opacity: pressed ? 0.88 : 1 },
            ]}
            onPress={async () => {
              const res = await shareResult(game);
              setShareFailed(!res.ok);
              if (res.copied) setShareNote('Copied — paste it anywhere.');
              else if (!res.ok) setShareNote('Could not share — try again.');
            }}
          >
            <Text style={styles.primaryText}>Share result</Text>
          </Pressable>
        )}

        {shareNote && (
          <Text
            style={[styles.sub, { color: shareFailed ? colors.textMuted : feedbackColors.correct }]}
          >
            {shareNote}
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
  recap: { width: '100%', marginTop: 16, gap: 6 },
  recapRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  recapNum: { fontSize: 12, fontFamily: fonts.extraBold, width: 12 },
  recapWhat: { flex: 1, fontSize: 13, fontFamily: fonts.semiBold },
  recapPts: { fontSize: 14, fontFamily: fonts.extraBold, fontVariant: ['tabular-nums'] },
  nextInfo: { alignItems: 'center', gap: 2, marginTop: 14 },
  warnSub: {
    fontSize: 12.5,
    fontFamily: fonts.medium,
    textAlign: 'center',
  },
  warn: { fontSize: 13, fontFamily: fonts.bold, textAlign: 'center' },
  primary: {
    borderRadius: 14,
    paddingVertical: 14,
    alignSelf: 'stretch',
    alignItems: 'center',
    // Pinned so swapping the label for a spinner doesn't resize the card.
    justifyContent: 'center',
    minHeight: 48,
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

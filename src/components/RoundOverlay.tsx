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
import { radius, border } from '../theme/tokens';

interface Props {
  game: DailyGame;
  submit: SubmitResult | null;
  onNextRound: () => void;
  onRetry: () => void;
  onConcede: () => void;
  onExit: () => void;
  advancing?: boolean;
  /** The day's clock and total guesses, for the line under the tally. */
  dayClock?: string | null;
  dayGuesses?: number;
}

/**
 * One word per round at the end of the day.
 *
 * The three rounds end in three different ways and each has its own phrase for
 * it - found in four, read it cold, the bet landed - which is right on the card
 * for that round and wrong in a list of three. Stacked, the different
 * vocabularies read as three unrelated games. The tally answers one question
 * for all of them.
 */
function recapFor(r: RoundSummary): string {
  return r.status === 'won' ? 'Correct' : 'Incorrect';
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
  dayClock,
  dayGuesses = 0,
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


  // A first guess in round one is luck; in round two it is deduction from a
  // clue, and the two deserve different words.
  const firstGo = roundWon && attemptsUsed === 1 && !isBet;
  const flash = firstGo ? (kind === 'cold' ? 'OUT OF NOWHERE' : 'READ IT COLD') : null;

  // How close you actually got, which is the thing a player wants to know.
  const closest = game.round.guesses.reduce<number | null>(
    (best, g) =>
      best === null || (answer !== null && Math.abs(g.guess - answer) < Math.abs(best - answer))
        ? g.guess
        : best,
    null,
  );
  const closeLine =
    answer === null || closest === null
      ? null
      : closest === answer
        ? `You had it in ${attemptsUsed} ${attemptsUsed === 1 ? 'guess' : 'guesses'}.`
        : `Your closest was ${closest} — ${Math.abs(closest - answer)} away in ${attemptsUsed} ${
            attemptsUsed === 1 ? 'guess' : 'guesses'
          }.`;

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
        {!!flash && (
          <Text style={[styles.flash, { color: feedbackColors.correct }]}>{flash} · FIRST GUESS</Text>
        )}

        {kind === null ? (
          <Text style={[styles.title, { color: colors.text }]} numberOfLines={1} adjustsFontSizeToFit>
            {roundWon ? 'CORRECT!' : 'OUT OF ATTEMPTS'}
          </Text>
        ) : (
          // The round number, and nothing else. What happened is the two
          // lines under it - it was 367, you had it in four - and saying it
          // twice is what pushed the label off the card.
          <Text style={[styles.label, { color: colors.textMuted }]} numberOfLines={1}>
            ROUND {game.round.round}
          </Text>
        )}

        <Text
          style={[
            styles.points,
            { color: score > 0 && (roundWon || inside) ? feedbackColors.correct : colors.text },
          ]}
          numberOfLines={1}
          adjustsFontSizeToFit
        >
          +{score}
        </Text>

        {answer !== null && (
          <Text style={[styles.sub, { color: colors.textMuted }]}>It was {answer}.</Text>
        )}
        {!!closeLine && (
          <Text style={[styles.sub, { color: colors.textMuted, marginTop: 6 }]}>{closeLine}</Text>
        )}
        {game.round.retried && (
          <Text style={[styles.sub, { color: colors.textMuted, marginTop: 6 }]}>
            Retried, so it scores nothing.
          </Text>
        )}

        {dayOver && kind !== null && (
          <>
            <View style={styles.recap}>
              {game.rounds.map((r) => (
                  <View key={r.round} style={styles.recapRow}>
                    <Text style={[styles.recapNum, { color: colors.textMuted }]}>
                      ROUND {r.round}
                    </Text>
                    <Text style={[styles.recapAnswer, { color: colors.text }]}>
                      {r.answer != null ? `Answer ${r.answer}` : ''}
                    </Text>
                    <Text
                      style={[
                        styles.recapWhat,
                        {
                          color:
                            r.status === 'won'
                              ? feedbackColors.correct
                              : feedbackColors.oneAway,
                        },
                      ]}
                      numberOfLines={1}
                    >
                      {recapFor(r)}
                    </Text>
                    <Text style={[styles.recapPts, { color: colors.text }]}>{r.score}</Text>
                  </View>
              ))}
            </View>

            {!!dayClock && (
              <Text style={[styles.dayLine, { color: colors.textMuted }]}>
                {dayClock} · {dayGuesses} {dayGuesses === 1 ? 'guess' : 'guesses'}
              </Text>
            )}
          </>
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
              <Text style={styles.primaryText}>Next round</Text>
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
    borderRadius: radius.modal,
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
  flash: { fontSize: 11, fontFamily: fonts.extraBold, letterSpacing: 1.2, marginBottom: 6 },
  label: { fontSize: 12, fontFamily: fonts.extraBold, letterSpacing: 1.1, textAlign: 'center' },
  recap: { width: '100%', marginTop: 16, gap: 6 },
  recapRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  recapNum: { fontSize: 10, fontFamily: fonts.extraBold, letterSpacing: 0.8, width: 58 },
  recapAnswer: { fontSize: 13, fontFamily: fonts.extraBold, width: 82 },
  recapWhat: { flex: 1, fontSize: 12, fontFamily: fonts.semiBold },
  recapPts: { fontSize: 14, fontFamily: fonts.extraBold, fontVariant: ['tabular-nums'] },
  dayLine: { fontSize: 12.5, fontFamily: fonts.bold, textAlign: 'center', marginTop: 12 },
  nextInfo: { alignItems: 'center', gap: 2, marginTop: 14 },
  warnSub: {
    fontSize: 12.5,
    fontFamily: fonts.medium,
    textAlign: 'center',
  },
  warn: { fontSize: 13, fontFamily: fonts.bold, textAlign: 'center' },
  primary: {
    borderRadius: radius.card,
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
    borderWidth: border.hairline,
    borderRadius: radius.card,
    paddingVertical: 12,
    paddingHorizontal: 22,
    marginTop: 10,
  },
  secondaryText: { fontSize: 14, fontFamily: fonts.bold },
  nextLabel: { fontSize: 10, fontFamily: fonts.bold, letterSpacing: 1, marginTop: 18 },
  countdown: { fontSize: 26, fontFamily: fonts.extraBold, letterSpacing: 1, marginTop: 2 },
});

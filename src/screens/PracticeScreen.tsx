import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StatusBar, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ClueCard } from '../components/ClueCard';
import { FeedbackOverlay, FeedbackTrigger } from '../components/FeedbackOverlay';
import { GuessBoard } from '../components/GuessBoard';
import { NumberWheels } from '../components/NumberWheels';
import { MAX_ATTEMPTS, MAX_NUMBER, MIN_NUMBER } from '../game/constants';
import { createPracticeRound, PracticeRound } from '../game/practiceClues';
import { evaluateGuess } from '../game/proximity';
import { GuessResult } from '../game/types';
import { feedbackColors } from '../theme/colors';
import { fonts } from '../theme/fonts';
import { useTheme } from '../theme/ThemeContext';
import { hapticCorrect, hapticForTier, hapticInvalid, hapticOneAway, hapticWithin10 } from '../utils/haptics';
import { playCorrect, playForTier, playOneAway, playWithin10 } from '../utils/sound';

/** Matches the daily game so both feel the same. */
const RESULT_DELAY_MS = 3000;

interface Props {
  remainingAfterThis: number;
  onExit: () => void;
  onPlayAnother: () => void;
  /** First run, before the player has seen the real game. */
  introMode?: boolean;
}

/**
 * Practice runs entirely on the device: the number is generated locally and
 * never reaches a server. Nothing here awards points, streak or leaderboard
 * position, which is what keeps the daily worth caring about.
 */
export function PracticeScreen({
  remainingAfterThis,
  onExit,
  onPlayAnother,
  introMode = false,
}: Props) {
  const { colors, mode } = useTheme();
  const round: PracticeRound = useMemo(() => createPracticeRound(), []);

  const [guesses, setGuesses] = useState<GuessResult[]>([]);
  const [status, setStatus] = useState<'playing' | 'won' | 'lost'>('playing');
  const [clue2Unlocked, setClue2Unlocked] = useState(false);
  const [trigger, setTrigger] = useState<FeedbackTrigger>(null);
  const [showResult, setShowResult] = useState(false);

  const [last, setLast] = useState<GuessResult | null>(null);
  useEffect(() => {
    if (!last) return;
    if (last.isCorrect) {
      hapticCorrect();
      playCorrect();
    } else if (last.isOneAway) {
      setTrigger({ type: 'oneAway', key: Date.now() });
      hapticOneAway();
      playOneAway();
    } else if (last.isWithin10) {
      setTrigger({ type: 'within10', key: Date.now() });
      hapticWithin10();
      playWithin10();
    } else {
      hapticForTier(last.tier);
      playForTier(last.tier);
    }
  }, [last]);

  const submit = useCallback(
    async (value: number) => {
      if (status !== 'playing') return { ok: false as const, error: 'This round is over.' };
      if (!Number.isInteger(value) || value < MIN_NUMBER || value > MAX_NUMBER) {
        hapticInvalid();
        return { ok: false as const, error: `Enter a number between ${MIN_NUMBER} and ${MAX_NUMBER}.` };
      }
      if (guesses.some((g) => g.guess === value)) {
        hapticInvalid();
        return { ok: false as const, error: `You already guessed ${value}.` };
      }

      const result = evaluateGuess(value, round.answer);
      const next = [...guesses, result];
      setGuesses(next);
      setLast(result);
      if (result.isWithin10 || result.isCorrect) setClue2Unlocked(true);
      if (result.isCorrect) setStatus('won');
      else if (next.length >= MAX_ATTEMPTS) setStatus('lost');

      return { ok: true as const };
    },
    [guesses, round.answer, status],
  );

  const finished = status !== 'playing';

  // Same hold as the daily game: let the result land on the board first.
  useEffect(() => {
    if (!finished) {
      setShowResult(false);
      return;
    }
    const t = setTimeout(() => setShowResult(true), RESULT_DELAY_MS);
    return () => clearTimeout(t);
  }, [finished]);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]} edges={['top', 'bottom']}>
      <StatusBar barStyle={mode === 'dark' ? 'light-content' : 'dark-content'} />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={12}
      >
        <View style={styles.content}>
          <View style={styles.header}>
            <Pressable onPress={onExit} hitSlop={10}>
              <Text style={[styles.back, { color: colors.text }]}>‹ Home</Text>
            </Pressable>
            <View style={[styles.badge, { borderColor: colors.border }]}>
              <Text style={[styles.badgeText, { color: colors.textMuted }]}>PRACTICE · UNRANKED</Text>
            </View>
          </View>

          <ClueCard clue1={round.clue1} clue2={round.clue2} clue2Unlocked={clue2Unlocked} />

          <NumberWheels disabled={finished} onSubmit={submit} />

          <View style={styles.boardWrap}>
            <GuessBoard
              guesses={guesses}
              attemptsAllowed={MAX_ATTEMPTS}
              showRemaining={status === 'playing'}
            />
          </View>

        </View>
      </KeyboardAvoidingView>

      <FeedbackOverlay trigger={trigger} onDone={() => setTrigger(null)} />

      {showResult && (
        <View style={[StyleSheet.absoluteFill, styles.backdrop]}>
          <View style={[styles.card, { backgroundColor: colors.surface }]}>
            <Text style={[styles.title, { color: colors.text }]} numberOfLines={1} adjustsFontSizeToFit>
              {status === 'won' ? 'CORRECT!' : 'OUT OF ATTEMPTS'}
            </Text>
            <Text style={[styles.sub, { color: colors.textMuted }]}>
              {status === 'won'
                ? `Found in ${guesses.length} ${guesses.length === 1 ? 'guess' : 'guesses'}`
                : `The number was ${round.answer}.`}
            </Text>
            <Text style={[styles.unranked, { color: colors.textMuted }]}>
              Practice doesn't affect your streak or points.
            </Text>

            {introMode ? null : remainingAfterThis > 0 ? (
              <Pressable
                style={({ pressed }) => [
                  styles.primary,
                  { backgroundColor: colors.accent, opacity: pressed ? 0.88 : 1 },
                ]}
                onPress={onPlayAnother}
              >
                <Text style={styles.primaryText}>
                  Another round ({remainingAfterThis} left today)
                </Text>
              </Pressable>
            ) : (
              <Text style={[styles.noneLeft, { color: feedbackColors.within10 }]}>
                That's your last practice round today.
              </Text>
            )}

            <Pressable
              style={({ pressed }) => [
                styles.secondary,
                { borderColor: colors.border, opacity: pressed ? 0.7 : 1 },
              ]}
              onPress={onExit}
            >
              <Text style={[styles.secondaryText, { color: colors.text }]}>
                {introMode ? "Play today's numbers" : 'Back to home'}
              </Text>
            </Pressable>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  flex: { flex: 1 },
  content: { flex: 1, paddingHorizontal: 20, paddingTop: 12, gap: 16 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  back: { fontSize: 16, fontFamily: fonts.bold },
  badge: { borderWidth: 1, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5 },
  badgeText: { fontSize: 9, fontFamily: fonts.bold, letterSpacing: 0.8 },
  boardWrap: { flex: 1 },
  backdrop: {
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 30,
  },
  card: { width: '88%', borderRadius: 24, paddingVertical: 28, paddingHorizontal: 22, alignItems: 'center' },
  title: { fontSize: 25, fontFamily: fonts.logo, letterSpacing: -0.4, textAlign: 'center' },
  sub: { fontSize: 15, fontFamily: fonts.medium, marginTop: 6, textAlign: 'center' },
  unranked: { fontSize: 12, fontFamily: fonts.medium, marginTop: 10, textAlign: 'center' },
  primary: {
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 20,
    alignSelf: 'stretch',
    alignItems: 'center',
    marginTop: 20,
  },
  primaryText: { color: '#FFFFFF', fontSize: 15, fontFamily: fonts.bold },
  noneLeft: { fontSize: 13, fontFamily: fonts.bold, marginTop: 20, textAlign: 'center' },
  secondary: {
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 22,
    marginTop: 12,
  },
  secondaryText: { fontSize: 14, fontFamily: fonts.bold },
});

import React, { useCallback, useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ClueCard } from '../components/ClueCard';
import { FeedbackOverlay, FeedbackTrigger } from '../components/FeedbackOverlay';
import { GuessBoard } from '../components/GuessBoard';
import { NumberInput } from '../components/NumberInput';
import { MAX_NUMBER, MIN_NUMBER } from '../game/constants';
import { createPracticeRound, PracticeRound } from '../game/practiceClues';
import { evaluateGuess } from '../game/proximity';
import { GuessResult } from '../game/types';
import { feedbackColors } from '../theme/colors';
import { fonts } from '../theme/fonts';
import { useTheme } from '../theme/ThemeContext';
import { hapticCorrect, hapticForTier, hapticInvalid } from '../utils/haptics';
import { playCorrect, playForTier } from '../utils/sound';
import { bestEndless, recordEndless } from '../utils/endless';

/**
 * Numbers back to back, with the rope shortening.
 *
 * The daily is deliberately two minutes and then over. Endless is the other
 * thing: it runs until you fail, and the only question is how deep you got. The
 * attempts fall away as you go, so a run ends by arithmetic rather than by
 * anyone deciding it should.
 *
 * Generated on the device and unranked, exactly like practice. Nothing is
 * scored on the server, so there is nothing to gain by working around it.
 */
const START_ATTEMPTS = 7;
const FLOOR_ATTEMPTS = 4;

function attemptsForLevel(level: number): number {
  return Math.max(FLOOR_ATTEMPTS, START_ATTEMPTS - Math.floor((level - 1) / 2));
}

export function EndlessScreen({ onExit }: { onExit: () => void }) {
  const { colors } = useTheme();
  const [level, setLevel] = useState(1);
  const [round, setRound] = useState<PracticeRound>(() => createPracticeRound());
  const [guesses, setGuesses] = useState<GuessResult[]>([]);
  const [over, setOver] = useState(false);
  const [trigger, setTrigger] = useState<FeedbackTrigger | null>(null);
  const [best, setBest] = useState(0);

  useEffect(() => {
    bestEndless().then(setBest);
  }, []);

  const allowed = attemptsForLevel(level);

  const next = useCallback(() => {
    setLevel((n) => n + 1);
    setRound(createPracticeRound());
    setGuesses([]);
  }, []);

  const submit = useCallback(
    async (value: number) => {
      if (over) return { ok: false as const, error: 'This run is over.' };
      if (!Number.isInteger(value) || value < MIN_NUMBER || value > MAX_NUMBER) {
        return { ok: false as const, error: 'Enter a number between 1 and 1000.' };
      }
      if (guesses.some((g) => g.guess === value)) {
        hapticInvalid();
        return { ok: false as const, error: `You already guessed ${value}.` };
      }

      const result = evaluateGuess(value, round.answer);
      const nextGuesses = [...guesses, result];
      setGuesses(nextGuesses);

      if (result.isCorrect) {
        hapticCorrect();
        playCorrect();
        // A beaten level is banked immediately, so quitting mid-run never
        // costs the levels already cleared.
        recordEndless(level).then(setBest);
        setTimeout(next, 900);
      } else {
        if (result.isOneAway) setTrigger({ type: 'oneAway', key: Date.now() });
        else if (result.isWithin10) setTrigger({ type: 'within10', key: Date.now() });
        hapticForTier(result.tier);
        playForTier(result.tier);
        if (nextGuesses.length >= allowed) setOver(true);
      }

      return { ok: true as const };
    },
    [allowed, guesses, level, next, over, round.answer],
  );

  const restart = () => {
    setLevel(1);
    setRound(createPracticeRound());
    setGuesses([]);
    setOver(false);
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]} edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.content}>
          <View style={styles.head}>
            <Pressable onPress={onExit} hitSlop={10}>
              <Text style={[styles.back, { color: colors.text }]}>‹ Home</Text>
            </Pressable>
            <Text style={[styles.badge, { color: colors.textMuted }]}>
              ENDLESS · BEST {best}
            </Text>
          </View>

          <View style={styles.levelRow}>
            <Text style={[styles.level, { color: colors.text }]}>{level}</Text>
            <Text style={[styles.levelLabel, { color: colors.textMuted }]}>
              {level === 1 ? 'FIRST NUMBER' : 'NUMBERS DEEP'}
            </Text>
          </View>

          {over ? (
            <View style={styles.result}>
              <Text style={[styles.overTitle, { color: colors.text }]}>Run over</Text>
              <Text style={[styles.overBody, { color: colors.textMuted }]}>
                The number was {round.answer}. You cleared {level - 1}
                {level - 1 === 1 ? ' number' : ' numbers'}
                {level - 1 >= best && level > 1 ? ' — your best yet.' : '.'}
              </Text>
              <Pressable
                onPress={restart}
                style={({ pressed }) => [
                  styles.again,
                  { backgroundColor: colors.text, opacity: pressed ? 0.85 : 1 },
                ]}
              >
                <Text style={[styles.againText, { color: colors.background }]}>Run again</Text>
              </Pressable>
            </View>
          ) : (
            <>
              <ClueCard
                clue1={round.clue1}
                clue2={round.clue2}
                clue2Unlocked={guesses.some((g) => g.isWithin10)}
              />

              <NumberInput disabled={over} onSubmit={submit} />

              <View style={styles.boardWrap}>
                <GuessBoard guesses={guesses} attemptsAllowed={allowed} />
              </View>
            </>
          )}
        </View>
      </KeyboardAvoidingView>

      <FeedbackOverlay trigger={trigger} onDone={() => setTrigger(null)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  flex: { flex: 1 },
  content: { flex: 1, paddingHorizontal: 20, paddingTop: 6, gap: 10 },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  back: { fontSize: 15, fontFamily: fonts.bold },
  badge: { fontSize: 10, fontFamily: fonts.bold, letterSpacing: 1.2 },
  levelRow: { alignItems: 'center' },
  level: { fontSize: 40, fontFamily: fonts.extraBold, letterSpacing: -1 },
  levelLabel: { fontSize: 9, fontFamily: fonts.bold, letterSpacing: 1.4, marginTop: -2 },
  boardWrap: { flex: 1 },
  result: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 12 },
  overTitle: { fontSize: 28, fontFamily: fonts.extraBold },
  overBody: { fontSize: 13.5, fontFamily: fonts.medium, textAlign: 'center', lineHeight: 20 },
  again: {
    marginTop: 10,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 34,
    alignItems: 'center',
  },
  againText: { fontSize: 15.5, fontFamily: fonts.extraBold },
});

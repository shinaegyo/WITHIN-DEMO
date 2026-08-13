import React, { useCallback, useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, StatusBar, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ClueCard } from '../components/ClueCard';
import { FeedbackOverlay, FeedbackTrigger } from '../components/FeedbackOverlay';
import { GuessBoard } from '../components/GuessBoard';
import { Header } from '../components/Header';
import { NumberInput } from '../components/NumberInput';
import { ResultOverlay } from '../components/ResultOverlay';
import { StatusScreen } from '../components/StatusScreen';
import { useDailyGame } from '../state/useDailyGame';
import { useTheme } from '../theme/ThemeContext';
import { hapticCorrect, hapticInvalid, hapticOneAway, hapticWithin10 } from '../utils/haptics';
import { playCorrect, playOneAway, playWithin10 } from '../utils/sound';

export function GameScreen() {
  const { colors, mode } = useTheme();
  const { phase, game, loadError, submitting, lastResult, submit, reload } = useDailyGame();
  const [feedbackTrigger, setFeedbackTrigger] = useState<FeedbackTrigger>(null);

  // True when today's game was already finished before this session started,
  // so we show the summary without replaying the celebration.
  const resumedFinished = useRef(false);
  useEffect(() => {
    if (phase === 'ready' && game && !lastResult) {
      resumedFinished.current = game.status !== 'playing';
    }
  }, [phase, game, lastResult]);

  useEffect(() => {
    if (!lastResult) return;
    if (lastResult.isCorrect) {
      hapticCorrect();
      playCorrect();
    } else if (lastResult.isOneAway) {
      setFeedbackTrigger({ type: 'oneAway', key: Date.now() });
      hapticOneAway();
      playOneAway();
    } else if (lastResult.isWithin10) {
      setFeedbackTrigger({ type: 'within10', key: Date.now() });
      hapticWithin10();
      playWithin10();
    }
  }, [lastResult]);

  const clearFeedback = useCallback(() => setFeedbackTrigger(null), []);

  const handleSubmit = useCallback(
    async (value: number) => {
      const res = await submit(value);
      if (!res.ok) hapticInvalid();
      return res;
    },
    [submit],
  );

  const body = () => {
    if (phase === 'loading') return <StatusScreen loading />;
    if (phase === 'failed' || !game) return <StatusScreen message={loadError} onRetry={reload} />;

    return (
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={12}
      >
        <View style={styles.content}>
          <Header />
          <ClueCard clue1={game.clue1} clue2={game.clue2} clue2Unlocked={!!game.clue2} />
          <View style={styles.boardWrap}>
            <GuessBoard guesses={game.guesses} maxAttempts={game.maxAttempts} />
          </View>
          <NumberInput disabled={game.status !== 'playing' || submitting} onSubmit={handleSubmit} />
        </View>
      </KeyboardAvoidingView>
    );
  };

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]} edges={['top', 'bottom']}>
      <StatusBar barStyle={mode === 'dark' ? 'light-content' : 'dark-content'} />
      {body()}

      <FeedbackOverlay trigger={feedbackTrigger} onDone={clearFeedback} />

      {game && (
        <ResultOverlay
          status={game.status}
          answer={game.answer}
          attemptsUsed={game.attemptsUsed}
          score={game.score}
          stats={game.stats}
          resumed={resumedFinished.current}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  flex: { flex: 1 },
  content: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 12,
    gap: 16,
  },
  boardWrap: { flex: 1 },
});

import React, { useCallback, useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, StatusBar, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ClueCard } from '../components/ClueCard';
import { DevPanel } from '../components/DevPanel';
import { FeedbackOverlay, FeedbackTrigger } from '../components/FeedbackOverlay';
import { GuessBoard } from '../components/GuessBoard';
import { Header } from '../components/Header';
import { NumberInput } from '../components/NumberInput';
import { ResultOverlay } from '../components/ResultOverlay';
import { getDailyAnswer, setDevAnswerOverride } from '../game/dailyAnswer';
import { useGameState } from '../state/useGameState';
import { useTheme } from '../theme/ThemeContext';
import { hapticCorrect, hapticInvalid, hapticOneAway, hapticWithin10 } from '../utils/haptics';
import { playCorrect, playOneAway, playWithin10 } from '../utils/sound';

export function GameScreen() {
  const { colors, mode } = useTheme();
  const { state, submitGuess, reset } = useGameState(getDailyAnswer());
  const [feedbackTrigger, setFeedbackTrigger] = useState<FeedbackTrigger>(null);

  useEffect(() => {
    const last = state.guesses[state.guesses.length - 1];
    if (!last) return;

    if (last.isCorrect) {
      hapticCorrect();
      playCorrect();
    } else if (last.isOneAway) {
      setFeedbackTrigger({ type: 'oneAway', key: Date.now() });
      hapticOneAway();
      playOneAway();
    } else if (last.isWithin10) {
      setFeedbackTrigger({ type: 'within10', key: Date.now() });
      hapticWithin10();
      playWithin10();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.guesses.length]);

  const clearFeedback = useCallback(() => setFeedbackTrigger(null), []);

  const handleSubmit = (value: number) => {
    const result = submitGuess(value);
    if (!result.ok) hapticInvalid();
    return result;
  };

  const handleReset = () => {
    // Drop any in-flight burst so an interrupted animation can't linger.
    setFeedbackTrigger(null);
    reset(getDailyAnswer());
  };

  const handleSetDevAnswer = (answer: number) => {
    setFeedbackTrigger(null);
    setDevAnswerOverride(answer);
    reset(answer);
  };

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]} edges={['top', 'bottom']}>
      <StatusBar barStyle={mode === 'dark' ? 'light-content' : 'dark-content'} />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={12}
      >
        <View style={styles.content}>
          <Header onReset={handleReset} />

          <ClueCard clue1={state.clue1} clue2={state.clue2} clue2Unlocked={state.clue2Unlocked} />

          <View style={styles.boardWrap}>
            <GuessBoard guesses={state.guesses} maxAttempts={state.maxAttempts} />
          </View>

          <NumberInput disabled={state.status !== 'playing'} onSubmit={handleSubmit} />

          <DevPanel currentAnswer={state.answer} onSetAnswer={handleSetDevAnswer} />
        </View>
      </KeyboardAvoidingView>

      <FeedbackOverlay trigger={feedbackTrigger} onDone={clearFeedback} />

      <ResultOverlay
        status={state.status}
        answer={state.answer}
        attemptsUsed={state.guesses.length}
        maxAttempts={state.maxAttempts}
        onReset={handleReset}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 12,
    gap: 16,
  },
  boardWrap: {
    flex: 1,
  },
});

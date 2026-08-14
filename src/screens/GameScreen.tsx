import React, { useCallback, useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, StatusBar, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ClueCard } from '../components/ClueCard';
import { FeedbackOverlay, FeedbackTrigger } from '../components/FeedbackOverlay';
import { GuessBoard } from '../components/GuessBoard';
import { Header } from '../components/Header';
import { NumberWheels } from '../components/NumberWheels';
import { RoundOverlay } from '../components/RoundOverlay';
import { RoundProgress } from '../components/RoundProgress';
import { StatusScreen } from '../components/StatusScreen';
import { useDailyGameContext } from '../state/DailyGameContext';
import { feedbackColors } from '../theme/colors';
import { fonts } from '../theme/fonts';
import { useTheme } from '../theme/ThemeContext';
import { hapticCorrect, hapticForTier, hapticInvalid, hapticOneAway, hapticWithin10 } from '../utils/haptics';
import { playCorrect, playForTier, playOneAway, playWithin10 } from '../utils/sound';

/** Long enough to see the tile land, short enough not to feel stuck. */
const RESULT_DELAY_MS = 3000;

export function GameScreen({ onExit }: { onExit: () => void }) {
  const { colors, mode } = useTheme();
  const {
    phase, game, loadError, submitting, advancing, lastResult, lastSubmit,
    submit, advance, retry, concede, reload,
  } = useDailyGameContext();

  const [feedbackTrigger, setFeedbackTrigger] = useState<FeedbackTrigger>(null);
  const [showResult, setShowResult] = useState(false);

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
    } else {
      // Everything else used to pass in silence, which is most of a round.
      hapticForTier(lastResult.tier);
      playForTier(lastResult.tier);
    }
  }, [lastResult]);

  // Held back so the tile, sound and haptic land before a card covers them.
  const roundOver = !!game && game.round.status !== 'playing';
  useEffect(() => {
    if (!roundOver) {
      setShowResult(false);
      return;
    }
    if (!lastResult) {
      setShowResult(true);
      return;
    }
    const t = setTimeout(() => setShowResult(true), RESULT_DELAY_MS);
    return () => clearTimeout(t);
  }, [roundOver, lastResult]);

  // Leaving the game with a round already solved keeps the finished round in
  // state while the day has moved on, so coming back showed the old board and
  // its summary again. Entering the screen re-reads the server whenever the two
  // disagree.
  const stale = !!game && game.dayStatus === 'playing' && game.round.round !== game.currentRound;
  useEffect(() => {
    // advance() rather than a plain refetch: it also clears the finished
    // round's result, which would otherwise pop its summary card up again.
    if (stale) advance();
    // Only on entry: mid-round the two agree, so this does not re-run.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

    const { round } = game;
    const canLeave = round.attemptsUsed === 0 && game.currentRound === 1;
    const unscored = game.rounds.some((r) => r.status === 'lost');

    return (
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={12}
      >
        <View style={styles.content}>
          <Header onBack={canLeave ? onExit : undefined} />

          <RoundProgress
            activeRound={round.round}
            totalRounds={game.totalRounds}
            rounds={game.rounds}
            totalScore={game.totalScore}
          />

          <ClueCard clue1={round.clue1} clue2={round.clue2} clue2Unlocked={!!round.clue2} />

          {/* States the consequence, not the cause. Naming the miss made a bad
              day feel narrated; the player knows what happened. This only needs
              to stop a +0 from reading as a bug. */}
          {unscored && (
            <Text style={[styles.unscored, { color: colors.textMuted }]}>
              No more points can be added today.
            </Text>
          )}

          <NumberWheels
            disabled={round.status !== 'playing' || game.dayStatus !== 'playing' || submitting}
            onSubmit={handleSubmit}
          />

          <View style={styles.boardWrap}>
            <GuessBoard
              guesses={round.guesses}
              attemptsAllowed={round.attemptsAllowed}
              showRemaining={round.status === 'playing' && game.dayStatus === 'playing'}
              // Only worth saying while there is a next round to lose an
              // attempt from. On round three the penalty cannot apply.
              finalNote={
                round.round < game.totalRounds
                  ? 'Solving now leaves you one fewer next round.'
                  : undefined
              }
            />
          </View>

        </View>
      </KeyboardAvoidingView>
    );
  };

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]} edges={['top', 'bottom']}>
      <StatusBar barStyle={mode === 'dark' ? 'light-content' : 'dark-content'} />
      {body()}

      <FeedbackOverlay trigger={feedbackTrigger} onDone={clearFeedback} />

      {game && showResult && (
        <RoundOverlay
          game={game}
          submit={lastSubmit}
          // Deliberately does not hide the card itself. The round is still
          // 'won' until the refetch returns, so hiding it here uncovered the
          // finished board and then re-triggered the summary a frame later.
          // Letting the status change dismiss it means one clean transition.
          advancing={advancing}
          onNextRound={advance}
          onRetry={retry}
          onConcede={concede}
          onExit={onExit}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  flex: { flex: 1 },
  unscored: {
    fontSize: 11.5,
    fontFamily: fonts.medium,
    textAlign: 'center',
    marginTop: -2,
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 12,
    gap: 14,
  },
  boardWrap: { flex: 1 },
});

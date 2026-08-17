import React, { useCallback, useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, StatusBar, StyleSheet, View } from 'react-native';
import { Text } from '../components/AppText';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CallYourShot, CALLS } from '../components/CallYourShot';
import { ChooseYourClue } from '../components/ChooseYourClue';
import { ClueCard } from '../components/ClueCard';
import { CommitRange } from '../components/CommitRange';
import { FeedbackOverlay, FeedbackTrigger } from '../components/FeedbackOverlay';
import { GuessBoard } from '../components/GuessBoard';
import { Header } from '../components/Header';
import { NumberInput } from '../components/NumberInput';
import { RoundOverlay } from '../components/RoundOverlay';
import { RoundProgress } from '../components/RoundProgress';
import { StatusScreen } from '../components/StatusScreen';
import { useDailyGameContext } from '../state/DailyGameContext';
import { feedbackColors } from '../theme/colors';
import { fonts } from '../theme/fonts';
import { useTheme } from '../theme/ThemeContext';
import { playLose, playWin } from '../utils/sound';
import { useTrack } from '../utils/useTrack';
import { hapticCorrect, hapticForTier, hapticInvalid, hapticOneAway, hapticWithin10 } from '../utils/haptics';
import { playCorrect, playForTier, playOneAway, playWithin10 } from '../utils/sound';

/** Long enough to see the tile land, short enough not to feel stuck. */
const RESULT_DELAY_MS = 3000;

export function GameScreen({ onExit }: { onExit: () => void }) {
  const { colors, mode } = useTheme();
  const {
    phase, game, loadError, submitting, advancing, lastResult, lastSubmit,
    submit, advance, retry, concede, reload,
    call, chooseClue, commitRange, deciding,
  } = useDailyGameContext();

  const [feedbackTrigger, setFeedbackTrigger] = useState<FeedbackTrigger>(null);
  const [showResult, setShowResult] = useState(false);

  // Only a guess made while this screen is open should play. The last result
  // stays in shared state after the screen unmounts, so returning from home
  // replayed the animation, sound and haptic for a guess made minutes ago -
  // and on the round after, greeted the player with the previous round's
  // WITHIN 10. Seeding the ref with whatever is already there on mount means
  // the effect only ever fires for something new.
  const played = useRef(lastResult);
  useTrack('game');

  useEffect(() => {
    if (!lastResult || lastResult === played.current) return;
    played.current = lastResult;
    if (lastResult.isCorrect) {
      hapticCorrect();
      playCorrect();
      playWin();
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
  // A round that ran out says so out loud; a solved one already has its sound.
  useEffect(() => {
    if (game?.round.status === 'lost') playLose();
  }, [game?.round.status, game?.round.round]);
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
    const live = round.status === 'playing' && game.dayStatus === 'playing';

    /**
     * Each round asks for something before it will take a guess, and until it
     * has that the guess board is meaningless. Round one wants the call, round
     * two wants a clue chosen, round three wants the range - and round three
     * asks last, once the free guesses are spent, because the range is the
     * thing that ends it.
     */
    const asksCall = live && round.kind === 'cold' && round.called === null;
    const asksClue = live && round.kind === 'clue' && round.clue1 === null;
    const asksRange = live && round.kind === 'bet' && round.attemptsUsed >= round.attemptsAllowed;
    const freeLeft = round.attemptsAllowed - round.attemptsUsed;
    const calledPay = CALLS.find((c) => c.n === round.called)?.pay;

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

          {asksCall ? (
            <CallYourShot onCall={call} busy={deciding} />
          ) : asksClue ? (
            <ChooseYourClue onChoose={chooseClue} busy={deciding} />
          ) : asksRange ? (
            <CommitRange onCommit={commitRange} busy={deciding} />
          ) : (
            <>
              {round.called !== null && calledPay !== undefined && (
                <Text style={[styles.standing, { color: colors.textMuted }]}>
                  You called {round.called} {round.called === 1 ? 'guess' : 'guesses'} · {calledPay} pts
                </Text>
              )}

              <ClueCard clue={round.clue1} />

              {round.kind === 'bet' && live && (
                <Text style={[styles.standing, { color: colors.textMuted }]}>
                  {freeLeft} free {freeLeft === 1 ? 'guess' : 'guesses'} — they cost nothing and end
                  nothing
                </Text>
              )}

              <NumberInput disabled={!live || submitting} onSubmit={handleSubmit} />
            </>
          )}

          <View style={styles.boardWrap}>
            <GuessBoard
              guesses={round.guesses}
              attemptsAllowed={round.attemptsAllowed}
              showRemaining={round.status === 'playing' && game.dayStatus === 'playing'}
              // Only worth saying while there is a next round to lose an
              // attempt from. On round three the penalty cannot apply.
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
  content: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 12,
    gap: 14,
  },
  boardWrap: { flex: 1 },
  /** The one line of standing state a round carries into its guesses. */
  standing: { fontSize: 12.5, fontFamily: fonts.bold, textAlign: 'center' },
});

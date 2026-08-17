import React, { useCallback, useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StatusBar, StyleSheet, View } from 'react-native';
import { Text } from '../components/AppText';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CallYourShot, LATE_PAY, MISS_PAY as FLOOR_PAY } from '../components/CallYourShot';
import { CLUE_PAYS } from '../components/ChooseYourClue';
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
import { playLose, playTap, playWin } from '../utils/sound';
import { useTrack } from '../utils/useTrack';
import { clearDayStart, clockText, dayStart, markDayStart } from '../utils/dayClock';
import { hapticCorrect, hapticForTier, hapticInvalid, hapticOneAway, hapticWithin10 } from '../utils/haptics';
import { playCorrect, playForTier, playOneAway, playWithin10 } from '../utils/sound';

/**
 * What each round is, at the top of it.
 *
 * A round that asks something different has to say so before it asks. Naming
 * the kind in the eyebrow and the question in the heading is what turns three
 * boards that look identical into three different days.
 */
const INTRO: Record<'cold' | 'clue' | 'bet', { kind: string; title: string; lede: string }> = {
  cold: {
    kind: 'COLD',
    title: 'Find the number',
    lede: 'No clue. Colors only — blue means aim higher, red means lower.',
  },
  clue: {
    kind: 'THE CLUE',
    title: 'Find it with help',
    lede: 'Six attempts, and one clue — but you choose which kind you get.',
  },
  bet: {
    kind: 'THE BET',
    title: 'How sure are you?',
    lede: 'Three free guesses that cost nothing and end nothing. Then commit to a range.',
  },
};

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
  // Reopening the call sheet before the first guess. The server takes a second
  // call while the round is untouched, so this is only about getting back to
  // the choice - nothing is undone.
  const [recalling, setRecalling] = useState(false);
  // The day's clock, from the first guess. Read once on mount and then ticked
  // locally, so a day resumed on another screen picks up where it stands.
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());

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

  const puzzleDate = game?.puzzleDate;
  // Every round the day has, including the one being played - the server sends
  // a row per round and the optimistic patch keeps the live one current.
  const guessesToday = (game?.rounds ?? []).reduce((n, r) => n + r.attemptsUsed, 0);

  useEffect(() => {
    if (!puzzleDate) return;
    let alive = true;
    // A day with no guesses in it has not started. The record is kept per date
    // rather than per player, so signing in as somebody else inherited their
    // clock - fifteen minutes elapsed on a board with nothing on it.
    if (guessesToday === 0) {
      clearDayStart(puzzleDate);
      setStartedAt(null);
      return;
    }
    dayStart(puzzleDate).then((t) => {
      if (alive) setStartedAt(t);
    });
    return () => {
      alive = false;
    };
  }, [puzzleDate, guessesToday]);

  // The first guess starts it, wherever that guess was made.
  useEffect(() => {
    if (!puzzleDate || startedAt !== null || guessesToday === 0) return;
    markDayStart(puzzleDate).then(setStartedAt);
  }, [puzzleDate, startedAt, guessesToday]);

  const dayLive = !!game && game.dayStatus === 'playing';
  useEffect(() => {
    if (startedAt === null || !dayLive) return;
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, [startedAt, dayLive]);

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
    const asksCall = live && round.kind === 'cold' && (round.called === null || recalling);
    const asksClue = live && round.kind === 'clue' && round.clue1 === null;
    const asksRange = live && round.kind === 'bet' && round.attemptsUsed >= round.attemptsAllowed;
    const asking = asksCall || asksClue || asksRange;
    const centreSheet = asking && round.guesses.length === 0;
    const intro = round.kind ? INTRO[round.kind] : null;
    const used = round.attemptsUsed;

    /**
     * The line under the input, which counts something different in each round.
     *
     * Round one counts down to the call while the call is still alive and to
     * the end of the round once it is gone - two numbers at once read as
     * arithmetic. Round two counts down to the end and says what finding it
     * now would pay, because the ladder is the whole decision about whether to
     * think longer. Round three counts free guesses, which cost nothing.
     */
    const countLine = (() => {
      if (!live || !round.kind) return null;
      if (round.kind === 'bet') {
        const free = round.attemptsAllowed - used;
        return `${free} free ${free === 1 ? 'guess' : 'guesses'} left`;
      }
      // "worth 10 points" rather than "10 points remaining": nothing is being
      // spent down from a pot the player owns - ten is what the round pays if
      // the next guess lands, and it falls again after that.
      const say = (n: number, pay: number) =>
        `${n} ${n === 1 ? 'guess' : 'guesses'} left · worth ${pay} points`;
      if (round.kind === 'clue') {
        return say(round.attemptsAllowed - used, CLUE_PAYS[used] ?? FLOOR_PAY);
      }
      if (round.called === null) return null;
      // Past the call, what is left to play for is the consolation - saying the
      // call was missed as well is telling somebody twice that they missed it.
      if (used >= round.called) return say(round.attemptsAllowed - used, LATE_PAY);
      const n = round.called - used;
      return `Called ${round.called} · ${n} ${n === 1 ? 'guess' : 'guesses'} left`;
    })();

    // Picking again overwrites the call on the server, so the sheet is simply
    // shown again rather than anything being undone.
    const onCall = async (n: number) => {
      setRecalling(false);
      await call(n);
    };

    return (
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={12}
      >
        <View style={styles.content}>
          <Header
            onBack={canLeave ? onExit : undefined}
            points={game.totalScore}
            clock={startedAt === null ? '0:00' : clockText(now - startedAt)}
          />

          <RoundProgress
            activeRound={round.round}
            totalRounds={game.totalRounds}
            rounds={game.rounds}
            totalScore={game.totalScore}
            kindLabel={intro?.kind}
            showScore={false}
          />

          {intro && (
            <View style={styles.intro}>
              <Text style={[styles.introTitle, { color: colors.text }]}>{intro.title}</Text>
              <Text style={[styles.introLede, { color: colors.textMuted }]}>{intro.lede}</Text>
            </View>
          )}

          {/* A sheet with an empty board under it sat at the top of a screen
              of nothing. Centred in the space it actually has, it reads as the
              screen rather than as something that failed to load the rest.
              Round three keeps its sheet at the top, because the three free
              guesses are underneath it and they are worth reading. */}
          {asksCall ? (
            <View style={centreSheet ? styles.sheetWrap : undefined}>
              <CallYourShot onCall={onCall} busy={deciding} />
            </View>
          ) : asksClue ? (
            <View style={centreSheet ? styles.sheetWrap : undefined}>
              <ChooseYourClue onChoose={chooseClue} busy={deciding} />
            </View>
          ) : asksRange ? (
            <CommitRange onCommit={commitRange} busy={deciding} />
          ) : (
            <>
              {/* Round one has no clue and round three has no clue, and an
                  empty card headed CLUE is worse than no card: it reads as a
                  clue that failed to load. */}
              {!!round.clue1 && <ClueCard clue={round.clue1} />}

              {/* The call is still a thought until a guess lands on it. */}
              {live && round.kind === 'cold' && round.called !== null && round.attemptsUsed === 0 && (
                <Pressable onPress={() => { playTap(); setRecalling(true); }} hitSlop={8}>
                  <Text style={[styles.changeCall, { color: colors.textMuted }]}>← Change call</Text>
                </Pressable>
              )}

              <NumberInput disabled={!live || submitting} onSubmit={handleSubmit} />
            </>
          )}

          <View style={styles.boardWrap}>
            <GuessBoard
              guesses={round.guesses}
              attemptsAllowed={round.attemptsAllowed}
              // A sheet is up: there is nothing to count down to yet, and a
              // stray "7 GUESSES LEFT" under a call of one contradicts it.
              showRemaining={live && !asking}
              remainingText={countLine ?? undefined}
              // Only worth saying while there is a next round to lose an
              // attempt from. On round three the penalty cannot apply.
            />
          </View>

          {/* The shape of the day, kept where somebody can read it without
              leaving the round they are in. */}
          <Text style={[styles.note, { color: colors.textMuted }]}>
            Three rounds, three different questions: call your shot and search cold, then a search
            with a clue you chose from three kinds, then a bet on a range. The clock starts on your
            first guess.
          </Text>

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
          dayClock={startedAt === null ? null : clockText(now - startedAt)}
          dayGuesses={guessesToday}
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
  sheetWrap: { flex: 1, justifyContent: 'center' },
  /** The question this round is asking, before it asks it. */
  intro: { gap: 3 },
  introTitle: { fontSize: 25, fontFamily: fonts.extraBold, letterSpacing: -0.6 },
  introLede: { fontSize: 13.5, fontFamily: fonts.medium, lineHeight: 19 },
  changeCall: { fontSize: 13, fontFamily: fonts.bold },
  note: {
    fontSize: 12,
    fontFamily: fonts.medium,
    lineHeight: 17,
    // Centred, because it sits alone at the foot of a lot of empty space and a
    // left edge with nothing above it reads as a paragraph that fell off.
    textAlign: 'center',
    paddingHorizontal: 8,
    // Off the bottom edge. Pinned right against it, it read as chrome the
    // screen had run out of room for.
    marginBottom: 22,
  },
});

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AppState,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text } from '../components/AppText';
import { BackButton } from '../components/BackButton';
import { Avatar } from '../components/Avatar';
import { FeedbackOverlay, FeedbackTrigger } from '../components/FeedbackOverlay';
import { GuessBoard } from '../components/GuessBoard';
import { NumberInput } from '../components/NumberInput';
import { StatusScreen } from '../components/StatusScreen';
import {
  ApiError,
  RushBoard,
  RushState,
  loadRush,
  loadRushBoard,
  messageFor,
  pauseRush,
  resumeRush,
  rushGuess,
  startRush,
} from '../lib/api';
import { feedbackColors } from '../theme/colors';
import { fonts } from '../theme/fonts';
import { MEDALS } from '../theme/medals';
import { useTheme } from '../theme/ThemeContext';
import { hapticCorrect, hapticForTier, hapticInvalid } from '../utils/haptics';
import { playCorrect, playForTier, playLose, playTap } from '../utils/sound';
import { playTrack } from '../utils/music';

/**
 * Three minutes, as many numbers as you can find.
 *
 * Every other mode is deliberate - attempts you can count, a clue to hold in
 * your head, time to think. This one is only hurry, and the contrast is the
 * point: it is the same game played with the one resource none of the others
 * spend.
 *
 * The clock is the server's. It runs from the moment the run starts, whether
 * the app is open, backgrounded or closed, and every guess is checked against
 * it - a timer the client owns is a timer the client can stop, and here the
 * whole score is a function of the clock.
 */
/** 1st, 2nd, 3rd - a bare "4 of 12" reads as a score rather than a placing. */
function ordinal(n: number): string {
  const rest = n % 100;
  if (rest >= 11 && rest <= 13) return `${n}th`;
  return `${n}${['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;
}

export function RushScreen({ onExit }: { onExit: () => void }) {
  const { colors } = useTheme();
  const [state, setState] = useState<RushState | null>(null);
  const [board, setBoard] = useState<RushBoard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [trigger, setTrigger] = useState<FeedbackTrigger | null>(null);
  const [left, setLeft] = useState(0);
  const [note, setNote] = useState<string | null>(null);
  // Held for a beat after a find, so a solve registers before the next number.
  const [found, setFound] = useState<number | null>(null);
  // 3, 2, 1 before the clock starts again, so nobody comes back mid-guess.
  const [countdown, setCountdown] = useState<number | null>(null);
  const ended = useRef(false);
  const running = useRef(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const s = await loadRush();
      setState(s);
      setLeft(s.secondsLeft);
      loadRushBoard().then(setBoard).catch(() => {});

    } catch (err) {
      setError(messageFor(err instanceof ApiError ? err.code : 'network'));
    }
  }, []);

  useEffect(() => {
    playTrack('game');
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Leaving stops the clock, wherever the player is going: another app, another
  // tab, or Home. One run a day and a clock that never stopped meant a phone
  // call cost the whole mode until tomorrow.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next !== 'active' && running.current) pauseRush();
    });
    return () => {
      sub.remove();
      if (running.current) pauseRush();
    };
  }, []);

  // Counted down here, but never trusted: the number on screen is only a
  // readout, and the server decides whether a guess arrived in time.
  useEffect(() => {
    if (!state?.started || state.over || state.paused || countdown !== null) return;
    const id = setInterval(() => {
      setLeft((n) => {
        if (n <= 1 && !ended.current) {
          ended.current = true;
          playLose();
          load();
          return 0;
        }
        return Math.max(0, n - 1);
      });
    }, 1000);
    return () => clearInterval(id);
  }, [state?.started, state?.over, state?.paused, countdown, load]);

  // Kept in a ref as well as in state: the pause on the way out runs from a
  // cleanup, which sees whatever state it closed over rather than the latest.
  useEffect(() => {
    running.current = !!state?.started && !state.over && !state.paused;
  }, [state?.started, state?.over, state?.paused]);

  const resume = useCallback(async () => {
    for (let n = 3; n > 0; n -= 1) {
      setCountdown(n);
      await new Promise((r) => setTimeout(r, 700));
    }
    setCountdown(null);
    try {
      await resumeRush();
      await load();
    } catch {
      /* the state reload below will show whatever actually happened */
    }
  }, [load]);

  const begin = async () => {
    playTap();
    setBusy(true);
    try {
      await startRush();
      ended.current = false;
      await load();
    } catch (err) {
      setNote(messageFor(err instanceof ApiError ? err.code : 'network'));
    } finally {
      setBusy(false);
    }
  };

  const submit = useCallback(
    async (value: number) => {
      if (busy) return { ok: false as const, error: 'Not now.' };
      setBusy(true);
      try {
        const res = await rushGuess(value);
        setLeft(res.secondsLeft);
        if (res.solved) {
          hapticCorrect();
          playCorrect();
          setFound(res.answer);
          setTimeout(() => setFound(null), 900);
        } else {
          if (res.result.isOneAway) setTrigger({ type: 'oneAway', key: Date.now() });
          else if (res.result.isWithin10) setTrigger({ type: 'within10', key: Date.now() });
          hapticForTier(res.result.tier);
          playForTier(res.result.tier);
        }
        await load();
        return { ok: true as const };
      } catch (err) {
        hapticInvalid();
        return { ok: false as const, error: messageFor(err instanceof ApiError ? err.code : 'network') };
      } finally {
        setBusy(false);
      }
    },
    [busy, load],
  );

  const rows = board?.entries ?? [];

  const standings = (title: string) =>
    rows.length === 0 ? null : (
      <View style={styles.board}>
        <Text style={[styles.boardTitle, { color: colors.textMuted }]}>{title}</Text>
        <View style={styles.row}>
          <Text style={[styles.rank, { color: 'transparent' }]}>0</Text>
          <View style={styles.headSpacer} />
          <Text style={[styles.colHead, { color: colors.textMuted }]}>GUESSES</Text>
          <Text style={[styles.colHeadRight, { color: colors.textMuted }]}>FOUND</Text>
        </View>
        {rows.map((e, i) => (
          <View key={`${e.rank}-${e.name}-${i}`} style={styles.row}>
            {MEDALS[e.rank] ? (
              <View style={[styles.medal, { backgroundColor: MEDALS[e.rank].ring }]}>
                <Text style={[styles.medalText, { color: MEDALS[e.rank].ink }]}>{e.rank}</Text>
              </View>
            ) : (
              <Text style={[styles.rank, { color: colors.textMuted }]}>{e.rank}</Text>
            )}
            <Avatar value={e.avatar} size={24} />
            <Text
              style={[styles.name, { color: colors.text }, e.isMe && styles.me]}
              numberOfLines={1}
            >
              {e.name}
            </Text>
            {/* The tiebreak, shown because it is what separates two equal
                scores: seven in 41 guesses is a better run than seven in 58. */}
            <Text style={[styles.guessCount, { color: colors.textMuted }]}>{e.attempts}</Text>
            <Text style={[styles.found, { color: colors.text }]}>{e.found}</Text>
          </View>
        ))}
      </View>
    );

  if (error) return <StatusScreen message={error} onRetry={load} />;
  if (!state) return <StatusScreen loading />;

  const clock = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
  const live = state.started && !state.over && !state.paused && left > 0;
  const over = state.started && (state.over || left <= 0);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]} edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.content}>
          <View style={styles.head}>
            <BackButton
              color={colors.text}
              onPress={() => {
                if (running.current) pauseRush();
                onExit();
              }}
            />
            {live && (
              <Text
                style={[
                  styles.clock,
                  { color: left <= 30 ? feedbackColors.oneAway : colors.text },
                ]}
              >
                {clock}
              </Text>
            )}
          </View>

          {!state.started ? (
            // Laid out like Impossible's way in: what the mode is, then how far
            // everyone got today, then the button. Nobody should have to spend
            // their one run of the day finding out what the rules are.
            <View style={styles.flex}>
              <ScrollView contentContainerStyle={styles.intro} showsVerticalScrollIndicator={false}>
                <Text style={[styles.title, { color: colors.text }]}>Rush</Text>

                <Text style={[styles.rule, { color: colors.textMuted }]}>
                  Three minutes. Find one number, the next appears immediately, and you keep going
                  until the clock runs out. Your score is how many you found.
                </Text>
                <Text style={[styles.rule, { color: colors.textMuted }]}>
                  No clues here, and no limit on guesses — the clock is the only thing you spend.
                  The colours work exactly as they do everywhere else: blue means aim higher, red
                  means lower, and the stronger the colour the closer you are.
                </Text>
                <Text style={[styles.rule, { color: colors.textMuted }]}>
                  Everyone hunts the same numbers each day, so the scores compare directly. One run
                  a day, and it starts the moment you press the button.
                </Text>
                <Text style={[styles.rule, { color: colors.textMuted }]}>
                  Leaving stops the clock and coming back gives you a countdown, so an interruption
                  costs you nothing. Every number found pays 15 XP toward your level.
                </Text>

                {standings('BEST TODAY')}

                {note && <Text style={[styles.note, { color: feedbackColors.oneAway }]}>{note}</Text>}
              </ScrollView>

              <Pressable
                onPress={begin}
                disabled={busy}
                style={({ pressed }) => [
                  styles.start,
                  { backgroundColor: colors.text, opacity: pressed ? 0.85 : 1 },
                ]}
              >
                <Text style={[styles.startText, { color: colors.background }]}>Start the clock</Text>
              </Pressable>
            </View>
          ) : state.paused || countdown !== null ? (
            <View style={styles.centre}>
              <Text style={[styles.bigScore, { color: colors.text }]}>{countdown ?? '❙❙'}</Text>
              <Text style={[styles.scoreLabel, { color: colors.textMuted }]}>
                {countdown !== null ? 'RESUMING' : 'CLOCK STOPPED'}
              </Text>
              <Text style={[styles.body, { color: colors.textMuted }]}>
                {state.found} found · {Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')} left
              </Text>
              {countdown === null && (
                <Pressable
                  onPress={() => {
                    playTap();
                    resume();
                  }}
                  style={({ pressed }) => [
                    styles.start,
                    { backgroundColor: colors.text, opacity: pressed ? 0.85 : 1 },
                  ]}
                >
                  <Text style={[styles.startText, { color: colors.background }]}>Carry on</Text>
                </Pressable>
              )}
            </View>
          ) : over ? (
            <View style={styles.centre}>
              {/* The score is the headline. "Time" was the largest thing on the
                  screen and it is the least interesting fact about the run. */}
              <Text style={[styles.bigScore, { color: colors.text }]}>{state.found}</Text>
              <Text style={[styles.scoreLabel, { color: colors.textMuted }]}>
                {state.found === 1 ? 'NUMBER FOUND' : 'NUMBERS FOUND'}
              </Text>
              <Text style={[styles.body, { color: colors.textMuted }]}>
                {state.found === 0
                  ? 'The clock ran out before you found one.'
                  : "Time's up. One run a day — new numbers at midnight."}
              </Text>

              {/* Where that sits among everyone who ran today. A position is
                  worth reading among a few dozen people and worth nothing among
                  ten thousand, so past twenty runs it becomes a percentage. */}
              {board?.me && (board.me.topPercent !== null || board.total >= 5) && (
                <Text style={[styles.standing, { color: colors.text }]}>
                  {board.me.topPercent !== null
                    ? `Top ${board.me.topPercent}% today`
                    : `${ordinal(board.me.rank)} of ${board.total} today`}
                </Text>
              )}

              {board?.me && board.me.found > 0 && (
                <Text style={[styles.body, { color: colors.textMuted }]}>
                  {board.me.attempts} guesses, {(board.me.attempts / board.me.found).toFixed(1)} a
                  number. Equal scores are ranked by that.
                </Text>
              )}

              {/* Nobody is ranked in a distribution, which is why it survives
                  any number of players sharing a score. */}
              {board && board.distribution.length > 1 && (
                <View style={styles.dist}>
                  {board.distribution.map((d) => {
                    const most = Math.max(...board.distribution.map((x) => x.players));
                    const mine = d.found === state.found;
                    return (
                      <View key={d.found} style={styles.distRow}>
                        <Text style={[styles.distFound, { color: colors.textMuted }]}>
                          {d.found}
                        </Text>
                        <View
                          style={[
                            styles.distBar,
                            {
                              backgroundColor: mine ? colors.text : colors.border,
                              width: `${Math.max(4, (d.players / most) * 78)}%`,
                            },
                          ]}
                        />
                        <Text
                          style={[
                            styles.distCount,
                            { color: mine ? colors.text : colors.textMuted },
                          ]}
                        >
                          {d.players}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              )}

              {rows.length === 0 ? (
                <Text style={[styles.body, { color: colors.textMuted }]}>
                  Nobody else has run today yet.
                </Text>
              ) : (
                standings('BEST TODAY')
              )}
            </View>
          ) : (
            <>
              <View style={styles.counter}>
                <Text style={[styles.score, { color: colors.text }]}>{state.found}</Text>
                <Text style={[styles.counterLabel, { color: colors.textMuted }]}>
                  {state.found === 1 ? 'FOUND' : 'FOUND'}
                </Text>
              </View>

              {found !== null && (
                <Text style={[styles.gotIt, { color: feedbackColors.correct }]}>
                  {found} — next one
                </Text>
              )}

              <NumberInput disabled={busy} onSubmit={submit} />

              <View style={styles.boardWrap}>
                <GuessBoard
                  guesses={state.guesses}
                  attemptsAllowed={state.guesses.length + 1}
                  showRemaining={false}
                />
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
  back: { fontSize: 15, fontFamily: fonts.extraBold, letterSpacing: 1 },
  clock: { fontSize: 22, fontFamily: fonts.extraBold, letterSpacing: 1 },
  centre: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
  intro: { paddingTop: 10, paddingBottom: 20, gap: 12 },
  rule: { fontSize: 13, fontFamily: fonts.medium, lineHeight: 19 },
  title: { fontSize: 46, fontFamily: fonts.extraBold, letterSpacing: -1 },
  body: { fontSize: 13.5, fontFamily: fonts.medium, lineHeight: 20, textAlign: 'center' },
  note: { fontSize: 12.5, fontFamily: fonts.bold, textAlign: 'center' },
  start: {
    alignSelf: 'stretch',
    borderRadius: 16,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 6,
  },
  startText: { fontSize: 16, fontFamily: fonts.extraBold },
  counter: { alignItems: 'center' },
  score: { fontSize: 52, fontFamily: fonts.extraBold, letterSpacing: -2 },
  bigScore: { fontSize: 96, fontFamily: fonts.extraBold, letterSpacing: -4, lineHeight: 104 },
  scoreLabel: { fontSize: 10.5, fontFamily: fonts.bold, letterSpacing: 2, marginTop: -8 },
  counterLabel: { fontSize: 9, fontFamily: fonts.bold, letterSpacing: 1.6, marginTop: -4 },
  gotIt: { fontSize: 13, fontFamily: fonts.extraBold, textAlign: 'center' },
  boardWrap: { flex: 1 },
  board: { alignSelf: 'stretch', marginTop: 18, gap: 6 },
  boardTitle: {
    fontSize: 9.5,
    fontFamily: fonts.bold,
    letterSpacing: 1.4,
    marginBottom: 2,
    textAlign: 'center',
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  rank: { width: 20, fontSize: 12, fontFamily: fonts.extraBold, textAlign: 'center' },
  medal: { width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  medalText: { fontSize: 10, fontFamily: fonts.extraBold },
  name: { flex: 1, fontSize: 13.5, fontFamily: fonts.bold },
  me: { textDecorationLine: 'underline' },
  found: { fontSize: 15, fontFamily: fonts.extraBold, width: 42, textAlign: 'right' },
  guessCount: { fontSize: 12, fontFamily: fonts.bold, width: 54, textAlign: 'right' },
  headSpacer: { flex: 1 },
  colHead: { fontSize: 8.5, fontFamily: fonts.bold, letterSpacing: 1, width: 54, textAlign: 'right' },
  colHeadRight: {
    fontSize: 8.5,
    fontFamily: fonts.bold,
    letterSpacing: 0.6,
    width: 42,
    textAlign: 'right',
  },
  standing: { fontSize: 15, fontFamily: fonts.extraBold, marginTop: 2 },
  dist: { alignSelf: 'stretch', marginTop: 14, gap: 4 },
  distRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  distFound: { width: 16, fontSize: 11, fontFamily: fonts.extraBold, textAlign: 'right' },
  distBar: { height: 12, borderRadius: 3 },
  distCount: { fontSize: 10.5, fontFamily: fonts.bold },
});

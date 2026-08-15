import React, { useCallback, useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text } from '../components/AppText';
import { Avatar } from '../components/Avatar';
import { FeedbackOverlay, FeedbackTrigger } from '../components/FeedbackOverlay';
import { GuessBoard } from '../components/GuessBoard';
import { NumberInput } from '../components/NumberInput';
import { StatusScreen } from '../components/StatusScreen';
import {
  ApiError,
  RushEntry,
  RushState,
  loadRush,
  loadRushBoard,
  messageFor,
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
export function RushScreen({ onExit }: { onExit: () => void }) {
  const { colors } = useTheme();
  const [state, setState] = useState<RushState | null>(null);
  const [board, setBoard] = useState<RushEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [trigger, setTrigger] = useState<FeedbackTrigger | null>(null);
  const [left, setLeft] = useState(0);
  const [note, setNote] = useState<string | null>(null);
  // Held for a beat after a find, so a solve registers before the next number.
  const [found, setFound] = useState<number | null>(null);
  const ended = useRef(false);

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

  // Counted down here, but never trusted: the number on screen is only a
  // readout, and the server decides whether a guess arrived in time.
  useEffect(() => {
    if (!state?.started || state.over) return;
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
  }, [state?.started, state?.over, load]);

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

  if (error) return <StatusScreen message={error} onRetry={load} />;
  if (!state) return <StatusScreen loading />;

  const clock = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
  const running = state.started && !state.over && left > 0;
  const over = state.started && (state.over || left <= 0);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]} edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.content}>
          <View style={styles.head}>
            <Pressable onPress={onExit} hitSlop={10}>
              <Text style={[styles.back, { color: colors.text }]}>‹ HOME</Text>
            </Pressable>
            {running && (
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
            <View style={styles.centre}>
              <Text style={[styles.title, { color: colors.text }]}>Rush</Text>
              <Text style={[styles.body, { color: colors.textMuted }]}>
                Three minutes. Find as many numbers as you can, one after another. No clues, and
                no limit on guesses — only the clock.
              </Text>
              <Text style={[styles.body, { color: colors.textMuted }]}>
                Everyone hunts the same numbers today, and you get one run. The clock starts the
                moment you press it and does not stop if you leave.
              </Text>
              {note && <Text style={[styles.note, { color: feedbackColors.oneAway }]}>{note}</Text>}
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
          ) : over ? (
            <View style={styles.centre}>
              <Text style={[styles.title, { color: colors.text }]}>Time</Text>
              <Text style={[styles.score, { color: colors.text }]}>{state.found}</Text>
              <Text style={[styles.body, { color: colors.textMuted }]}>
                {state.found === 0
                  ? 'none found — the clock ran out'
                  : state.found === 1
                    ? '1 number found today'
                    : `${state.found} numbers found today`}
              </Text>
              <Text style={[styles.body, { color: colors.textMuted }]}>
                One run a day. The next numbers arrive at midnight.
              </Text>

              {board.length === 0 ? (
                <Text style={[styles.body, { color: colors.textMuted }]}>
                  Nobody else has run today yet.
                </Text>
              ) : (
                <View style={styles.board}>
                  <Text style={[styles.boardTitle, { color: colors.textMuted }]}>TODAY</Text>
                  {board.slice(0, 8).map((e, i) => (
                    <View key={`${e.rank}-${e.name}-${i}`} style={styles.row}>
                      {MEDALS[e.rank] ? (
                        <View style={[styles.medal, { backgroundColor: MEDALS[e.rank].ring }]}>
                          <Text style={[styles.medalText, { color: MEDALS[e.rank].ink }]}>
                            {e.rank}
                          </Text>
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
                      <Text style={[styles.found, { color: colors.text }]}>{e.found}</Text>
                    </View>
                  ))}
                </View>
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
  title: { fontSize: 30, fontFamily: fonts.extraBold, textAlign: 'center' },
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
  found: { fontSize: 15, fontFamily: fonts.extraBold },
});

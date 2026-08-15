import React, { useCallback, useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ClueCard } from '../components/ClueCard';
import { FeedbackOverlay, FeedbackTrigger } from '../components/FeedbackOverlay';
import { GuessBoard } from '../components/GuessBoard';
import { NumberInput } from '../components/NumberInput';
import { StatusScreen } from '../components/StatusScreen';
import {
  ApiError,
  EndlessEntry,
  EndlessState,
  endlessGuess,
  loadEndless,
  loadEndlessBoard,
  messageFor,
} from '../lib/api';
import { fonts } from '../theme/fonts';
import { useTheme } from '../theme/ThemeContext';
import { playLose, playWin } from '../utils/sound';
import { playTrack } from '../utils/music';
import { hapticCorrect, hapticForTier, hapticInvalid } from '../utils/haptics';
import { playCorrect, playForTier } from '../utils/sound';

/**
 * The week's endless run: the same sequence of numbers for everyone, played
 * until a miss ends it.
 *
 * Shared on purpose. A private high score is solitaire - you beat your own six,
 * then eight, and after that each run grinds for one more against a number
 * nobody else can see. The same numbers for everyone make depth comparable, and
 * that is the only thing that gives the mode a point.
 *
 * Which is why it runs on the server. A sequence generated on the device would
 * be sitting in the bundle for anyone who looked, and a board built on numbers
 * the player already holds would be worthless.
 */
export function EndlessScreen({ onExit }: { onExit: () => void }) {
  const { colors } = useTheme();
  const [state, setState] = useState<EndlessState | null>(null);
  const [board, setBoard] = useState<EndlessEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [over, setOver] = useState<
    { answer: number | null; depth: number; sessionOver: boolean } | null
  >(null);
  const [trigger, setTrigger] = useState<FeedbackTrigger | null>(null);
  const [busy, setBusy] = useState(false);
  // Held between solving a number and the next one appearing.
  const [solved, setSolved] = useState<
    { answer: number | null; level: number; shrankTo: number | null } | null
  >(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setState(await loadEndless());
      loadEndlessBoard().then(setBoard).catch(() => {});
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

  const submit = useCallback(
    async (value: number) => {
      if (busy || over) return { ok: false as const, error: 'Not now.' };
      setBusy(true);
      try {
        const res = await endlessGuess(value);
        if (res.result.isCorrect) {
          hapticCorrect();
          playCorrect();
          playWin();
          if (true) {
            // Three seconds to register that it was right. Advancing the moment
            // the guess lands makes a solve feel like nothing happened.
            // The allowance holds for long stretches and then steps down, so
            // the two moments it does are worth announcing rather than letting
            // someone notice a guess missing.
            const shrankTo =
              state && res.attemptsAllowed < state.attemptsAllowed ? res.attemptsAllowed : null;
            setSolved({ answer: res.answer, level: res.level - 1, shrankTo });
            setTimeout(async () => {
              // Fetch the next number behind the notice, then clear it. Clearing
              // first put the number just solved back on screen for however long
              // the round trip took.
              await load();
              setSolved(null);
            }, 3000);
            return { ok: true as const };
          }
        } else {
          if (res.result.isOneAway) setTrigger({ type: 'oneAway', key: Date.now() });
          else if (res.result.isWithin10) setTrigger({ type: 'within10', key: Date.now() });
          hapticForTier(res.result.tier);
          playForTier(res.result.tier);
        }
        // A miss costs a life and leaves you on the same number; the climb
        // only pauses when the lives run out.
        if (res.lostLife) {
          playLose();
          setOver({ answer: res.answer, depth: res.lives, sessionOver: res.sessionOver });
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
    [busy, load, over, state],
  );

  const again = async () => {
    setOver(null);
    await load();
  };

  if (error) return <StatusScreen message={error} onRetry={load} />;
  if (!state) return <StatusScreen loading />;

  const myRank = board.find((e) => e.isMe);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]} edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.content}>
          <View style={styles.head}>
            <Pressable onPress={onExit} hitSlop={10}>
              <Text style={[styles.back, { color: colors.text }]}>‹ HOME</Text>
            </Pressable>
            <Text style={[styles.badge, { color: colors.textMuted }]}>
              {'♥'.repeat(Math.max(0, state.lives))} {state.lives}{' '}
              {state.lives === 1 ? 'LIFE' : 'LIVES'}
            </Text>
          </View>

          {solved ? (
            <View style={styles.result}>
              <Text style={[styles.overTitle, { color: colors.text }]}>Correct</Text>
              <Text style={[styles.overBody, { color: colors.textMuted }]}>
                {solved.answer !== null ? `It was ${solved.answer}. ` : ''}
                That's level {solved.level} cleared.
              </Text>
              {solved.shrankTo !== null ? (
                <Text style={[styles.overBody, { color: colors.text }]}>
                  Attempts drop to {solved.shrankTo} from here.
                </Text>
              ) : (
                <Text style={[styles.overBody, { color: colors.textMuted }]}>Next one coming…</Text>
              )}
            </View>
          ) : over ? (
            <View style={styles.result}>
              <Text style={[styles.overTitle, { color: colors.text }]}>
                {over.sessionOver ? 'Session over' : 'Life lost'}
              </Text>
              <Text style={[styles.overBody, { color: colors.textMuted }]}>
                {over.answer !== null ? `The number was ${over.answer}. ` : ''}
                {over.sessionOver
                  ? 'Your climb keeps its place. Come back for the next session.'
                  : `${over.depth} ${over.depth === 1 ? 'life' : 'lives'} left. The same number is waiting.`}
              </Text>
              <Text style={[styles.overBody, { color: colors.textMuted }]}>
                Everyone plays the same numbers this week, so how far you got compares directly.
              </Text>
              {!over.sessionOver ? (
                <Pressable
                  onPress={again}
                  style={({ pressed }) => [
                    styles.again,
                    { backgroundColor: colors.text, opacity: pressed ? 0.85 : 1 },
                  ]}
                >
                  <Text style={[styles.againText, { color: colors.background }]}>
                    Keep climbing
                  </Text>
                </Pressable>
              ) : (
                <Text style={[styles.overBody, { color: colors.textMuted }]}>
                  {state.sessionsLeft > 0
                    ? 'One more session today, whenever you want it.'
                    : "That's both sessions for today. Tomorrow you pick up exactly here."}
                </Text>
              )}

              {board.length > 0 && (
                <View style={styles.boardList}>
                  <Text style={[styles.boardTitle, { color: colors.textMuted }]}>FURTHEST THIS WEEK</Text>
                  {board.slice(0, 5).map((e) => (
                    <View key={`${e.rank}-${e.name}`} style={styles.boardRow}>
                      <Text style={[styles.boardRank, { color: colors.textMuted }]}>{e.rank}</Text>
                      <Text style={[styles.boardName, { color: colors.text }]} numberOfLines={1}>
                        {e.name}
                      </Text>
                      <Text style={[styles.boardDepth, { color: colors.text }]}>{e.depth}</Text>
                    </View>
                  ))}
                </View>
              )}
            </View>
          ) : (
            <>
              <View style={styles.levelRow}>
                <Text style={[styles.level, { color: colors.text }]}>{state.level}</Text>
                {/* "Numbers deep" was jargon. The goal and the ceiling, plainly. */}
                <Text style={[styles.levelLabel, { color: colors.textMuted }]}>
                  LEVEL {state.level} OF 100
                </Text>
              </View>

              {/* Held back until the allowance is nearly gone, and then about
                  the range they have already narrowed to. */}
              {state.clue1 ? (
                <ClueCard clue={state.clue1} />
              ) : (
                <View style={[styles.noClue, { borderColor: colors.border }]}>
                  <Text style={[styles.noClueText, { color: colors.textMuted }]}>
                    {state.level > 89
                      ? 'A clue arrives on your last attempt.'
                      : 'A clue arrives with three attempts left.'}
                  </Text>
                </View>
              )}

              <NumberInput disabled={busy} onSubmit={submit} />

              <View style={styles.boardWrap}>
                <GuessBoard guesses={state.guesses} attemptsAllowed={state.attemptsAllowed} />
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
  badge: { fontSize: 10, fontFamily: fonts.bold, letterSpacing: 1.2 },
  levelRow: { alignItems: 'center' },
  level: { fontSize: 40, fontFamily: fonts.extraBold, letterSpacing: -1 },
  noClue: { borderWidth: 1, borderRadius: 16, paddingVertical: 14, alignItems: 'center' },
  noClueText: { fontSize: 12.5, fontFamily: fonts.medium },
  levelLabel: { fontSize: 9, fontFamily: fonts.bold, letterSpacing: 1.4, marginTop: -2 },
  boardWrap: { flex: 1 },
  result: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 12 },
  overTitle: { fontSize: 28, fontFamily: fonts.extraBold },
  overBody: { fontSize: 13, fontFamily: fonts.medium, textAlign: 'center', lineHeight: 19 },
  again: {
    marginTop: 6,
    borderRadius: 14,
    paddingVertical: 13,
    paddingHorizontal: 32,
    alignItems: 'center',
  },
  againText: { fontSize: 15, fontFamily: fonts.extraBold },
  boardList: { alignSelf: 'stretch', marginTop: 18, gap: 4 },
  boardTitle: { fontSize: 9, fontFamily: fonts.bold, letterSpacing: 1.4, marginBottom: 2 },
  boardRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  boardRank: { width: 16, fontSize: 11, fontFamily: fonts.extraBold },
  boardName: { flex: 1, fontSize: 13, fontFamily: fonts.bold },
  boardDepth: { fontSize: 14, fontFamily: fonts.extraBold },
});

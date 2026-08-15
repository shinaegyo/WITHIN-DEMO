import React, { useCallback, useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, View } from 'react-native';
import { Text } from '../components/AppText';
import { BackButton } from '../components/BackButton';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle } from 'react-native-svg';
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
  startEndlessSession,
} from '../lib/api';
import { fonts } from '../theme/fonts';
import { arenaFor } from '../theme/arenas';
import { playLose, playWin } from '../utils/sound';
import { useTrack } from '../utils/useTrack';
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
  const [state, setState] = useState<EndlessState | null>(null);
  const [board, setBoard] = useState<EndlessEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [over, setOver] = useState<
    {
      answer: number | null;
      depth: number;
      sessionOver: boolean;
      /** Set only on the last life: the level the next session starts from. */
      restartsAt: number | null;
    } | null
  >(null);
  const [trigger, setTrigger] = useState<FeedbackTrigger | null>(null);
  const [busy, setBusy] = useState(false);
  // Held between solving a number and the next one appearing.
  const [solved, setSolved] = useState<
    { answer: number | null; level: number; shrankTo: number | null } | null
  >(null);
  // Held when a solve crosses into a new arena, so the change gets a moment of
  // its own rather than the screen simply going dark mid-guess.
  const [arrived, setArrived] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setState(await loadEndless());
      loadEndlessBoard().then(setBoard).catch(() => {});
    } catch (err) {
      setError(messageFor(err instanceof ApiError ? err.code : 'network'));
    }
  }, []);

  useTrack('impossible');

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
            const before = arenaFor(res.level - 1);
            const now = arenaFor(res.level);
            if (now.key !== before.key) setArrived(now.key);
            setSolved({ answer: res.answer, level: res.level - 1, shrankTo });
            setTimeout(async () => {
              // Fetch the next number behind the notice, then clear it. Clearing
              // first put the number just solved back on screen for however long
              // the round trip took.
              await load();
              setSolved(null);
              setArrived(null);
            }, arrived ? 4200 : 3000);
            return { ok: true as const };
          }
        } else {
          if (res.result.isOneAway) setTrigger({ type: 'oneAway', key: Date.now() });
          else if (res.result.isWithin10) setTrigger({ type: 'within10', key: Date.now() });
          hapticForTier(res.result.tier);
          playForTier(res.result.tier);
        }
        // A miss costs a life and leaves you on the same number. The last one
        // ends the climb, which falls back to the arena you had reached.
        if (res.lostLife) {
          playLose();
          setOver({
            answer: res.answer,
            depth: res.lives,
            sessionOver: res.sessionOver,
            restartsAt: res.restartsAt,
          });
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
  const arena = arenaFor(state.level);
  const hairline = 'rgba(255, 255, 255, 0.18)';

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: arena.background }]} edges={['top', 'bottom']}>
      {/* The light drains downward rather than sitting flat, so the deep end of
          the screen is always the darker one. */}
      <LinearGradient
        colors={[arena.background, arena.backgroundDeep]}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.content}>
          <View style={styles.head}>
            <BackButton color={arena.text} onPress={onExit} />
            <View style={styles.lives}>
              <Svg width={62} height={10} viewBox="0 0 62 10">
                {[0, 1, 2, 3, 4].map((i) => (
                  <Circle
                    key={i}
                    cx={5 + i * 13}
                    cy={5}
                    r={4}
                    fill={i < state.lives ? arena.muted : 'none'}
                    stroke={arena.muted}
                    strokeWidth={1.4}
                    opacity={i < state.lives ? 1 : 0.4}
                  />
                ))}
              </Svg>
              <Text style={[styles.badge, { color: arena.muted }]}>
                {state.lives} {state.lives === 1 ? 'LIFE' : 'LIVES'}
              </Text>
            </View>
          </View>

          {solved && arrived ? (
            <View style={styles.result}>
              <Text style={[styles.arenaName, { color: arena.accent }]}>
                {arenaFor(state.level).name.toUpperCase()}
              </Text>
              <Text style={[styles.overTitle, { color: arena.text }]}>
                {solved.shrankTo ?? state.attemptsAllowed} attempts from here
              </Text>
              <Text style={[styles.overBody, { color: arena.muted }]}>
                It gets darker and it gets tighter. See you on the other side.
              </Text>
            </View>
          ) : solved ? (
            <View style={styles.result}>
              <Text style={[styles.overTitle, { color: arena.text }]}>Correct</Text>
              <Text style={[styles.overBody, { color: arena.muted }]}>
                {solved.answer !== null ? `It was ${solved.answer}. ` : ''}
                That's level {solved.level} cleared.
              </Text>
              {solved.shrankTo !== null ? (
                <Text style={[styles.overBody, { color: arena.text }]}>
                  Attempts drop to {solved.shrankTo} from here.
                </Text>
              ) : (
                <Text style={[styles.overBody, { color: arena.muted }]}>Next one coming…</Text>
              )}
            </View>
          ) : over ? (
            <View style={styles.result}>
              <Text style={[styles.overTitle, { color: arena.text }]}>
                {over.sessionOver ? 'Climb over' : 'Life lost'}
              </Text>
              <Text style={[styles.overBody, { color: arena.muted }]}>
                {over.answer !== null ? `The number was ${over.answer}. ` : ''}
                {over.sessionOver
                  ? `That was the last life. You keep ${arenaFor(over.restartsAt ?? 1).name}` +
                    ` — the next climb starts at level ${over.restartsAt ?? 1}.`
                  : `${over.depth} ${over.depth === 1 ? 'life' : 'lives'} left. The same number is waiting.`}
              </Text>
              <Text style={[styles.overBody, { color: arena.muted }]}>
                Everyone plays the same numbers this week, so how far you got compares directly.
              </Text>
              {!over.sessionOver ? (
                <Pressable
                  onPress={again}
                  style={({ pressed }) => [
                    styles.again,
                    { backgroundColor: arena.text, opacity: pressed ? 0.85 : 1 },
                  ]}
                >
                  <Text style={[styles.againText, { color: arena.background }]}>
                    Keep climbing
                  </Text>
                </Pressable>
              ) : (
                <Text style={[styles.overBody, { color: arena.muted }]}>
                  That is today's climb. Tomorrow you start again from there.
                </Text>
              )}

              {board.length > 0 && (
                <View style={styles.boardList}>
                  <Text style={[styles.boardTitle, { color: arena.muted }]}>FURTHEST THIS WEEK</Text>
                  {board.slice(0, 5).map((e, i) => (
                    <View key={`${e.rank}-${e.name}-${i}`} style={styles.boardRow}>
                      <Text style={[styles.boardRank, { color: arena.muted }]}>{e.rank}</Text>
                      <Text style={[styles.boardName, { color: arena.text }]} numberOfLines={1}>
                        {e.name}
                      </Text>
                      <Text style={[styles.boardDepth, { color: arena.text }]}>{e.depth}</Text>
                    </View>
                  ))}
                </View>
              )}
            </View>
          ) : (
            <>
              <View style={styles.levelRow}>
                <Text style={[styles.level, { color: arena.text }]}>{state.level}</Text>
                {/* "Numbers deep" was jargon. The goal and the ceiling, plainly. */}
                <Text style={[styles.levelLabel, { color: arena.muted }]}>
                  {arena.name.toUpperCase()} · LEVEL {state.level} OF 100
                </Text>
              </View>

              {/* Held back until the allowance is nearly gone, and then about
                  the range they have already narrowed to. */}
              {state.clue1 ? (
                <ClueCard clue={state.clue1} />
              ) : (
                <View style={[styles.noClue, { borderColor: hairline }]}>
                  <Text style={[styles.noClueText, { color: arena.muted }]}>
                    {`A clue arrives on your ${
                      ['', 'first', 'second', 'third', 'fourth', 'fifth'][arena.clueFrom] ??
                      `${arena.clueFrom}th`
                    } attempt.`}
                  </Text>
                </View>
              )}

              {/* No session means no guess the server will accept, so the
                  field goes away rather than taking a number and returning an
                  error. A day that has turned lands here. */}
              {state.inSession ? (
                <NumberInput disabled={busy} onSubmit={submit} />
              ) : (
                <Pressable
                  onPress={async () => {
                    if (busy) return;
                    setBusy(true);
                    try {
                      await startEndlessSession();
                      await load();
                    } finally {
                      setBusy(false);
                    }
                  }}
                  style={({ pressed }) => [
                    styles.again,
                    { backgroundColor: arena.text, opacity: pressed ? 0.85 : 1 },
                  ]}
                >
                  <Text style={[styles.againText, { color: arena.background }]}>
                    {state.sessionsLeft > 0 ? "Start today's climb" : 'Back tomorrow'}
                  </Text>
                </Pressable>
              )}

              <View style={styles.boardWrap}>
                <GuessBoard
                  guesses={state.guesses}
                  attemptsAllowed={state.attemptsAllowed}
                  blindOneAway
                  ink={arena.text}
                  inkMuted={arena.muted}
                  tileSurface={arena.surface}
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
  badge: { fontSize: 10, fontFamily: fonts.bold, letterSpacing: 1.2 },
  lives: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  arenaName: { fontSize: 12, fontFamily: fonts.extraBold, letterSpacing: 2.4, marginBottom: 4 },
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

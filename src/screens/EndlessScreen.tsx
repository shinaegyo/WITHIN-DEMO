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
import { arenaFor, checkpointFor, nextCheckpoint, SUMMIT } from '../theme/arenas';
import { playLose, playWin } from '../utils/sound';
import { useTrack } from '../utils/useTrack';
import { climbTrack } from '../utils/climbTrack';
import { devStageLevel } from '../utils/devSkip';
import { hapticCorrect, hapticForTier, hapticInvalid } from '../utils/haptics';
import { playCorrect, playForTier } from '../utils/sound';
import { radius, border } from '../theme/tokens';

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
      /** Health after the fall. */
      health: number;
      /** What the fall cost, which differs by tier: 10% down here, 50% up top. */
      cost: number;
      sessionOver: boolean;
      /** Set only when health runs out: the level the next session starts from. */
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

  // The music follows the altitude, and follows the same level the arena is
  // painted from - so ?stage= moves both together and neither can drift.
  useTrack(climbTrack(devStageLevel() ?? state?.level ?? 1));

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
            health: res.health,
            cost: res.fall,
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
  // ?stage=orbit paints the screen as that stage without an eighty-number
  // climb to reach it. Dev and web only.
  // The week resets on Monday, so a climb that ends on Sunday has no tomorrow
  // to promise - the only thing left to say is how far this week got.
  const weekOver = new Date().getDay() === 0;

  const arena = arenaFor(devStageLevel() ?? state.level);
  const hairline = 'rgba(255, 255, 255, 0.18)';

  // Topped out: there is no next number, and the screen should not pretend
  // there is by showing an empty board with a keypad under it.
  if (state.summit) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: arena.background }]} edges={['top', 'bottom']}>
        <LinearGradient
          colors={[arena.background, arena.backgroundDeep]}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
        <View style={styles.content}>
          <View style={styles.head}>
            <BackButton color={arena.text} onPress={onExit} />
          </View>
          <View style={styles.result}>
            <Text style={[styles.arenaName, { color: arena.accent }]}>THE SUMMIT</Text>
            <Text style={[styles.overHit, { color: arena.text }]}>TOPPED OUT!</Text>
            <Text style={[styles.overBody, { color: arena.muted }]}>
              All {SUMMIT} levels, in {state.guessesUsed} guesses. Everyone who finishes this week
              ranks on that number, so it is the one to beat.
            </Text>
            <Pressable
              onPress={onExit}
              style={({ pressed }) => [
                styles.again,
                { backgroundColor: arena.text, opacity: pressed ? 0.85 : 1 },
              ]}
            >
              <Text style={[styles.againText, { color: arena.background }]}>See the board</Text>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    );
  }

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
            {/* Health rather than lives, as a bar rather than five circles.
                Five discrete things asks you to count them; a bar you are
                draining is read at a glance, and a percentage says what the
                next mistake costs without anybody having to be told twice. */}
            {/* Label, track, figure - laid out in a row rather than stacked on
                top of each other. Absolutely positioning the bar put it over
                the number it was meant to sit beside. */}
            <View style={styles.lives}>
              <Text style={[styles.healthLabel, { color: arena.muted }]}>HEALTH</Text>
              <View style={styles.healthTrack}>
                {/* Siblings, not parent and child: opacity on the container
                    would have faded the fill inside it too. */}
                <View style={[styles.healthEmpty, { backgroundColor: arena.muted }]} />
                <View
                  style={[
                    styles.healthFill,
                    { backgroundColor: arena.muted, width: `${state.health}%` },
                  ]}
                />
              </View>
              <Text style={[styles.badge, { color: arena.muted }]}>{state.health}%</Text>
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

              {/* The checkpoint, said at the only moment it is about to matter.
                  It is the one rule that decides what a day is worth, and it
                  was written down once on a screen nobody reads twice. */}
              {/* Checkpoints are no longer every fifth level flat: a tier floor
                  is one too, so climbing into Stratosphere cannot be undone by
                  a single fall. Asking the same function the game asks is the
                  only way this line stays true. */}
              <Text style={[styles.checkpoint, { color: arena.text }]}>
                {(() => {
                  const here = checkpointFor(solved.level);
                  const next = nextCheckpoint(solved.level);
                  if (here === solved.level) {
                    return next
                      ? `Checkpoint. Tomorrow starts you at level ${solved.level} — next one at ${next}.`
                      : `Checkpoint. Tomorrow starts you at level ${solved.level}.`;
                  }
                  if (!next) return `Checkpoint held at level ${here}.`;
                  const away = next - solved.level;
                  return away === 1
                    ? `One more level to the checkpoint at ${next}.`
                    : `${away} levels to the checkpoint at ${next}.`;
                })()}
              </Text>
            </View>
          ) : over ? (
            <View style={styles.result}>
              <Text style={[styles.overHit, { color: arena.text }]}>
                {/* Damage, not a fall. Nothing moved - the same number is
                    waiting, and that is the whole reason health works. */}
                {over.sessionOver ? 'OUT OF HEALTH!' : 'YOU TOOK DAMAGE!'}
              </Text>
              {/* The answer is never printed, and as of 0151 it is not sent
                  either. It used to be shown here, and paired with "the same
                  number is waiting" that handed the retry over free; taking it
                  off the screen left it sitting in the reply body, which is the
                  same gift to anybody who opens the network tab. Neither half
                  of the fall notice has the number now. */}
              <Text style={[styles.overBody, { color: arena.muted }]}>
                {!over.sessionOver
                  ? `That cost ${over.cost}%. Down to ${over.health}% health.`
                  : weekOver
                    ? `You got to level ${state.level}.`
                    : `Your next climb starts at level ${over.restartsAt ?? 1}. See you tomorrow.`}
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
                // The line above already says where tomorrow starts, or that
                // the week is done. Saying it twice was the old card's job
                // when the first line was busy naming a number.
                <View />
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
                  {arena.name.toUpperCase()} · LEVEL {state.level} OF {SUMMIT}
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
                    {state.health > 0 ? "Start today's climb" : 'Back tomorrow'}
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
              belowFill={arena.below}
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
  lives: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  healthLabel: { fontSize: 8.5, fontFamily: fonts.bold, letterSpacing: 1.2 },
  // The track is the empty state at low opacity; the fill is the same colour
  // solid, so one hue reads as full and spent without a second colour.
  healthTrack: { width: 62, height: 8, borderRadius: 4, overflow: 'hidden' },
  healthEmpty: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, opacity: 0.26 },
  healthFill: { height: 8, borderRadius: 4 },
  arenaName: { fontSize: 12, fontFamily: fonts.extraBold, letterSpacing: 2.4, marginBottom: 4 },
  levelRow: { alignItems: 'center' },
  level: { fontSize: 40, fontFamily: fonts.extraBold, letterSpacing: -1 },
  noClue: { borderWidth: border.hairline, borderRadius: radius.button, paddingVertical: 14, alignItems: 'center' },
  noClueText: { fontSize: 12.5, fontFamily: fonts.medium },
  levelLabel: { fontSize: 9, fontFamily: fonts.bold, letterSpacing: 1.4, marginTop: -2 },
  boardWrap: { flex: 1 },
  checkpoint: {
    fontSize: 13,
    fontFamily: fonts.extraBold,
    textAlign: 'center',
    lineHeight: 19,
    marginTop: 10,
  },
  result: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 12 },
  // Centred, because everything under it is - left-aligned it read as though
  // it belonged to something above rather than heading the card it sits on.
  overTitle: { fontSize: 28, fontFamily: fonts.extraBold, textAlign: 'center' },
  // The one moment in the mode that should land like a hit: larger, in caps,
  // and the only title here that gets an exclamation.
  overHit: {
    fontSize: 34,
    fontFamily: fonts.extraBold,
    textAlign: 'center',
    letterSpacing: 0.5,
    lineHeight: 39,
  },
  overBody: { fontSize: 13, fontFamily: fonts.medium, textAlign: 'center', lineHeight: 19 },
  again: {
    marginTop: 6,
    borderRadius: radius.card,
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

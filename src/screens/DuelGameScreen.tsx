import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, View } from 'react-native';
import { Text } from '../components/AppText';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ClueCard } from '../components/ClueCard';
import { GuessBoard } from '../components/GuessBoard';
import { NumberInput } from '../components/NumberInput';
import { StatusScreen } from '../components/StatusScreen';
import {
  ApiError,
  DuelState,
  challengeFriend,
  duelGuess,
  findRankedMatch,
  forfeitDuel,
  loadDuel,
  messageFor,
  setDuelNumber,
} from '../lib/api';
import { feedbackColors } from '../theme/colors';
import { fonts } from '../theme/fonts';
import { hapticCorrect, hapticForTier, hapticInvalid } from '../utils/haptics';
import { playCorrect, playForTier } from '../utils/sound';
import { useTheme } from '../theme/ThemeContext';
import { playLose, playWin } from '../utils/sound';
import { playTrack } from '../utils/music';

/**
 * A duel round, played the same way as a daily one.
 *
 * No score: a duel is decided by attempts, not points, so there is nothing to
 * add up while playing. The opponent's board stays hidden until both have
 * finished — shown here only once the duel is settled.
 */
export function DuelGameScreen({
  duelId,
  onExit,
  onLeave,
}: {
  duelId: string;
  onExit: () => void;
  /** Forfeiting ends the match, so it goes home rather than back to the list. */
  onLeave: () => void;
}) {
  const { colors } = useTheme();
  const [duel, setDuel] = useState<DuelState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Asks once. Leaving hands them the duel, which is not a thing to do by
  // brushing a word at the top of the screen.
  const [leaving, setLeaving] = useState(false);
  // Counted down locally from the server's figure, and re-read on every refresh
  // so a phone with a wrong clock cannot buy itself time.
  const [seconds, setSeconds] = useState(0);
  // A result wants a moment on its own before it turns into two buttons.
  const [offerRematch, setOfferRematch] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      setDuel(await loadDuel(duelId));
    } catch (err) {
      setError(messageFor(err instanceof ApiError ? err.code : 'network'));
    }
  }, [duelId]);

  useEffect(() => {
    playTrack('duel');
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!duel?.round) return;
    setSeconds(duel.round.secondsLeft);
  }, [duel?.round?.round, duel?.round?.secondsLeft]);

  useEffect(() => {
    if (!duel?.round || seconds <= 0) return;
    const id = setInterval(() => setSeconds((n) => Math.max(0, n - 1)), 1000);
    return () => clearInterval(id);
  }, [duel?.round, seconds]);

  // Hitting zero is the server's call, so the screen asks rather than decides.
  useEffect(() => {
    if (duel?.round && seconds === 0) load();
  }, [duel?.round, seconds, load]);

  // Nothing here is driven by my own taps while I am waiting: the round opens
  // when they set a number, and settles when they finish. Without polling, both
  // players sit on a stale screen until somebody thinks to reload - which is
  // not a thing anybody thinks to do inside a three-minute round.
  const idle =
    !!duel &&
    duel.status !== 'complete' &&
    (duel.status === 'pending' || duel.pickSubmitted || duel.round === null || duel.waitingForThem);

  useEffect(() => {
    if (!idle) return;
    const id = setInterval(() => {
      if (!busy) load();
    }, 3000);
    return () => clearInterval(id);
  }, [idle, busy, load]);

  useEffect(() => {
    if (duel?.status !== 'complete') {
      setOfferRematch(false);
      return;
    }
    if (duel.outcome === 'won') playWin();
    else if (duel.outcome === 'lost') playLose();
    const id = setTimeout(() => setOfferRematch(true), 5000);
    return () => clearTimeout(id);
  }, [duel?.status]);

  const submit = useCallback(
    async (value: number) => {
      if (busy) return { ok: false as const, error: 'One at a time.' };
      setBusy(true);
      try {
        const res = await duelGuess(duelId, value);
        if (res.result.isCorrect) {
          hapticCorrect();
          playCorrect();
        } else {
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
    [busy, duelId, load],
  );

  // The number this player sets for the other. Same input as a guess, so it
  // reads as the same kind of act - which it is, from the other side.
  // A friendly rematch is a fresh challenge; a ranked one is the queue.
  const rematch = async () => {
    if (busy || !duel) return;
    setBusy(true);
    try {
      if (duel.ranked) {
        const res = await findRankedMatch();
        if (res.status === 'matched' && res.duelId) {
          onExit();
          return;
        }
      } else {
        await challengeFriend(duel.opponent);
      }
      onExit();
    } catch {
      onExit();
    } finally {
      setBusy(false);
    }
  };

  const choose = useCallback(
    async (value: number) => {
      if (busy) return { ok: false as const, error: 'One at a time.' };
      setBusy(true);
      try {
        await setDuelNumber(duelId, value);
        await load();
        return { ok: true as const };
      } catch (err) {
        hapticInvalid();
        return { ok: false as const, error: messageFor(err instanceof ApiError ? err.code : 'network') };
      } finally {
        setBusy(false);
      }
    },
    [busy, duelId, load],
  );

  if (error) return <StatusScreen message={error} onRetry={load} />;
  if (!duel) return <StatusScreen loading />;

  const pending = duel.status === 'pending';
  const picking = !pending && duel.pickRound !== null;
  const done = duel.round === null;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.content}>
          <View style={styles.head}>
            <Pressable
              onPress={() => (duel.status === 'active' ? setLeaving(true) : onExit())}
              hitSlop={10}
            >
              <Text style={[styles.back, { color: colors.text }]}>‹ DUELS</Text>
            </Pressable>
            <Text style={[styles.vs, { color: colors.textMuted }]}>VS {duel.opponent.toUpperCase()}</Text>
          </View>

          {/* One cell per round drawn so far. A settled round shows both
              counts and takes its colour from the outcome; an unsettled one
              shows nothing of theirs, so nobody plays against a running
              commentary. */}
          <View style={styles.scoreRow}>
            {duel.rounds.map((r) => {
              const tone =
                !r.settled
                  ? colors.border
                  : r.result === 'won'
                    ? feedbackColors.correct
                    : r.result === 'tie'
                      ? feedbackColors.within10
                      : feedbackColors.oneAway;
              const count = (n: number | null, status: string | null) =>
                status === 'won' ? String(n) : status === 'lost' ? '✕' : '–';
              // A settled round fills; a hairline outline was too quiet to
              // read at a glance, which is the only way this strip is read.
              const ink = r.settled ? '#FFFFFF' : colors.text;
              return (
                <View
                  key={r.round}
                  style={[
                    styles.scoreCell,
                    {
                      borderColor: r.settled ? tone : colors.border,
                      backgroundColor: r.settled ? tone : colors.surface,
                    },
                  ]}
                >
                  <Text style={[styles.scoreRound, { color: r.settled ? '#FFFFFF' : colors.textMuted }]}>
                    {r.round === 4 ? 'DECIDER' : `R${r.round}`}
                  </Text>
                  <Text style={[styles.scoreMine, { color: ink }]}>
                    {count(r.mine, r.mineStatus)}
                  </Text>
                  <Text style={[styles.scoreTheirs, { color: r.settled ? '#FFFFFF' : colors.textMuted }]}>
                    {r.settled ? count(r.theirs, r.theirStatus) : '·'}
                  </Text>
                </View>
              );
            })}
          </View>

          {pending ? (
            <View style={styles.result}>
              <Text style={[styles.resultTitle, { color: colors.text }]}>Challenge sent</Text>
              <Text style={[styles.resultBody, { color: colors.textMuted }]}>
                Waiting for {duel.opponent} to accept. Once they do, you both choose a number and
                the round opens for the two of you at the same moment.
              </Text>
            </View>
          ) : picking ? (
            duel.pickSubmitted ? (
              <View style={styles.result}>
                <ActivityIndicator color={colors.textMuted} />
                <Text style={[styles.resultTitle, { color: colors.text }]}>
                  Waiting on {duel.opponent}
                </Text>
                <Text style={[styles.resultBody, { color: colors.textMuted }]}>
                  They are choosing your number. The round opens for both of you at once, so
                  neither of you starts guessing while the other is still deciding.
                </Text>
              </View>
            ) : (
              <View style={styles.picker}>
                <Text style={[styles.roundTitle, { color: colors.text }]}>
                  {duel.pickRound === 4 ? 'DECIDER' : `ROUND ${duel.pickRound}`}
                </Text>
                <Text style={[styles.resultBody, { color: colors.textMuted }]}>
                  Choose the number {duel.opponent} has to find, 1 to 1000. They are choosing yours
                  at the same time.
                </Text>
                <NumberInput
                  disabled={busy}
                  onSubmit={choose}
                  submitLabel="Set"
                  placeholder="Their number"
                />
              </View>
            )
          ) : done ? (
            <View style={styles.result}>
              {/* Finished first. Something has to move, or a screen that is
                  waiting looks like a screen that has stopped. */}
              {duel.status !== 'complete' && <ActivityIndicator color={colors.textMuted} />}
              <Text style={[styles.resultTitle, { color: colors.text }]}>
                {duel.status !== 'complete'
                  ? `Waiting on ${duel.opponent}`
                  : duel.outcome === 'won'
                    ? 'You won'
                    : duel.outcome === 'lost'
                      ? 'You lost'
                      : 'Drawn'}
              </Text>
              <Text style={[styles.resultBody, { color: colors.textMuted }]}>
                {duel.status !== 'complete'
                  ? `They have this round to finish. It is settled the moment they do, or when their three minutes are up.`
                  : 'Fewer guesses takes the round. Your counts are above, theirs beneath. Orange is a tie.'}
              </Text>

              {duel.status === 'complete' && offerRematch && (
                <View style={styles.endActions}>
                  <Pressable
                    onPress={rematch}
                    disabled={busy}
                    style={({ pressed }) => [
                      styles.endButton,
                      { backgroundColor: colors.text, opacity: pressed || busy ? 0.85 : 1 },
                    ]}
                  >
                    <Text style={[styles.endButtonText, { color: colors.background }]}>
                      Play again
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={onExit}
                    style={({ pressed }) => [
                      styles.endButton,
                      styles.endButtonQuiet,
                      { borderColor: colors.border, opacity: pressed ? 0.7 : 1 },
                    ]}
                  >
                    <Text style={[styles.endButtonText, { color: colors.text }]}>Leave</Text>
                  </Pressable>
                </View>
              )}
            </View>
          ) : (
            <>
              <Text style={[styles.roundTitle, { color: colors.text }]}>
                {duel.round!.round === 4 ? 'DECIDER' : `ROUND ${duel.round!.round}`}
              </Text>
              {/* Three minutes, counted by the server and displayed here. Under
                  thirty it turns red, which is the only warning anybody needs. */}
              <Text
                style={[
                  styles.clock,
                  { color: seconds <= 30 ? feedbackColors.oneAway : colors.textMuted },
                ]}
              >
                {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}
              </Text>

              <ClueCard clue={duel.round!.clue1} />

              <NumberInput disabled={busy} onSubmit={submit} />

              <View style={styles.boardWrap}>
                <GuessBoard
                  guesses={duel.round!.guesses}
                  attemptsAllowed={duel.round!.attemptsAllowed}
                />
              </View>
            </>
          )}
          {duel.status === 'active' && (
            <Pressable onPress={() => setLeaving(true)} hitSlop={8} style={styles.leaveWrap}>
              <Text style={[styles.leave, { color: feedbackColors.oneAway }]}>LEAVE</Text>
            </Pressable>
          )}
        </View>
      </KeyboardAvoidingView>

      {/* There is no leaving a duel quietly: the match ends and the other
          player takes it, so the question is asked plainly and the answers are
          the two words somebody actually thinks in. */}
      <Modal visible={leaving} transparent animationType="fade" onRequestClose={() => setLeaving(false)}>
        <View style={styles.askBackdrop}>
          <View style={[styles.ask, { backgroundColor: colors.background, borderColor: colors.border }]}>
            <Text style={[styles.askTitle, { color: colors.text }]}>
              Are you sure you want to leave the match?
            </Text>
            <Text style={[styles.askBody, { color: colors.textMuted }]}>
              The duel ends here and goes to {duel.opponent}.
            </Text>

            <Pressable
              onPress={async () => {
                if (busy) return;
                setBusy(true);
                try {
                  await forfeitDuel(duelId);
                } finally {
                  setBusy(false);
                  setLeaving(false);
                  onLeave();
                }
              }}
              style={({ pressed }) => [
                styles.askButton,
                { backgroundColor: feedbackColors.oneAway, opacity: pressed || busy ? 0.85 : 1 },
              ]}
            >
              <Text style={[styles.askButtonText, { color: '#FFFFFF' }]}>Yes</Text>
            </Pressable>

            <Pressable
              onPress={() => setLeaving(false)}
              style={({ pressed }) => [
                styles.askButton,
                styles.askButtonQuiet,
                { borderColor: colors.border, opacity: pressed ? 0.7 : 1 },
              ]}
            >
              <Text style={[styles.askButtonText, { color: colors.text }]}>No</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  flex: { flex: 1 },
  content: { flex: 1, paddingHorizontal: 20, paddingTop: 6, gap: 10 },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  back: { fontSize: 15, fontFamily: fonts.extraBold, letterSpacing: 1 },
  vs: { fontSize: 10, fontFamily: fonts.bold, letterSpacing: 1.3 },
  leaveWrap: { alignSelf: 'center', paddingVertical: 10 },
  askBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    paddingHorizontal: 26,
  },
  ask: { borderWidth: 1, borderRadius: 18, padding: 22, gap: 10 },
  askTitle: { fontSize: 19, fontFamily: fonts.extraBold, lineHeight: 25 },
  askBody: { fontSize: 13.5, fontFamily: fonts.medium, lineHeight: 19, marginBottom: 6 },
  askButton: { borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  askButtonQuiet: { backgroundColor: 'transparent', borderWidth: 1.5 },
  askButtonText: { fontSize: 15.5, fontFamily: fonts.extraBold },
  roundTitle: {
    fontSize: 15,
    fontFamily: fonts.extraBold,
    letterSpacing: 2,
    textAlign: 'center',
  },
  clock: { fontSize: 26, fontFamily: fonts.extraBold, textAlign: 'center', letterSpacing: 1 },
  endActions: { alignSelf: 'stretch', gap: 10, marginTop: 22, paddingHorizontal: 8 },
  endButton: { borderRadius: 14, paddingVertical: 15, alignItems: 'center' },
  endButtonQuiet: { backgroundColor: 'transparent', borderWidth: 1.5 },
  endButtonText: { fontSize: 15.5, fontFamily: fonts.extraBold },
  leave: { fontSize: 12.5, fontFamily: fonts.extraBold },
  picker: { flex: 1, justifyContent: 'center', gap: 10, paddingHorizontal: 4 },
  scoreRow: { flexDirection: 'row', gap: 8 },
  scoreCell: { flex: 1, borderWidth: 1, borderRadius: 10, paddingVertical: 7, alignItems: 'center' },
  scoreRound: { fontSize: 8.5, fontFamily: fonts.bold, letterSpacing: 1 },
  scoreMine: { fontSize: 17, fontFamily: fonts.extraBold },
  scoreTheirs: { fontSize: 12, fontFamily: fonts.bold },
  boardWrap: { flex: 1 },
  result: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 10 },
  resultTitle: { fontSize: 26, fontFamily: fonts.extraBold },
  resultBody: { fontSize: 13, fontFamily: fonts.medium, textAlign: 'center', lineHeight: 19 },
});

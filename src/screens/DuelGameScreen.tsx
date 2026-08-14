import React, { useCallback, useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ClueCard } from '../components/ClueCard';
import { GuessBoard } from '../components/GuessBoard';
import { NumberWheels } from '../components/NumberWheels';
import { StatusScreen } from '../components/StatusScreen';
import { ApiError, DuelState, duelGuess, loadDuel, messageFor } from '../lib/api';
import { feedbackColors } from '../theme/colors';
import { fonts } from '../theme/fonts';
import { hapticCorrect, hapticForTier, hapticInvalid } from '../utils/haptics';
import { playCorrect, playForTier } from '../utils/sound';
import { useTheme } from '../theme/ThemeContext';

/**
 * A duel round, played the same way as a daily one.
 *
 * No score: a duel is decided by attempts, not points, so there is nothing to
 * add up while playing. The opponent's board stays hidden until both have
 * finished — shown here only once the duel is settled.
 */
export function DuelGameScreen({ duelId, onExit }: { duelId: string; onExit: () => void }) {
  const { colors } = useTheme();
  const [duel, setDuel] = useState<DuelState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      setDuel(await loadDuel(duelId));
    } catch (err) {
      setError(messageFor(err instanceof ApiError ? err.code : 'network'));
    }
  }, [duelId]);

  useEffect(() => {
    load();
  }, [load]);

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

  if (error) return <StatusScreen message={error} onRetry={load} />;
  if (!duel) return <StatusScreen loading />;

  const done = duel.round === null;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.content}>
          <View style={styles.head}>
            <Pressable onPress={onExit} hitSlop={10}>
              <Text style={[styles.back, { color: colors.text }]}>‹ Duels</Text>
            </Pressable>
            <Text style={[styles.vs, { color: colors.textMuted }]}>VS {duel.opponent.toUpperCase()}</Text>
          </View>

          {/* Rounds so far. The opponent's column stays blank until the duel is
              settled, so nobody plays against a running commentary. */}
          <View style={styles.scoreRow}>
            {[1, 2, 3].map((r) => {
              const mine = duel.mine.find((m) => m.round === r);
              const theirs = duel.theirs.find((t) => t.round === r);
              const label = (row?: { status: string; attemptsUsed: number }) =>
                !row || row.status === 'playing' ? '–' : row.status === 'won' ? `${row.attemptsUsed}` : '✕';
              return (
                <View
                  key={r}
                  style={[styles.scoreCell, { borderColor: colors.border, backgroundColor: colors.surface }]}
                >
                  <Text style={[styles.scoreRound, { color: colors.textMuted }]}>R{r}</Text>
                  <Text style={[styles.scoreMine, { color: colors.text }]}>{label(mine)}</Text>
                  <Text style={[styles.scoreTheirs, { color: colors.textMuted }]}>
                    {duel.status === 'complete' ? label(theirs) : '·'}
                  </Text>
                </View>
              );
            })}
          </View>

          {done ? (
            <View style={styles.result}>
              <Text style={[styles.resultTitle, { color: colors.text }]}>
                {duel.status !== 'complete'
                  ? 'Waiting for them'
                  : duel.outcome === 'won'
                    ? 'You won'
                    : duel.outcome === 'lost'
                      ? 'You lost'
                      : 'Drawn'}
              </Text>
              <Text style={[styles.resultBody, { color: colors.textMuted }]}>
                {duel.status !== 'complete'
                  ? `${duel.opponent} hasn't finished yet. The result appears once they do.`
                  : 'Fewer guesses takes the round. Your numbers are above, theirs beneath.'}
              </Text>
            </View>
          ) : (
            <>
              <ClueCard
                clue1={duel.round!.clue1}
                clue2={duel.round!.clue2}
                clue2Unlocked={!!duel.round!.clue2}
              />

              <NumberWheels disabled={busy} onSubmit={submit} />

              <View style={styles.boardWrap}>
                <GuessBoard
                  guesses={duel.round!.guesses}
                  attemptsAllowed={duel.round!.attemptsAllowed}
                />
              </View>
            </>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  flex: { flex: 1 },
  content: { flex: 1, paddingHorizontal: 20, paddingTop: 6, gap: 10 },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  back: { fontSize: 15, fontFamily: fonts.bold },
  vs: { fontSize: 10, fontFamily: fonts.bold, letterSpacing: 1.3 },
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

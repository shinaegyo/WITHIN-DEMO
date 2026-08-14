import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { PlayerCardModal } from '../components/PlayerCard';
import { StatusScreen } from '../components/StatusScreen';
import {
  ApiError,
  RankedState,
  findRankedMatch,
  leaveRankedQueue,
  loadRanked,
  messageFor,
} from '../lib/api';
import { fonts } from '../theme/fonts';
import { useTheme } from '../theme/ThemeContext';
import { playTap } from '../utils/sound';

/**
 * Ranked.
 *
 * The match itself is a duel and is played on the duel screen — this is the
 * front door: your rating, who holds the crown, and one button to get a game.
 *
 * There is no live queue because there is never a crowd. Joining means willing,
 * not present: you wait until somebody else asks, which with nine players is a
 * matter of hours rather than seconds.
 */
export function RankedScreen({ onPlay }: { onPlay: (duelId: string) => void }) {
  const { colors } = useTheme();
  const [state, setState] = useState<RankedState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [looking, setLooking] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setState(await loadRanked());
    } catch (err) {
      setError(messageFor(err instanceof ApiError ? err.code : 'network'));
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const find = async () => {
    playTap();
    if (busy) return;
    setBusy(true);
    setNote(null);
    try {
      const res = await findRankedMatch();
      if (res.status === 'matched' && res.duelId) {
        onPlay(res.duelId);
        return;
      }
      setNote('Waiting for an opponent. You will find the match here when someone joins.');
      await load();
    } catch (err) {
      setNote(messageFor(err instanceof ApiError ? err.code : 'network'));
    } finally {
      setBusy(false);
    }
  };

  const leave = async () => {
    playTap();
    if (busy) return;
    setBusy(true);
    try {
      await leaveRankedQueue();
      setNote(null);
      await load();
    } finally {
      setBusy(false);
    }
  };

  if (error) return <StatusScreen message={error} onRetry={load} />;
  if (!state) return <StatusScreen loading />;

  const record = `${state.won}W ${state.lost}L${state.drawn > 0 ? ` ${state.drawn}D` : ''}`;

  return (
    <ScrollView
      style={[styles.wrap, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
    >
      <View style={styles.headRow}>
        <View>
          <Text style={[styles.rating, { color: colors.text }]}>{state.rating}</Text>
          <Text style={[styles.ratingLabel, { color: colors.textMuted }]}>
            {/* A bare "1000" reads as a score somebody earned. Until a match
                has been played it is a starting line, and the line below says
                so rather than leaving the number to explain itself. */}
            {state.played === 0
              ? 'NO MATCHES YET'
              : state.placing
                ? `PLACING · ${5 - state.played} TO GO`
                : `#${state.rank} OF ${state.of} · ${record}`}
          </Text>
        </View>
        {state.iHoldBelt && (
          <View style={[styles.belt, { borderColor: colors.accent }]}>
            <Text style={[styles.beltText, { color: colors.accent }]}>THE CROWN</Text>
          </View>
        )}
      </View>

      {/* The crown is the only thing here that can be taken from a person, so
          it says who has it rather than sitting in a rules page. */}
      <Text style={[styles.beltLine, { color: colors.textMuted }]}>
        {state.iHoldBelt
          ? 'You hold the crown. It goes to the next person who beats you in ranked.'
          : state.beltHolder
            ? `${state.beltHolder} holds the crown. Beat them in ranked and it is yours.`
            : 'Nobody holds the crown. The next ranked winner takes it.'}
      </Text>

      {state.match ? (
        <Pressable
          onPress={() => onPlay(state.match!.id)}
          style={({ pressed }) => [
            styles.primary,
            { backgroundColor: colors.text, opacity: pressed ? 0.85 : 1 },
          ]}
        >
          <Text style={[styles.primaryText, { color: colors.background }]}>
            Your match vs {state.match.opponent} ›
          </Text>
        </Pressable>
      ) : state.queued ? (
        <>
          <View style={[styles.queued, { borderColor: colors.border }]}>
            <Text style={[styles.queuedText, { color: colors.text }]}>Looking for an opponent</Text>
            <Text style={[styles.queuedSub, { color: colors.textMuted }]}>
              You are matched with whoever is closest in rating. Nobody has to be online — the match
              starts the moment someone else asks for one.
            </Text>
          </View>
          <Pressable onPress={leave} style={styles.cancel}>
            <Text style={[styles.cancelText, { color: colors.textMuted }]}>Stop looking</Text>
          </Pressable>
        </>
      ) : (
        <Pressable
          onPress={find}
          disabled={busy}
          style={({ pressed }) => [
            styles.primary,
            { backgroundColor: colors.text, opacity: pressed || busy ? 0.85 : 1 },
          ]}
        >
          <Text style={[styles.primaryText, { color: colors.background }]}>Find a match</Text>
        </Pressable>
      )}

      {note && <Text style={[styles.note, { color: colors.textMuted }]}>{note}</Text>}

      <Text style={[styles.caption, { color: colors.textMuted }]}>
        Everyone starts at 1000. A ranked match is a duel — you pick their number, they pick yours,
        three rounds and a decider if it is level. Winning takes rating off them and adds it to you,
        so beating someone above you is worth far more than beating someone below, and there is
        nothing to gain by beating the same person over and over.
      </Text>

      {state.board.length > 0 && (
        <>
          <Text style={[styles.heading, { color: colors.textMuted }]}>LADDER</Text>
          {state.board.map((e) => (
            <Pressable
              key={`${e.rank}-${e.name}`}
              onPress={() => setLooking(e.name)}
              style={({ pressed }) => [
                styles.row,
                {
                  backgroundColor: e.isMe ? colors.surfaceAlt : colors.surface,
                  borderColor: e.isMe ? colors.accent : colors.border,
                  opacity: pressed ? 0.7 : 1,
                },
              ]}
            >
              <Text style={[styles.rank, { color: colors.textMuted }]}>{e.rank}</Text>
              <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>
                {e.name}
                {e.isMe ? '  (you)' : ''}
              </Text>
              {e.hasBelt && (
                <Text style={[styles.rowBelt, { color: colors.accent }]}>CROWN</Text>
              )}
              <Text style={[styles.record, { color: colors.textMuted }]}>
                {e.won}–{e.lost}
              </Text>
              <Text style={[styles.score, { color: colors.text }]}>{e.rating}</Text>
            </Pressable>
          ))}
        </>
      )}

      <PlayerCardModal username={looking} onClose={() => setLooking(null)} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  content: { padding: 20, paddingBottom: 40 },
  headRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  rating: { fontSize: 40, fontFamily: fonts.extraBold, letterSpacing: -1 },
  ratingLabel: { fontSize: 9.5, fontFamily: fonts.bold, letterSpacing: 1.3, marginTop: -2 },
  belt: { borderWidth: 1.5, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 5 },
  beltText: { fontSize: 10, fontFamily: fonts.extraBold, letterSpacing: 1.2 },
  beltLine: { fontSize: 12.5, fontFamily: fonts.medium, lineHeight: 18, marginTop: 12 },
  primary: { borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginTop: 16 },
  primaryText: { fontSize: 15, fontFamily: fonts.extraBold },
  queued: { borderWidth: 1, borderRadius: 14, padding: 16, marginTop: 16 },
  queuedText: { fontSize: 15, fontFamily: fonts.extraBold },
  queuedSub: { fontSize: 12, fontFamily: fonts.medium, lineHeight: 18, marginTop: 4 },
  cancel: { alignSelf: 'center', marginTop: 10 },
  cancelText: { fontSize: 12.5, fontFamily: fonts.bold },
  note: { fontSize: 12, fontFamily: fonts.medium, lineHeight: 18, marginTop: 10 },
  caption: { fontSize: 12, fontFamily: fonts.medium, lineHeight: 18, marginTop: 18 },
  heading: { fontSize: 9.5, fontFamily: fonts.bold, letterSpacing: 1.4, marginTop: 24, marginBottom: 8 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 11,
    paddingHorizontal: 14,
    marginBottom: 8,
    gap: 10,
  },
  rank: { width: 18, fontSize: 12, fontFamily: fonts.extraBold },
  name: { flex: 1, fontSize: 14.5, fontFamily: fonts.bold },
  rowBelt: { fontSize: 9, fontFamily: fonts.extraBold, letterSpacing: 1 },
  record: { fontSize: 11.5, fontFamily: fonts.medium },
  score: { fontSize: 15, fontFamily: fonts.extraBold },
});

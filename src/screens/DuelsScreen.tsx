import React, { useCallback, useEffect, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { PlayerCardModal } from '../components/PlayerCard';
import { StatusScreen } from '../components/StatusScreen';
import {
  ApiError,
  DuelSummary,
  challengeFriend,
  loadDuels,
  messageFor,
  respondToDuel,
} from '../lib/api';
import { feedbackColors } from '../theme/colors';
import { fonts } from '../theme/fonts';
import { useTheme } from '../theme/ThemeContext';

/**
 * Duels are asynchronous, so this screen is mostly about whose turn it is.
 * Three states matter: waiting on you, waiting on them, and settled.
 */
export function DuelsScreen({ onPlay }: { onPlay: (duelId: string) => void }) {
  const { colors } = useTheme();
  const [duels, setDuels] = useState<DuelSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [looking, setLooking] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setDuels(await loadDuels());
    } catch (err) {
      setError(messageFor(err instanceof ApiError ? err.code : 'network'));
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const run = async (action: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    try {
      await action();
      await load();
    } catch (err) {
      setNote(messageFor(err instanceof ApiError ? err.code : 'network'));
    } finally {
      setBusy(false);
    }
  };

  const challenge = () =>
    run(async () => {
      const target = name.trim();
      if (!target) return;
      await challengeFriend(target);
      setName('');
      setNote(`Challenge sent to ${target}.`);
    });

  if (error) return <StatusScreen message={error} onRetry={load} />;
  if (!duels) return <StatusScreen loading />;

  const waitingOnYou = duels.filter((d) => d.status === 'pending' && !d.iChallenged);
  const yourTurn = duels.filter((d) => d.status === 'active' && d.myDone < 3);
  const waitingOnThem = duels.filter(
    (d) => (d.status === 'active' && d.myDone === 3) || (d.status === 'pending' && d.iChallenged),
  );
  const settled = duels.filter((d) => d.status === 'complete');

  const Row = ({ d, children }: { d: DuelSummary; children?: React.ReactNode }) => (
    <View style={[styles.row, { borderColor: colors.border, backgroundColor: colors.surface }]}>
      <Pressable style={styles.rowMain} onPress={() => setLooking(d.opponent)}>
        <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>
          {d.opponent}
        </Text>
        {/* The head-to-head, not progress through this duel — the heading
            above already says whose turn it is. */}
        <Text style={[styles.meta, { color: colors.textMuted }]}>
          {d.streak > 0
            ? `${d.streak} win${d.streak === 1 ? '' : 's'} in a row`
            : d.streak < 0
              ? `${-d.streak} loss${d.streak === -1 ? '' : 'es'} in a row`
              : 'No run either way'}
        </Text>
      </Pressable>
      {children}
    </View>
  );

  const Action = ({ label, onPress, tone }: { label: string; onPress: () => void; tone?: 'good' }) => (
    <Pressable onPress={onPress} disabled={busy} style={({ pressed }) => [{ opacity: pressed ? 0.6 : 1 }]}>
      <Text style={[styles.action, { color: tone === 'good' ? feedbackColors.correct : colors.textMuted }]}>
        {label}
      </Text>
    </Pressable>
  );

  return (
    <ScrollView
      style={[styles.wrap, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={[styles.caption, { color: colors.textMuted }]}>
        Three numbers, seven then six then five attempts, same for both of you. A round goes to
        whoever needed fewer guesses, and the next opens once you have both played it. Level after
        three and a fourth number decides it.
      </Text>

      <View style={[styles.addRow, { borderColor: colors.border, backgroundColor: colors.surface }]}>
        <TextInput
          style={[
            styles.input,
            { color: colors.text },
            Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : null,
          ]}
          value={name}
          onChangeText={(t) => {
            setName(t.replace(/[^A-Za-z0-9_]/g, ''));
            if (note) setNote(null);
          }}
          placeholder="Challenge a friend"
          placeholderTextColor={colors.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
          maxLength={16}
          onSubmitEditing={challenge}
          returnKeyType="send"
        />
        <Pressable
          onPress={challenge}
          disabled={busy || !name.trim()}
          style={({ pressed }) => [
            styles.addButton,
            { backgroundColor: name.trim() ? colors.text : colors.border, opacity: pressed ? 0.85 : 1 },
          ]}
        >
          <Text style={[styles.addText, { color: name.trim() ? colors.background : colors.textMuted }]}>
            Send
          </Text>
        </Pressable>
      </View>

      {note && <Text style={[styles.note, { color: colors.textMuted }]}>{note}</Text>}

      {waitingOnYou.length > 0 && (
        <>
          <Text style={[styles.heading, { color: colors.textMuted }]}>WAITING ON YOU</Text>
          {waitingOnYou.map((d) => (
            <Row key={d.id} d={d}>
              <View style={styles.rowActions}>
                <Action label="Accept" tone="good" onPress={() => run(async () => { await respondToDuel(d.id, true); })} />
                <Action label="Decline" onPress={() => run(async () => { await respondToDuel(d.id, false); })} />
              </View>
            </Row>
          ))}
        </>
      )}

      {yourTurn.length > 0 && (
        <>
          <Text style={[styles.heading, { color: colors.textMuted }]}>YOUR TURN</Text>
          {yourTurn.map((d) => (
            <Row key={d.id} d={d}>
              <Action label="Play ›" onPress={() => onPlay(d.id)} />
            </Row>
          ))}
        </>
      )}

      {waitingOnThem.length > 0 && (
        <>
          <Text style={[styles.heading, { color: colors.textMuted }]}>WAITING ON THEM</Text>
          {waitingOnThem.map((d) => (
            <Row key={d.id} d={d} />
          ))}
        </>
      )}

      {settled.length > 0 && (
        <>
          <Text style={[styles.heading, { color: colors.textMuted }]}>FINISHED</Text>
          {settled.map((d) => (
            <Row key={d.id} d={d}>
              <Action label="See ›" onPress={() => onPlay(d.id)} />
            </Row>
          ))}
        </>
      )}

      {duels.length === 0 && (
        <Text style={[styles.empty, { color: colors.textMuted }]}>
          No duels yet. Challenge someone you're already friends with.
        </Text>
      )}
      <PlayerCardModal
        username={looking}
        onClose={() => {
          setLooking(null);
          load();
        }}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  content: { padding: 20, paddingBottom: 40 },
  caption: { fontSize: 12.5, fontFamily: fonts.medium, lineHeight: 18, marginBottom: 16 },
  addRow: { flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderRadius: 14, padding: 5 },
  input: {
    flex: 1,
    minWidth: 0,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    fontFamily: fonts.bold,
  },
  addButton: {
    alignSelf: 'stretch',
    borderRadius: 10,
    paddingHorizontal: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  addText: { fontSize: 14, fontFamily: fonts.extraBold },
  note: { fontSize: 12, fontFamily: fonts.medium, marginTop: 8 },
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
  rowMain: { flex: 1 },
  name: { fontSize: 14.5, fontFamily: fonts.bold },
  meta: { fontSize: 11, fontFamily: fonts.medium, marginTop: 1 },
  rowActions: { flexDirection: 'row', gap: 14 },
  action: { fontSize: 12.5, fontFamily: fonts.bold },
  empty: { fontSize: 13, fontFamily: fonts.medium, lineHeight: 19, marginTop: 24 },
});

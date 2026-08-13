import React, { useCallback, useEffect, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { StatusScreen } from '../components/StatusScreen';
import {
  ApiError,
  FriendsState,
  loadFriends,
  messageFor,
  removeFriend,
  respondToFriendRequest,
  sendFriendRequest,
} from '../lib/api';
import { feedbackColors } from '../theme/colors';
import { fonts } from '../theme/fonts';
import { useTheme } from '../theme/ThemeContext';

/**
 * Friendships are mutual, so this screen has three lists rather than one: who
 * you play with, who is waiting on you, and who you are waiting on. Leaving the
 * last two out would make a sent request look like nothing happened.
 */
export function FriendsScreen({
  username,
  onChanged,
}: {
  username: string;
  onChanged?: () => void;
}) {
  const { colors } = useTheme();
  const [state, setState] = useState<FriendsState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [note, setNote] = useState<string | null>(null);
  const [noteBad, setNoteBad] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      setState(await loadFriends());
    } catch (err) {
      setError(messageFor(err instanceof ApiError ? err.code : 'network'));
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const say = (message: string, bad = false) => {
    setNote(message);
    setNoteBad(bad);
  };

  const run = async (action: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    try {
      await action();
      await load();
      onChanged?.();
    } catch (err) {
      say(messageFor(err instanceof ApiError ? err.code : 'network'), true);
    } finally {
      setBusy(false);
    }
  };

  const add = () =>
    run(async () => {
      const target = name.trim();
      if (!target) return;
      const result = await sendFriendRequest(target);
      setName('');
      if (result === 'requested') say(`Request sent to ${target}.`);
      else if (result === 'accepted') say(`You and ${target} are now friends.`);
      else if (result === 'already_friends') say(`You're already friends with ${target}.`, true);
      else if (result === 'already_requested') say(`You've already asked ${target}.`, true);
    });

  if (error) return <StatusScreen message={error} onRetry={load} />;
  if (!state) return <StatusScreen loading />;

  const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <View style={[styles.row, { borderColor: colors.border, backgroundColor: colors.surface }]}>
      <Text style={[styles.rowName, { color: colors.text }]} numberOfLines={1}>
        {label}
      </Text>
      <View style={styles.rowActions}>{children}</View>
    </View>
  );

  const Action = ({
    label,
    onPress,
    tone,
  }: {
    label: string;
    onPress: () => void;
    tone?: 'good' | 'bad';
  }) => (
    <Pressable onPress={onPress} disabled={busy} style={({ pressed }) => [{ opacity: pressed ? 0.6 : 1 }]}>
      <Text
        style={[
          styles.action,
          {
            color:
              tone === 'good' ? feedbackColors.correct : tone === 'bad' ? colors.danger : colors.textMuted,
          },
        ]}
      >
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
        You play the same three numbers as everyone else, so adding a friend just puts their day
        beside yours. Your name is{' '}
        <Text style={{ color: colors.text, fontFamily: fonts.extraBold }}>{username}</Text>.
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
          placeholder="Add by username"
          placeholderTextColor={colors.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
          maxLength={16}
          onSubmitEditing={add}
          returnKeyType="send"
        />
        <Pressable
          onPress={add}
          disabled={busy || !name.trim()}
          style={({ pressed }) => [
            styles.addButton,
            {
              backgroundColor: name.trim() ? colors.text : colors.border,
              opacity: pressed ? 0.85 : 1,
            },
          ]}
        >
          <Text style={[styles.addText, { color: name.trim() ? colors.background : colors.textMuted }]}>
            Add
          </Text>
        </Pressable>
      </View>

      {note && (
        <Text style={[styles.note, { color: noteBad ? colors.textMuted : feedbackColors.correct }]}>
          {note}
        </Text>
      )}

      {state.incoming.length > 0 && (
        <>
          <Text style={[styles.heading, { color: colors.textMuted }]}>WAITING ON YOU</Text>
          {state.incoming.map((n) => (
            <Row key={n} label={n}>
              <Action label="Accept" tone="good" onPress={() => run(async () => { await respondToFriendRequest(n, true); })} />
              <Action label="Decline" onPress={() => run(async () => { await respondToFriendRequest(n, false); })} />
            </Row>
          ))}
        </>
      )}

      <Text style={[styles.heading, { color: colors.textMuted }]}>
        FRIENDS{state.friends.length > 0 ? ` · ${state.friends.length}` : ''}
      </Text>
      {state.friends.length === 0 ? (
        <Text style={[styles.empty, { color: colors.textMuted }]}>
          Nobody yet. Add someone by the username they picked and they'll appear on your home screen
          once they accept.
        </Text>
      ) : (
        state.friends.map((n) => (
          <Row key={n} label={n}>
            <Action label="Remove" onPress={() => run(async () => { await removeFriend(n); })} />
          </Row>
        ))
      )}

      {state.outgoing.length > 0 && (
        <>
          <Text style={[styles.heading, { color: colors.textMuted }]}>WAITING ON THEM</Text>
          {state.outgoing.map((n) => (
            <Row key={n} label={n}>
              <Action label="Cancel" onPress={() => run(async () => { await removeFriend(n); })} />
            </Row>
          ))}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  content: { padding: 20, paddingBottom: 40 },
  caption: { fontSize: 13, fontFamily: fonts.medium, lineHeight: 19, marginBottom: 16 },
  addRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderRadius: 14,
    padding: 5,
  },
  input: {
    flex: 1,
    minWidth: 0,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
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
  note: { fontSize: 12.5, fontFamily: fonts.medium, marginTop: 8 },
  heading: {
    fontSize: 9.5,
    fontFamily: fonts.bold,
    letterSpacing: 1.4,
    marginTop: 24,
    marginBottom: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 8,
  },
  rowName: { flex: 1, fontSize: 14.5, fontFamily: fonts.bold },
  rowActions: { flexDirection: 'row', gap: 16 },
  action: { fontSize: 12.5, fontFamily: fonts.bold },
  empty: { fontSize: 13, fontFamily: fonts.medium, lineHeight: 19 },
});

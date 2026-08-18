import React, { useCallback, useEffect, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { Text } from '../components/AppText';
import { Avatar } from '../components/Avatar';
import { PlayerCardModal } from '../components/PlayerCard';
import { LeagueRoster } from '../components/LeagueRoster';
import { PlayerSuggestion } from '../lib/api';
import { StatusScreen } from '../components/StatusScreen';
import {
  ApiError,
  challengeFriend,
  League,
  FriendsState,
  loadFriends,
  messageFor,
  removeFriend,
  suggestPlayers,
  respondToFriendRequest,
  sendFriendRequest,
} from '../lib/api';
import { feedbackColors } from '../theme/colors';
import { useTrack } from '../utils/useTrack';
import { fonts } from '../theme/fonts';
import { useTheme } from '../theme/ThemeContext';
import { playTap } from '../utils/sound';
import { shareInvite } from '../utils/share';

/**
 * Friendships are mutual, so this screen has three lists rather than one: who
 * you play with, who is waiting on you, and who you are waiting on. Leaving the
 * last two out would make a sent request look like nothing happened.
 */
export function FriendsScreen({
  username,
  onChanged,
  onPlay,
}: {
  username: string;
  onChanged?: () => void;
  /** Challenging someone opens the duel rather than sending a message. */
  onPlay: (duelId: string) => void;
}) {
  // The calm track. Outside the games the app is not silent any more - it has
  // its own room rather than the game's.
  useTrack('home');
  const { colors } = useTheme();
  const [state, setState] = useState<FriendsState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [note, setNote] = useState<string | null>(null);
  const [looking, setLooking] = useState<string | null>(null);
  const [leagueRoster, setLeagueRoster] = useState<League | null>(null);
  // Who matches what is being typed. The field took a name and an Add press
  // and said nothing in between, so the only way to find out whether somebody
  // existed - or how they spelled it - was to guess and send a request.
  const [hints, setHints] = useState<PlayerSuggestion[]>([]);
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

  // Presence lapses after two minutes, so who is online has to be re-read or
  // the challenge button ends up pointed at somebody who has gone.
  useEffect(() => {
    const id = setInterval(() => {
      if (!busy) load();
    }, 8000);
    return () => clearInterval(id);
  }, [busy, load]);

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

  // From the first character, like the Rank search. A friends list is short and
  // a username is not a sentence: one letter narrows it as usefully as two, and
  // waiting for a second reads as a field that has stopped working.
  useEffect(() => {
    const q = name.trim();
    if (q.length < 1) {
      setHints([]);
      return;
    }
    let alive = true;
    const id = setTimeout(() => {
      suggestPlayers(q, 'season', false)
        .then((p) => alive && setHints(p))
        .catch(() => alive && setHints([]));
    }, 180);
    return () => {
      alive = false;
      clearTimeout(id);
    };
  }, [name]);

  const add = () =>
    run(async () => {
      const target = name.trim();
      if (!target) return;
      const result = await sendFriendRequest(target);
      setName('');
      setHints([]);
      if (result === 'requested') say(`Request sent to ${target}.`);
      else if (result === 'accepted') say(`You and ${target} are now friends.`);
      else if (result === 'already_friends') say(`You're already friends with ${target}.`, true);
      else if (result === 'already_requested') say(`You've already asked ${target}.`, true);
    });

  if (error) return <StatusScreen message={error} onRetry={load} />;
  if (!state) return <StatusScreen loading />;

  const online = state ? state.friends.filter((f) => f.online) : [];
  const offline = state ? state.friends.filter((f) => !f.online) : [];

  const Row = ({
    label,
    children,
    online,
    avatar,
  }: {
    label: string;
    children?: React.ReactNode;
    online?: boolean;
    avatar?: string | null;
  }) => (
    <View style={[styles.row, { borderColor: colors.border, backgroundColor: colors.surface }]}>
      {/* Only shown when they are around: an empty slot for everyone else
          would read as a status of its own. */}
      {/* label is whose row this is. Passing the signed-in username here put
          your own initial on every friend in the list. */}
      {/* The face opens the card too. Only the name did, which is the half of
          a person nobody taps - an avatar is the obvious target and it sat
          there inert beside a name that worked. The buttons beside it still
          act on their own. */}
      <Pressable onPress={() => setLooking(label)}>
        <Avatar value={avatar} size={30} name={label} />
      </Pressable>
      {online && <View style={[styles.dot, { backgroundColor: feedbackColors.correct }]} />}
      <Pressable style={styles.rowMain} onPress={() => setLooking(label)}>
        <Text style={[styles.rowName, { color: colors.text }]} numberOfLines={1}>
          {label}
        </Text>
      </Pressable>
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
    <Pressable
      onPress={() => {
        playTap();
        onPress();
      }}
      disabled={busy}
      style={({ pressed }) => [{ opacity: pressed ? 0.6 : 1 }]}
    >
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

      {/* A failure said in the quietest ink on the screen is a failure nobody
          reads. Success was green and the thing that went wrong was muted grey
          - dimmer than the body text around it - so a refused challenge looked
          exactly like a button that did nothing. Both states are legible now,
          and the one you need to act on is the louder of the two. */}
      {note && (
        <Text
          style={[
            styles.note,
            { color: noteBad ? feedbackColors.oneAway : feedbackColors.correct },
          ]}
        >
          {note}
        </Text>
      )}

      {/* Tapping a match opens their card rather than filling the field. The
          card already carries Add friend, along with everything you would want
          to check before sending one - and it is the same card every other
          list in the app opens, so a name means the same thing here. */}
      {hints.map((h) => (
        <Pressable
          key={h.userId}
          onPress={() => {
            playTap();
            setName('');
            setHints([]);
            setLooking(h.name);
          }}
          style={({ pressed }) => [
            styles.hintRow,
            { borderColor: colors.border, opacity: pressed ? 0.6 : 1 },
          ]}
        >
          <Avatar value={h.avatar} size={24} name={h.name} />
          <Text style={[styles.hintName, { color: colors.text }]} numberOfLines={1}>
            {h.name}
          </Text>
          {h.score !== null && (
            <Text style={[styles.hintScore, { color: colors.textMuted }]}>{h.score}</Text>
          )}
        </Pressable>
      ))}

      {state.incoming.length > 0 && (
        <>
          <Text style={[styles.heading, { color: colors.textMuted }]}>WAITING ON YOU</Text>
          {state.incoming.map((n) => (
            <Row key={n.name} label={n.name} avatar={n.avatar}>
              <Action label="Accept" tone="good" onPress={() => run(async () => { await respondToFriendRequest(n.name, true); })} />
              <Action label="Decline" onPress={() => run(async () => { await respondToFriendRequest(n.name, false); })} />
            </Row>
          ))}
        </>
      )}

      {/* Online first, and with the only button that matters while they are.
          Duel rounds are three minutes long, so a challenge is worth sending to
          somebody who is here and worth nothing to anybody else. */}
      {online.length > 0 && (
        <>
          <Text style={[styles.heading, { color: feedbackColors.correct }]}>
            ONLINE NOW · {online.length}
          </Text>
          {online.map((f) => (
            <Row key={`on-${f.name}`} label={f.name} avatar={f.avatar} online>
              <Action
                label="Challenge"
                tone="good"
                onPress={() =>
                  run(async () => {
                    // Straight into the duel: a challenge you cannot follow is
                    // a message, and this is meant to be a game starting.
                    const id = await challengeFriend(f.name);
                    if (id) onPlay(id);
                  })
                }
              />
            </Row>
          ))}
        </>
      )}

      <Text style={[styles.heading, { color: colors.textMuted }]}>
        {online.length > 0 ? 'EVERYONE ELSE' : 'FRIENDS'}
        {offline.length > 0 ? ` · ${offline.length}` : ''}
      </Text>
      {state.friends.length === 0 ? (
        <Text style={[styles.empty, { color: colors.textMuted }]}>
          Nobody yet. Add someone by the username they picked and they'll appear on your home screen
          once they accept.
        </Text>
      ) : (
        offline.map((f) => (
          <Row key={f.name} label={f.name} avatar={f.avatar} online={f.online}>
            <Action label="Remove" onPress={() => run(async () => { await removeFriend(f.name); })} />
          </Row>
        ))
      )}

      {state.outgoing.length > 0 && (
        <>
          <Text style={[styles.heading, { color: colors.textMuted }]}>WAITING ON THEM</Text>
          {state.outgoing.map((n) => (
            <Row key={n.name} label={n.name} avatar={n.avatar}>
              <Action label="Cancel" onPress={() => run(async () => { await removeFriend(n.name); })} />
            </Row>
          ))}
        </>
      )}
      <PlayerCardModal
        username={looking}
        onClose={() => {
          setLooking(null);
          load();
        }}
        onOpenLeague={(l) => {
          setLooking(null);
          setLeagueRoster(l);
        }}
      />

      <LeagueRoster league={leagueRoster} onClose={() => setLeagueRoster(null)} />
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
  hintRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 9, paddingHorizontal: 10,
    borderBottomWidth: 1, borderRadius: 8,
  },
  hintName: { flex: 1, fontSize: 14, fontFamily: fonts.semiBold },
  hintScore: { fontSize: 12.5, fontFamily: fonts.medium },
  invite: {
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 11,
    alignItems: 'center',
    marginTop: 12,
  },
  inviteText: { fontSize: 14, fontFamily: fonts.extraBold },
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
    // The old avatars were characters on transparent ground with their own
    // margin of empty pixels. A filled disc has none, so the name sat against
    // it the moment they became letters.
    gap: 10,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 8,
  },
  dot: {
    marginRight: 4, width: 8, height: 8, borderRadius: 4 },
  rowMain: { flex: 1, minWidth: 0 },
  rowName: { fontSize: 14.5, fontFamily: fonts.bold },
  rowActions: { flexDirection: 'row', gap: 16 },
  action: { fontSize: 12.5, fontFamily: fonts.bold },
  empty: { fontSize: 13, fontFamily: fonts.medium, lineHeight: 19 },
});

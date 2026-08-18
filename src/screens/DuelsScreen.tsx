import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '../components/AppText';
import { Avatar } from '../components/Avatar';
import { PlayerCardModal } from '../components/PlayerCard';
import { LeagueRoster } from '../components/LeagueRoster';
import { ScreenTitle } from '../components/ScreenTitle';
import { StatusScreen } from '../components/StatusScreen';
import { PagedRules, RulesButton } from '../components/PagedRules';
import { duelRules } from '../components/modeRules';
import {
  ApiError,
  League,
  DuelSummary,
  Friend,
  challengeFriend,
  findStrangerDuel,
  inviteToDuel,
  leaveDuelQueue,
  loadDuels,
  loadFriends,
  loadPlayersOnline,
  messageFor,
  respondToDuel,
} from '../lib/api';
import { feedbackColors } from '../theme/colors';
import { useTrack } from '../utils/useTrack';
import { fonts } from '../theme/fonts';
import { useTheme } from '../theme/ThemeContext';
import { playTap } from '../utils/sound';

/**
 * Duels are asynchronous, so this screen is mostly about whose turn it is -
 * and, before that, whether there is anybody to play at all.
 *
 * Which is why the friends list is the screen rather than a username field
 * underneath a wall of rules. A duel needs the other person awake, so a name
 * you have to remember and type could only ever tell you "not online" after
 * the fact; a list with a dot beside each name answers it on sight. The rules
 * fold away: they are worth reading once, and they were costing five lines
 * above every single visit.
 */
export function DuelsScreen({
  onPlay,
  onBack,
}: {
  onPlay: (duelId: string) => void;
  onBack: () => void;
}) {
  // Reached from the Games tab, which is the game section, so the track
  // carries through rather than cutting out on the way to a duel. It is a
  // lobby, but it is a lobby inside a mode.
  useTrack('game');
  const { colors } = useTheme();
  const [all, setAll] = useState<DuelSummary[] | null>(null);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [online, setOnline] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [looking, setLooking] = useState<string | null>(null);
  const [leagueRoster, setLeagueRoster] = useState<League | null>(null);
  const [waiting, setWaiting] = useState<{ online: number } | null>(null);
  const [rules, setRules] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      setAll(await loadDuels());
    } catch (err) {
      setError(messageFor(err instanceof ApiError ? err.code : 'network'));
    }
    // Presence moves on its own and neither of these should be able to take the
    // screen down with them.
    loadFriends()
      .then((f) => setFriends(f.friends))
      .catch(() => {});
    loadPlayersOnline()
      .then(setOnline)
      .catch(() => {});
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // A challenge arrives from somebody else's phone, so the list has to look for
  // it rather than wait to be opened again.
  useEffect(() => {
    const id = setInterval(() => {
      if (!busy) load();
    }, 5000);
    return () => clearInterval(id);
  }, [busy, load]);

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

  const challenge = (target: string) =>
    run(async () => {
      await challengeFriend(target);
      setNote(`Challenge sent to ${target}.`);
    });

  // The rulebook takes the whole screen rather than sitting under it.
  if (rules) return <PagedRules title="How Duels works" onBack={() => setRules(false)} sections={duelRules()} />;

  if (error) return <StatusScreen message={error} onRetry={load} />;
  if (!all) return <StatusScreen loading />;

  // Ranked matches have their own screen; this list is friends only.
  const duels = all.filter((d) => !d.ranked);

  const waitingOnYou = duels.filter((d) => d.status === 'pending' && !d.iChallenged);
  // A duel wants either a number for the next round or a round played. Anything
  // else active is waiting on them.
  const yourTurn = duels.filter((d) => d.status === 'active' && (d.needsNumber || d.needsPlay));
  const waitingOnThem = duels.filter(
    (d) =>
      (d.status === 'active' && !d.needsNumber && !d.needsPlay) ||
      (d.status === 'pending' && d.iChallenged),
  );
  // The three most recent. Every duel you have ever played is a history, not a
  // list of things to do, and it pushed the live ones off the screen.
  const settled = duels.filter((d) => d.status === 'complete').slice(0, 3);

  const Row = ({ d, children }: { d: DuelSummary; children?: React.ReactNode }) => (
    <View style={[styles.row, { borderColor: colors.border, backgroundColor: colors.surface }]}>
      <Pressable style={styles.rowMain} onPress={() => setLooking(d.opponent)}>
        <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>
          {d.opponent}
        </Text>
        {/* The head-to-head, and only when there is one: "No run either way"
            announced the absence of a statistic nobody had asked for, and one
            of anything is a result rather than a run. */}
        {d.streak !== 0 && (
          <Text style={[styles.meta, { color: colors.textMuted }]}>
            {d.streak === 1
              ? '1 win'
              : d.streak === -1
                ? '1 loss'
                : d.streak > 1
                  ? `${d.streak} wins in a row`
                  : `${-d.streak} losses in a row`}
          </Text>
        )}
      </Pressable>
      {children}
    </View>
  );

  /**
   * The one you are meant to press, and the ones beside it.
   *
   * Every action here was a bare word in text: no fill, no border, no padding.
   * Play - the thing a duel exists for - passed no tone at all and so came out
   * in the muted grey used for captions, quieter than the opponent's name
   * above it. A game waiting on you looked like a row of labels.
   *
   * `primary` fills. It is the only filled thing in its row, so there is never
   * a question about which one continues and which one walks away, and the
   * tap target is a button's rather than a word's.
   */
  const Action = ({
    label,
    onPress,
    tone,
    primary,
  }: {
    label: string;
    onPress: () => void;
    tone?: 'good' | 'warn';
    primary?: boolean;
  }) => (
    <Pressable
      onPress={() => {
        playTap();
        onPress();
      }}
      disabled={busy}
      style={({ pressed }) => [
        primary && [styles.primary, { backgroundColor: colors.text }],
        { opacity: pressed ? 0.6 : 1 },
      ]}
    >
      <Text
        style={[
          styles.action,
          primary && styles.primaryText,
          {
            color: primary
              ? colors.background
              : tone === 'good'
                ? feedbackColors.correct
                : tone === 'warn'
                  ? feedbackColors.oneAway
                  : colors.textMuted,
          },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );

  // Anyone with a duel already open belongs in the sections above, not in a
  // list of people to challenge - the same name twice is two different answers
  // to "what do I do next".
  const engaged = new Set(
    duels.filter((d) => d.status === 'pending' || d.status === 'active').map((d) => d.opponent),
  );
  const challengeable = friends
    .filter((f) => !engaged.has(f.name))
    .sort((a, b) => (a.online === b.online ? a.name.localeCompare(b.name) : a.online ? -1 : 1));

  return (
    <View style={[styles.wrap, { backgroundColor: colors.background }]}>
      <ScreenTitle
        title="Duels"
        subtitle="You pick the number they hunt and they pick yours. Both of you have to be here."
        onBack={onBack}
      />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {note && <Text style={[styles.note, { color: colors.textMuted }]}>{note}</Text>}

        {waitingOnYou.length > 0 && (
        <>
          {/* Somebody is waiting on this one, which is the only heading here
              that is about another person rather than about a list. It is
              coloured accordingly. */}
          <Text style={[styles.heading, { color: colors.accent }]}>WAITING ON YOU</Text>
          {waitingOnYou.map((d) => (
            <Row key={d.id} d={d}>
              <View style={styles.rowActions}>
                <Action label="Accept" primary onPress={() => run(async () => { await respondToDuel(d.id, true); })} />
                <Action label="Decline" onPress={() => run(async () => { await respondToDuel(d.id, false); })} />
              </View>
            </Row>
          ))}
        </>
      )}

      {yourTurn.length > 0 && (
        <>
          <Text style={[styles.heading, { color: colors.textMuted }]}>YOUR TURN</Text>
          {/* One way in. Leaving belongs inside the duel, where the question
              can be asked properly, not beside a duel nobody has entered. */}
          {yourTurn.map((d) => (
            <Row key={d.id} d={d}>
              <Action label="Play ›" primary onPress={() => onPlay(d.id)} />
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

        <Text style={[styles.heading, { color: colors.textMuted }]}>FRIENDS</Text>

        {challengeable.length === 0 ? (
          <Text style={[styles.empty, { color: colors.textMuted }]}>
            {friends.length === 0
              ? 'Add someone on the Friends tab and they show up here to challenge.'
              : 'Everyone you know already has a duel going with you.'}
          </Text>
        ) : (
          challengeable.map((f) => (
            <View
              key={f.name}
              style={[styles.row, { borderColor: colors.border, backgroundColor: colors.surface }]}
            >
              <Pressable style={styles.friendMain} onPress={() => setLooking(f.name)}>
                <Avatar value={f.avatar} size={34} name={f.name} />
                <View style={styles.friendText}>
                  <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>
                    {f.name}
                  </Text>
                  <View style={styles.presence}>
                    <View
                      style={[
                        styles.dot,
                        { backgroundColor: f.online ? feedbackColors.correct : colors.border },
                      ]}
                    />
                    <Text style={[styles.meta, { color: colors.textMuted }]}>
                      {f.online ? 'Online now' : 'Not here'}
                    </Text>
                  </View>
                </View>
              </Pressable>

              {/* Offline is a state, not an error message after the fact: a
                  duel needs them awake, so the button says so before it is
                  pressed rather than failing once it has been. */}
              <Pressable
                onPress={() => {
                  playTap();
                  challenge(f.name);
                }}
                disabled={busy || !f.online}
                style={({ pressed }) => [
                  styles.challenge,
                  {
                    backgroundColor: f.online ? colors.text : 'transparent',
                    borderColor: colors.border,
                    borderWidth: f.online ? 0 : 1,
                    opacity: pressed ? 0.85 : 1,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.challengeText,
                    { color: f.online ? colors.background : colors.textMuted },
                  ]}
                >
                  {f.online ? 'Challenge' : 'Offline'}
                </Text>
              </Pressable>
            </View>
          ))
        )}
        {/* Rules last, as on every other mode screen: read once, scrolled past
            every time after. */}
        <RulesButton onPress={() => setRules(true)} />
      </ScrollView>

      {/* The way in sits under everything rather than on top of it: the list
          answers who, this answers what if nobody. */}
      <View style={[styles.foot, { borderColor: colors.border, backgroundColor: colors.background }]}>
        {waiting ? (
          // Two centred lines rather than one wrapping paragraph with a link
          // trailing off the end of it: the state, then the way out of it.
          <View style={styles.waiting}>
            <Text style={[styles.waitingLine, { color: colors.text }]} numberOfLines={1}>
              {waiting.online === 0 ? 'Nobody else is here' : 'Waiting for someone to join…'}
            </Text>
            <Pressable
              onPress={() => {
                playTap();
                run(async () => {
                  await leaveDuelQueue();
                  setWaiting(null);
                });
              }}
              hitSlop={8}
            >
              <Text style={[styles.stopWaiting, { color: colors.textMuted }]}>Stop waiting</Text>
            </Pressable>
          </View>
        ) : (
          <Pressable
            onPress={() => {
              playTap();
              run(async () => {
                const res = await findStrangerDuel();
                if (res.status === 'matched') {
                  setWaiting(null);
                  onPlay(res.duelId);
                } else {
                  setWaiting({ online: res.online });
                  // Nobody is here, so ask for somebody. The queue row outlives
                  // this screen, which is what makes an invitation worth
                  // sending - whoever answers can still find them.
                  inviteToDuel();
                }
              });
            }}
            style={({ pressed }) => [
              styles.stranger,
              { backgroundColor: colors.text, opacity: pressed ? 0.85 : 1 },
            ]}
          >
            <Text style={[styles.strangerText, { color: colors.background }]}>Play a stranger</Text>
            <Text style={[styles.strangerSub, { color: colors.background }]}>
              {online === null
                ? ' '
                : online === 0
                  ? 'Nobody else is here'
                  : `${online} ${online === 1 ? 'player' : 'players'} online`}
            </Text>
          </Pressable>
        )}
      </View>

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
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  content: { padding: 20, paddingBottom: 24 },
  // Sitting at the foot of the list, so it needs air above it: pressed against
  // the line before it, the heading read as part of that sentence.
  rulesHead: { fontSize: 15, fontFamily: fonts.extraBold, marginTop: 26, marginBottom: 4 },
  caption: { fontSize: 12.5, fontFamily: fonts.medium, lineHeight: 19, marginTop: 2 },
  foot: { borderTopWidth: 1, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 16 },
  waiting: { alignItems: 'center', gap: 6, paddingVertical: 8 },
  waitingLine: { fontSize: 14, fontFamily: fonts.bold, textAlign: 'center' },
  stopWaiting: {
    fontSize: 12,
    fontFamily: fonts.bold,
    textDecorationLine: 'underline',
    textAlign: 'center',
  },
  stranger: { borderRadius: 16, paddingVertical: 13, alignItems: 'center' },
  strangerText: { fontSize: 16, fontFamily: fonts.extraBold },
  strangerSub: { fontSize: 10.5, fontFamily: fonts.bold, letterSpacing: 0.6, opacity: 0.6, marginTop: 2 },
  friendMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  friendText: { flex: 1, minWidth: 0 },
  presence: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  challenge: { borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 },
  challengeText: { fontSize: 12.5, fontFamily: fonts.extraBold },
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
  primary: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999 },
  primaryText: { fontSize: 13 },
  empty: { fontSize: 13, fontFamily: fonts.medium, lineHeight: 19, marginTop: 24 },
});

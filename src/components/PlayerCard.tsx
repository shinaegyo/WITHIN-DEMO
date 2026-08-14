import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import {
  ApiError,
  PlayerCard as Card,
  challengeFriend,
  loadPlayerCard,
  messageFor,
  respondToFriendRequest,
  sendFriendRequest,
} from '../lib/api';
import { feedbackColors } from '../theme/colors';
import { fonts } from '../theme/fonts';
import { useTheme } from '../theme/ThemeContext';
import { formatRelative } from '../utils/relativeTime';

/**
 * Who somebody is, from a name on a board.
 *
 * Every name in the app used to be a dead end - you could see that someone beat
 * you and nothing else. Two numbers answer most of the curiosity: what they
 * have scored in total and how long they have kept a streak going. The rest is
 * context for those two, and the actions are here because this is the moment
 * you actually want them.
 */
export function PlayerCardModal({
  username,
  onClose,
  onChallenged,
}: {
  /** Null keeps the modal shut. */
  username: string | null;
  onClose: () => void;
  /** Duel started, so the caller can send the player to it. */
  onChallenged?: () => void;
}) {
  const { colors } = useTheme();
  const [card, setCard] = useState<Card | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!username) return;
    setError(null);
    setCard(null);
    setNote(null);
    try {
      setCard(await loadPlayerCard(username));
    } catch (err) {
      setError(messageFor(err instanceof ApiError ? err.code : 'network'));
    }
  }, [username]);

  useEffect(() => {
    load();
  }, [load]);

  const act = async (action: () => Promise<void>, done: string) => {
    if (busy) return;
    setBusy(true);
    try {
      await action();
      setNote(done);
      await load();
    } catch (err) {
      setNote(messageFor(err instanceof ApiError ? err.code : 'network'));
    } finally {
      setBusy(false);
    }
  };

  const Stat = ({ label, value }: { label: string; value: string }) => (
    <View style={styles.stat}>
      <Text style={[styles.statValue, { color: colors.text }]}>{value}</Text>
      <Text style={[styles.statLabel, { color: colors.textMuted }]}>{label}</Text>
    </View>
  );

  const Action = ({ label, onPress }: { label: string; onPress: () => void }) => (
    <Pressable
      onPress={onPress}
      disabled={busy}
      style={({ pressed }) => [
        styles.action,
        { backgroundColor: colors.text, opacity: pressed || busy ? 0.75 : 1 },
      ]}
    >
      <Text style={[styles.actionText, { color: colors.background }]}>{label}</Text>
    </Pressable>
  );

  return (
    <Modal visible={!!username} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        {/* Swallows taps inside the sheet, so only the backdrop closes it. */}
        <Pressable
          style={[styles.sheet, { backgroundColor: colors.background, borderColor: colors.border }]}
          onPress={() => {}}
        >
          {error ? (
            <Text style={[styles.error, { color: colors.textMuted }]}>{error}</Text>
          ) : !card ? (
            <ActivityIndicator color={colors.textMuted} />
          ) : (
            <>
              <View style={styles.nameRow}>
                {card.online && (
                  <View style={[styles.dot, { backgroundColor: feedbackColors.correct }]} />
                )}
                <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>
                  {card.name}
                </Text>
              </View>
              <Text style={[styles.sub, { color: colors.textMuted }]}>
                {card.daysPlayed === 0
                  ? 'Has not finished a day yet'
                  : `#${card.rank} of ${card.of} all time · last played ${formatRelative(card.lastPlayedAt)}`}
              </Text>

              <View style={styles.stats}>
                <Stat label="POINTS" value={`${card.points}`} />
                <Stat label="STREAK" value={`${card.streak}`} />
                <Stat label="BEST" value={`${card.bestStreak}`} />
              </View>

              <View style={[styles.rows, { borderColor: colors.border }]}>
                <Row label="Days played" value={`${card.daysPlayed}`} />
                {/* Only ever a finished day - a day in progress stays theirs. */}
                {card.todayScore !== null && <Row label="Today" value={`${card.todayScore}`} />}
                {card.impossible !== null && card.impossible > 0 && (
                  <Row label="Impossible this week" value={`${card.impossible}`} />
                )}
                {card.duels && card.duels.won + card.duels.lost + card.duels.drawn > 0 && (
                  <Row
                    label="Duels"
                    value={`${card.duels.won}W ${card.duels.lost}L${
                      card.duels.drawn > 0 ? ` ${card.duels.drawn}D` : ''
                    }`}
                  />
                )}
              </View>

              {card.duels && card.duels.streak !== 0 && (
                <Text style={[styles.streakNote, { color: colors.textMuted }]}>
                  {card.duels.streak > 0
                    ? `You have won your last ${card.duels.streak} against them.`
                    : `They have won your last ${-card.duels.streak}.`}
                </Text>
              )}

              {note && <Text style={[styles.note, { color: colors.textMuted }]}>{note}</Text>}

              {!card.isMe && (
                <View style={styles.actions}>
                  {card.friendship === 'none' && (
                    <Action
                      label="Add friend"
                      onPress={() => act(async () => { await sendFriendRequest(card.name); }, 'Request sent.')}
                    />
                  )}
                  {card.friendship === 'received' && (
                    <Action
                      label="Accept friend request"
                      onPress={() =>
                        act(async () => { await respondToFriendRequest(card.name, true); }, 'You are now friends.')
                      }
                    />
                  )}
                  {card.friendship === 'sent' && (
                    <Text style={[styles.pending, { color: colors.textMuted }]}>
                      Friend request sent — waiting on them.
                    </Text>
                  )}
                  {card.friendship === 'friends' && (
                    <Action
                      label="Challenge to a duel"
                      onPress={() =>
                        act(async () => {
                          await challengeFriend(card.name);
                          onChallenged?.();
                        }, 'Challenge sent.')
                      }
                    />
                  )}
                </View>
              )}
            </>
          )}

          <Pressable onPress={onClose} hitSlop={10} style={styles.close}>
            <Text style={[styles.closeText, { color: colors.textMuted }]}>Close</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  const { colors } = useTheme();
  return (
    <View style={styles.row}>
      <Text style={[styles.rowLabel, { color: colors.textMuted }]}>{label}</Text>
      <Text style={[styles.rowValue, { color: colors.text }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  sheet: { borderWidth: 1, borderRadius: 20, padding: 22, gap: 2 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  name: { fontSize: 24, fontFamily: fonts.extraBold, flexShrink: 1 },
  sub: { fontSize: 11.5, fontFamily: fonts.medium, marginTop: 2 },
  stats: { flexDirection: 'row', marginTop: 18, marginBottom: 4 },
  stat: { flex: 1 },
  statValue: { fontSize: 26, fontFamily: fonts.extraBold },
  statLabel: { fontSize: 9, fontFamily: fonts.bold, letterSpacing: 1.3, marginTop: -1 },
  rows: { borderTopWidth: 1, marginTop: 14, paddingTop: 6 },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
  rowLabel: { fontSize: 13, fontFamily: fonts.medium },
  rowValue: { fontSize: 13.5, fontFamily: fonts.bold },
  streakNote: { fontSize: 12, fontFamily: fonts.medium, marginTop: 10, lineHeight: 17 },
  note: { fontSize: 12, fontFamily: fonts.medium, marginTop: 10 },
  actions: { marginTop: 16, gap: 8 },
  action: { borderRadius: 13, paddingVertical: 12, alignItems: 'center' },
  actionText: { fontSize: 14.5, fontFamily: fonts.extraBold },
  pending: { fontSize: 12.5, fontFamily: fonts.medium },
  close: { alignSelf: 'center', marginTop: 16 },
  closeText: { fontSize: 13, fontFamily: fonts.bold },
  error: { fontSize: 13.5, fontFamily: fonts.medium, lineHeight: 20 },
});

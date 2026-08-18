import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, View } from 'react-native';
import { Text } from './AppText';
import {
  ApiError,
  League,
  PlayerCard as Card,
  challengeFriend,
  loadPlayerCard,
  messageFor,
  respondToFriendRequest,
  sendFriendRequest,
} from '../lib/api';
import { Avatar } from './Avatar';
import { playTap } from '../utils/sound';
import { feedbackColors } from '../theme/colors';
import { fonts } from '../theme/fonts';
import { LEAGUE_INK } from '../theme/leagues';
import { LeagueBadge } from './LeagueBadge';
import { useTheme } from '../theme/ThemeContext';
import { radius, border } from '../theme/tokens';

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
  onOpenLeague,
}: {
  /** Null keeps the modal shut. */
  username: string | null;
  onClose: () => void;
  /** Duel started, so the caller can send the player to it. */
  onChallenged?: () => void;
  /**
   * Show who else is in this player's league. The caller is expected to close
   * this card first - a sheet opening on top of a sheet gives two Close buttons
   * and no way to tell which one goes where.
   */
  onOpenLeague?: (league: League) => void;
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
      <Text
        style={[styles.statValue, { color: colors.text }]}
        numberOfLines={1}
        adjustsFontSizeToFit
      >
        {value}
      </Text>
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
                <Avatar value={card.avatar} size={40} name={card.name} />
                {card.online && (
                  <View style={[styles.dot, { backgroundColor: feedbackColors.correct }]} />
                )}
                <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>
                  {card.name}
                </Text>
                {/* One of these exists in the whole game, so it goes next to
                    the name rather than into a row of statistics. */}

                {/* A crest, in the corner. The league is an identity rather
                    than a measurement, and it was being cut to "Br…" in a
                    column built for numbers. */}
                <Pressable
                  disabled={!onOpenLeague}
                  onPress={() => {
                    if (!onOpenLeague) return;
                    playTap();
                    onOpenLeague(card.league);
                  }}
                  style={({ pressed }) => [styles.crest, { opacity: pressed ? 0.7 : 1 }]}
                >
                  <LeagueBadge league={card.league} size={30} />
                  <Text style={[styles.crestName, { color: LEAGUE_INK[card.league] }]}>
                    {card.league}
                  </Text>
                </Pressable>
              </View>
              {/* No "last played" here. Nobody is playing every day yet, and a
                  card that opens with how long someone has been away makes a
                  quiet week look like a lapsed player. Someone with nothing yet
                  gets no line at all rather than a sentence about it. */}
              {/* No season line. It printed the same points as the POINTS
                  stat directly below it, and paired them with a day count
                  nothing on the card explained - "2 days" reads as an age, not
                  as the season's rate. The crest it was there to justify is
                  explained by the league ladder now. */}

              <View style={styles.stats}>
                {/* Two totals, and only totals.
                    Points and level are the same kind of fact - they only ever
                    grow, one from the daily and one from every mode - so they
                    belong together and nothing else does. A streak is a live
                    run that can end tonight, which is a different claim about
                    a person and reads as one down in the list. */}
                <Stat label="POINTS" value={`${card.points}`} />
                <Stat label="LEVEL" value={`${card.level}`} />
              </View>

              {/* The day itself: one bar per round, green for found and red for
                  not, with what it paid. Tapping a name on today's board is a
                  question about today, and the lifetime total does not answer
                  it. */}
              {card.todayRounds.length > 0 && (
                <View style={styles.today}>
                  {card.todayRounds.map((r) => (
                    <View
                      key={r.round}
                      style={[
                        styles.todayBar,
                        {
                          backgroundColor:
                            r.status === 'won' ? feedbackColors.correct : feedbackColors.oneAway,
                        },
                      ]}
                    >
                      <Text style={styles.todayScore}>{r.status === 'won' ? r.score : ''}</Text>
                    </View>
                  ))}
                </View>
              )}

              <View style={[styles.rows, { borderColor: colors.border }]}>
                {/* "Day streak 6" over "Daily challenges 6" was two different
                    facts - consecutive days, and days played at all - landing
                    on the same number with nothing to tell them apart. Named
                    for what each one counts. */}
                <Row label="Day streak" value={`${card.streak}`} />
                <Row label="Days played" value={`${card.daysPlayed}`} />
                {/* The label carries the unit so the values stay a column of
                    bare numerals. "6", "Level 7", "40" was three formats in
                    three rows - days, a level and points, one of them wearing
                    its unit and two of them not. Moving the word left makes
                    them line up and says what each number is at the same time.

                    A summit is the same level for everybody who reaches it, so
                    the guess count is what separates them - its own row rather
                    than a sentence crammed into this one. */}
                {card.impossible !== null && card.impossible > 0 && (
                  <Row label="Climb level" value={`${card.impossible}`} />
                )}
                {card.climb?.topped && (
                  <Row label="Summit guesses" value={`${card.climb.guesses}`} />
                )}
                {/* Only ever a finished day - a day in progress stays theirs. */}
                {card.todayScore !== null && <Row label="Today's points" value={`${card.todayScore}`} />}
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
                  {card.duels.streak === 1
                    ? 'You won the last one.'
                    : card.duels.streak === -1
                      ? 'They won the last one.'
                      : card.duels.streak > 1
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
  sheet: { borderWidth: border.hairline, borderRadius: radius.panel, padding: 22, gap: 2 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  name: { fontSize: 24, fontFamily: fonts.extraBold, flexShrink: 1 },
  belt: { borderWidth: border.selectable, borderRadius: radius.panel, paddingHorizontal: 9, paddingVertical: 3 },
  crest: { marginLeft: 'auto', alignItems: 'center', gap: 2 },
  crestName: { fontSize: 9.5, fontFamily: fonts.extraBold, letterSpacing: 0.8 },
  beltText: { fontSize: 9, fontFamily: fonts.extraBold, letterSpacing: 1.1 },
  stats: { flexDirection: 'row', marginTop: 18, marginBottom: 4 },
  // Centred in the column rather than ranged left. The labels are four
  // different lengths, so a left-ranged number sat hard against POINTS and
  // adrift over CLIMB - four columns that never lined up with each other.
  stat: { flex: 1, alignItems: 'center' },
  statValue: { fontSize: 26, fontFamily: fonts.extraBold, textAlign: 'center' },
  statLabel: {
    fontSize: 9,
    fontFamily: fonts.bold,
    letterSpacing: 1.3,
    marginTop: -1,
    textAlign: 'center',
  },
  today: { flexDirection: 'row', gap: 6, marginTop: 16 },
  todayBar: { flex: 1, height: 40, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  todayScore: { color: '#FFFFFF', fontSize: 13, fontFamily: fonts.extraBold },
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

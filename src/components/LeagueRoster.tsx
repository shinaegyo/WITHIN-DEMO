import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from './AppText';
import { Avatar } from './Avatar';
import { LeagueBadge } from './LeagueBadge';
import { fonts } from '../theme/fonts';
import { useTheme } from '../theme/ThemeContext';
import { League, LeagueBoard, loadLeagueBoard, messageFor, ApiError } from '../lib/api';

import { playTap } from '../utils/sound';
import { radius, border } from '../theme/tokens';

/**
 * The people standing in one league.
 *
 * A badge with nothing behind it is a label. Knowing Silver costs 200 is the
 * arithmetic of a league; seeing who is already in it is the reason to want in
 * - and until this existed the app could show you a crest and never once show
 * you the room.
 *
 * Ranked within the league. Somebody opening Bronze wants to know where they
 * stand in Bronze, and the season rank is on the board they came from.
 */
export function LeagueRoster({
  league,
  onClose,
}: {
  /** Null closes it. */
  league: League | null;
  onClose: () => void;
}) {
  const { colors } = useTheme();
  const [board, setBoard] = useState<LeagueBoard | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!league) return;
    let alive = true;
    setBoard(null);
    setError(null);
    loadLeagueBoard(league)
      .then((b) => alive && setBoard(b))
      .catch((err) => alive && setError(messageFor(err instanceof ApiError ? err.code : 'network')));
    return () => {
      alive = false;
    };
  }, [league]);

  return (
    <Modal visible={!!league} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.scrim} onPress={onClose}>
        <Pressable
          style={[styles.sheet, { backgroundColor: colors.surface, borderColor: colors.border }]}
          onPress={(e) => e.stopPropagation()}
        >
          {league && (
            <View style={styles.head}>
              <LeagueBadge league={league} size={22} />
              <Text style={[styles.name, { color: colors.text }]}>{league}</Text>
              {/* Just the count. The floor was tacked on here as well as being
                  stated on every row of the ladder that opens this, and "from
                  0" against Bronze is the least useful thing on the screen -
                  a threshold nobody has to clear. */}
              <Text style={[styles.count, { color: colors.textMuted }]}>
                {board ? `${board.total} ${board.total === 1 ? 'player' : 'players'}` : ''}
              </Text>
            </View>
          )}

          {error ? (
            <Text style={[styles.empty, { color: colors.textMuted }]}>{error}</Text>
          ) : !board ? (
            <ActivityIndicator style={styles.spin} color={colors.textMuted} />
          ) : board.entries.length === 0 ? (
            /* An empty league is information, not a failure - the top of the
               ladder is empty most of a season and should say so plainly. */
            <Text style={[styles.empty, { color: colors.textMuted }]}>
              Nobody is here yet this season.
            </Text>
          ) : (
            <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
              {board.entries.map((e) => (
                <View
                  key={`${e.rank}-${e.name}`}
                  style={[
                    styles.row,
                    { borderTopColor: colors.border },
                    e.isMe && { backgroundColor: colors.surfaceAlt },
                  ]}
                >
                  <Text style={[styles.rank, { color: colors.textMuted }]}>{e.rank}</Text>
                  <Avatar value={e.avatar} size={24} name={e.name} />
                  <Text
                    style={[styles.player, { color: colors.text }, e.isMe && styles.me]}
                    numberOfLines={1}
                  >
                    {e.name}
                  </Text>
                  <Text style={[styles.score, { color: colors.text }]}>{e.score}</Text>
                </View>
              ))}
            </ScrollView>
          )}

          <Pressable onPress={() => { playTap(); onClose(); }} style={styles.close}>
            <Text style={[styles.closeText, { color: colors.textMuted }]}>Close</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', padding: 22 },
  sheet: { borderRadius: radius.sheet, borderWidth: border.hairline, padding: 18 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  name: { fontSize: 16, fontFamily: fonts.bold },
  count: { flex: 1, fontSize: 12, fontFamily: fonts.medium, textAlign: 'right' },
  list: { maxHeight: 360 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 8, paddingHorizontal: 6, borderTopWidth: 1, borderRadius: 8,
  },
  rank: { width: 20, fontSize: 12, fontFamily: fonts.semiBold },
  player: { flex: 1, fontSize: 13.5, fontFamily: fonts.semiBold },
  me: { fontFamily: fonts.bold },
  score: { fontSize: 13.5, fontFamily: fonts.bold },
  empty: { fontSize: 13, fontFamily: fonts.medium, paddingVertical: 22, textAlign: 'center' },
  spin: { paddingVertical: 28 },
  close: { alignSelf: 'center', paddingVertical: 12, paddingHorizontal: 20, marginTop: 6 },
  closeText: { fontSize: 14, fontFamily: fonts.semiBold },
});

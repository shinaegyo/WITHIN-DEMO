import React, { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { Text } from '../components/AppText';
import { Avatar } from '../components/Avatar';
import { PlayerCardModal } from '../components/PlayerCard';
import { StatusScreen } from '../components/StatusScreen';
import { AllTimeEntry, ApiError, loadAllTimeLeaderboard, messageFor } from '../lib/api';
import { fonts } from '../theme/fonts';
import { useTrack } from '../utils/useTrack';
import { MEDALS } from '../theme/medals';
import { useTheme } from '../theme/ThemeContext';

export function LeaderboardScreen() {
  // Silent. Music belongs to playing, not to the rooms around it - and it has
  // to be asked for, because a screen that says nothing keeps whatever the
  // last one started, so this kept a mode's track playing over a list.
  useTrack(null);
  const { colors } = useTheme();
  const [entries, setEntries] = useState<AllTimeEntry[] | null>(null);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  // A name on a board was a dead end; tapping one opens who they are.
  const [looking, setLooking] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const board = await loadAllTimeLeaderboard();
      setEntries(board.entries);
      setTotal(board.totalPlayers);
    } catch (err) {
      setError(messageFor(err instanceof ApiError ? err.code : 'network'));
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (error) return <StatusScreen message={error} onRetry={load} />;
  if (!entries) return <StatusScreen loading />;

  if (entries.length === 0) {
    return (
      <StatusScreen message={'Nobody has played a day yet. Be the first.'} />
    );
  }

  return (
    <View style={[styles.wrap, { backgroundColor: colors.background }]}>
      <Text style={[styles.caption, { color: colors.textMuted }]}>
        Points from every daily challenge · {total} {total === 1 ? 'player' : 'players'}
      </Text>

      <FlatList
        data={entries}
        keyExtractor={(item, i) => `${item.rank}-${item.name}-${i}`}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => setLooking(item.name)}
            style={({ pressed }) => [
              styles.row,
              {
                backgroundColor: item.isMe ? colors.surfaceAlt : colors.surface,
                borderColor: item.isMe ? colors.accent : colors.border,
                borderWidth: item.isMe ? 2 : 1,
                opacity: pressed ? 0.7 : 1,
              },
            ]}
          >
            {MEDALS[item.rank] ? (
              <View style={[styles.medal, { backgroundColor: MEDALS[item.rank].ring }]}>
                <Text style={[styles.medalText, { color: MEDALS[item.rank].ink }]}>{item.rank}</Text>
              </View>
            ) : (
              <Text style={[styles.rank, { color: colors.textMuted }]}>{item.rank}</Text>
            )}
            <Avatar value={item.avatar} size={30} />
            <Text
              style={[styles.name, { color: colors.text }, item.isMe && styles.nameMe]}
              numberOfLines={1}
            >
              {item.name}
            </Text>
            {item.hasBelt && (
              <Text style={[styles.belt, { color: colors.accent }]}>CROWN</Text>
            )}
            {/* No "3h ago" column. With a handful of players, half of whom
                play a few times a week, it read as a list of people who had
                drifted off rather than a board. */}
            <Text style={[styles.score, { color: colors.text }]}>{item.score}</Text>
          </Pressable>
        )}
      />

      <PlayerCardModal username={looking} onClose={() => setLooking(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  caption: {
    fontSize: 12,
    fontFamily: fonts.medium,
    textAlign: 'center',
    paddingTop: 14,
    paddingBottom: 4,
  },
  list: { padding: 16, gap: 8 },
  belt: { fontSize: 9, fontFamily: fonts.extraBold, letterSpacing: 1 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 13,
    paddingHorizontal: 14,
  },
  rank: { width: 30, fontSize: 14, fontFamily: fonts.extraBold },
  medal: {
    width: 26,
    height: 26,
    borderRadius: 13,
    marginRight: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  medalText: { fontSize: 13, fontFamily: fonts.extraBold },
  name: { flex: 1, fontSize: 15, fontFamily: fonts.semiBold },
  nameMe: { fontFamily: fonts.extraBold },
  score: { fontSize: 18, fontFamily: fonts.extraBold, minWidth: 38, textAlign: 'right' },
});

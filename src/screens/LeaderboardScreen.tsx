import React, { useCallback, useEffect, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { StatusScreen } from '../components/StatusScreen';
import { AllTimeEntry, ApiError, loadAllTimeLeaderboard, messageFor } from '../lib/api';
import { fonts } from '../theme/fonts';
import { MEDALS } from '../theme/medals';
import { useTheme } from '../theme/ThemeContext';

export function LeaderboardScreen() {
  const { colors } = useTheme();
  const [entries, setEntries] = useState<AllTimeEntry[] | null>(null);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);

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
        Points from every day played · {total} {total === 1 ? 'player' : 'players'}
      </Text>

      <FlatList
        data={entries}
        keyExtractor={(item, i) => `${item.rank}-${item.name}-${i}`}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <View
            style={[
              styles.row,
              {
                backgroundColor: item.isMe ? colors.surfaceAlt : colors.surface,
                borderColor: item.isMe ? colors.accent : colors.border,
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
            <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>
              {item.name}
              {item.isMe ? '  (you)' : ''}
            </Text>
            {/* The same total means something different after four days than
                after four hundred. */}
            <Text style={[styles.meta, { color: colors.textMuted }]}>{item.daysPlayed}d</Text>
            <Text style={[styles.score, { color: colors.text }]}>{item.score}</Text>
          </View>
        )}
      />
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
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 13,
    paddingHorizontal: 14,
  },
  rank: { width: 30, fontSize: 14, fontFamily: fonts.extraBold },
  meta: { fontSize: 10, fontFamily: fonts.bold, marginRight: 10 },
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
  score: { fontSize: 18, fontFamily: fonts.extraBold, minWidth: 38, textAlign: 'right' },
});

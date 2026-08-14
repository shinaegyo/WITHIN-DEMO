import React, { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Avatar } from '../components/Avatar';
import { StatusScreen } from '../components/StatusScreen';
import { ApiError, EndlessEntry, loadEndlessBoard, messageFor } from '../lib/api';
import { fonts } from '../theme/fonts';
import { MEDALS } from '../theme/medals';
import { useTheme } from '../theme/ThemeContext';

/**
 * How far everybody got this week.
 *
 * Weekly rather than all-time, because the sequence changes each week: depth is
 * only comparable between people who were hunting the same numbers, and a
 * lifetime record would quietly compare two different games.
 */
export function ImpossibleBoardScreen() {
  const { colors } = useTheme();
  const [rows, setRows] = useState<EndlessEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setRows(await loadEndlessBoard());
    } catch (err) {
      setError(messageFor(err instanceof ApiError ? err.code : 'network'));
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (error) return <StatusScreen message={error} onRetry={load} />;
  if (!rows) return <StatusScreen loading />;
  if (rows.length === 0) {
    return <StatusScreen message="Nobody has cleared a number this week. Be the first." />;
  }

  return (
    <ScrollView
      style={[styles.wrap, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
    >
      <Text style={[styles.caption, { color: colors.textMuted }]}>
        Everyone plays the same numbers this week, so how far you got compares directly. It resets
        on Monday.
      </Text>

      {rows.map((e) => (
        <View
          key={`${e.rank}-${e.name}`}
          style={[
            styles.row,
            e.isMe
              ? { borderColor: colors.accent, borderWidth: 2, backgroundColor: colors.surfaceAlt }
              : { borderColor: colors.border, backgroundColor: colors.surface },
          ]}
        >
          {MEDALS[e.rank] ? (
            <View style={[styles.medal, { backgroundColor: MEDALS[e.rank].ring }]}>
              <Text style={[styles.medalText, { color: MEDALS[e.rank].ink }]}>{e.rank}</Text>
            </View>
          ) : (
            <Text style={[styles.rank, { color: colors.textMuted }]}>{e.rank}</Text>
          )}

          <Avatar value={e.avatar} size={30} />

          <Text
            style={[styles.name, { color: colors.text }, e.isMe && styles.nameMe]}
            numberOfLines={1}
          >
            {e.name}
          </Text>

          <Text style={[styles.depth, { color: colors.text }]}>{e.depth}</Text>
          <Text style={[styles.unit, { color: colors.textMuted }]}>
            {e.depth === 1 ? 'number' : 'numbers'}
          </Text>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  content: { padding: 16, gap: 8 },
  caption: { fontSize: 12, fontFamily: fonts.medium, lineHeight: 18, marginBottom: 6 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    paddingVertical: 13,
    paddingHorizontal: 14,
    gap: 10,
  },
  rank: { width: 20, fontSize: 13, fontFamily: fonts.extraBold },
  medal: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  medalText: { fontSize: 11, fontFamily: fonts.extraBold },
  name: { flex: 1, fontSize: 15, fontFamily: fonts.bold },
  nameMe: { fontFamily: fonts.extraBold },
  depth: { fontSize: 17, fontFamily: fonts.extraBold },
  unit: { fontSize: 11, fontFamily: fonts.medium },
});

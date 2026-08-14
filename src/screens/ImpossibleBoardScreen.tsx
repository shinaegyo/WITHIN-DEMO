import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Avatar } from '../components/Avatar';
import { StatusScreen } from '../components/StatusScreen';
import { ApiError, EndlessEntry, HomeStatus, loadEndlessBoard, loadHomeStatus, messageFor } from '../lib/api';
import { fonts } from '../theme/fonts';
import { MEDALS } from '../theme/medals';
import { useTheme } from '../theme/ThemeContext';
import { playTap } from '../utils/sound';

/**
 * Where Impossible starts: how far everybody got, and then the button.
 *
 * The board is the reason to play - you are chasing somebody's number, and
 * seeing it before you begin is what makes the run mean anything. It also has
 * to be reachable without spending a run, so nothing here calls endless_state,
 * which would open one.
 *
 * Weekly rather than all-time, because the sequence changes each week: depth is
 * only comparable between people who were hunting the same numbers, and a
 * lifetime record would quietly compare two different games.
 */
export function ImpossibleBoardScreen({ onPlay }: { onPlay: () => void }) {
  const { colors } = useTheme();
  const [rows, setRows] = useState<EndlessEntry[] | null>(null);
  const [status, setStatus] = useState<HomeStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setRows(await loadEndlessBoard());
      // Runs left comes from the status call, which has no side effects; asking
      // the game itself would start a run just by looking at the screen.
      loadHomeStatus().then(setStatus).catch(() => {});
    } catch (err) {
      setError(messageFor(err instanceof ApiError ? err.code : 'network'));
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (error) return <StatusScreen message={error} onRetry={load} />;
  if (!rows) return <StatusScreen loading />;

  const left = status?.impossible.runsLeft ?? null;
  const best = status?.impossible.best ?? 0;

  return (
    <View style={[styles.wrap, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[styles.caption, { color: colors.textMuted }]}>
          Everyone plays the same numbers this week, so how far you got compares directly. It resets
          on Monday.
        </Text>

        {rows.length === 0 && (
          <Text style={[styles.caption, { color: colors.textMuted }]}>
            Nobody has cleared a number this week. Be the first.
          </Text>
        )}

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

      {/* The way in sits under the standings rather than replacing them. */}
      <View style={[styles.foot, { borderColor: colors.border, backgroundColor: colors.background }]}>
        {best > 0 && (
          <Text style={[styles.best, { color: colors.textMuted }]}>
            Your best this week: {best} {best === 1 ? 'number' : 'numbers'}
          </Text>
        )}
        <Pressable
          onPress={() => {
            playTap();
            onPlay();
          }}
          disabled={left === 0}
          style={({ pressed }) => [
            styles.play,
            {
              backgroundColor: left === 0 ? colors.border : colors.text,
              opacity: pressed ? 0.85 : 1,
            },
          ]}
        >
          <Text
            style={[styles.playText, { color: left === 0 ? colors.textMuted : colors.background }]}
          >
            {left === 0
              ? 'No runs left today'
              : left === null
                ? 'Start a run'
                : `Start a run · ${left} left today`}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  content: { padding: 16, gap: 8, paddingBottom: 20 },
  foot: { borderTopWidth: 1, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 14, gap: 8 },
  best: { fontSize: 12, fontFamily: fonts.medium, textAlign: 'center' },
  play: { borderRadius: 16, paddingVertical: 15, alignItems: 'center' },
  playText: { fontSize: 16, fontFamily: fonts.extraBold },
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

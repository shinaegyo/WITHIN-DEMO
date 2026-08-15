import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '../components/AppText';
import { Avatar } from '../components/Avatar';
import { ScreenTitle } from '../components/ScreenTitle';
import { PlayerCardModal } from '../components/PlayerCard';
import { StatusScreen } from '../components/StatusScreen';
import {
  ApiError,
  loadAllTimeLeaderboard,
  loadEndlessBoard,
  loadLeaderboard,
  messageFor,
} from '../lib/api';
import { fonts } from '../theme/fonts';
import { useTrack } from '../utils/useTrack';
import { MEDALS } from '../theme/medals';
import { useTheme } from '../theme/ThemeContext';
import { playTap } from '../utils/sound';

/**
 * Every board in one place.
 *
 * They answer different questions - who won today, who has won most, who got
 * deepest this week, who beats people - and splitting them across four screens
 * meant three of them were never found. One screen, four segments, and each
 * loads only when it is asked for.
 */
type Board = 'today' | 'alltime' | 'impossible';

interface Row {
  rank: number;
  name: string;
  avatar: string | null;
  value: string;
  unit?: string;
  isMe: boolean;
  crown?: boolean;
}

const TABS: { key: Board; label: string; note: string }[] = [
  { key: 'today', label: 'Today', note: 'Points from today’s three rounds. Finished days only.' },
  { key: 'alltime', label: 'All time', note: 'Points from every daily challenge played.' },
  { key: 'impossible', label: 'Impossible', note: 'How deep everyone got this week. Same numbers for everyone, reset each Monday.' },
];

export function BoardsScreen() {
  // Silent. Music belongs to playing, not to the rooms around it - and it has
  // to be asked for, because a screen that says nothing keeps whatever the
  // last one started, so this kept a mode's track playing over a list.
  useTrack(null);
  const { colors } = useTheme();
  const [tab, setTab] = useState<Board>('today');
  const [rows, setRows] = useState<Partial<Record<Board, Row[]>>>({});
  const [error, setError] = useState<string | null>(null);
  const [looking, setLooking] = useState<string | null>(null);

  const load = useCallback(
    async (which: Board) => {
      setError(null);
      try {
        if (which === 'today') {
          const b = await loadLeaderboard();
          setRows((r) => ({
            ...r,
            today: b.entries.map((e) => ({
              rank: e.rank, name: e.name, avatar: e.avatar,
              value: `${e.score}`, isMe: e.isMe,
            })),
          }));
        } else if (which === 'alltime') {
          const b = await loadAllTimeLeaderboard();
          setRows((r) => ({
            ...r,
            alltime: b.entries.map((e) => ({
              rank: e.rank, name: e.name, avatar: e.avatar,
              value: `${e.score}`, isMe: e.isMe, crown: e.hasBelt,
            })),
          }));
        } else {
          const b = await loadEndlessBoard();
          setRows((r) => ({
            ...r,
            impossible: b.map((e) => ({
              rank: e.rank, name: e.name, avatar: e.avatar,
              value: `${e.depth}`, unit: e.depth === 1 ? 'number' : 'numbers', isMe: e.isMe,
            })),
          }));
        }
      } catch (err) {
        setError(messageFor(err instanceof ApiError ? err.code : 'network'));
      }
    },
    [],
  );

  useEffect(() => {
    if (!rows[tab]) load(tab);
  }, [tab, rows, load]);

  const list = rows[tab];
  const note = TABS.find((t) => t.key === tab)!.note;

  return (
    <View style={[styles.wrap, { backgroundColor: colors.background }]}>
      <ScreenTitle title="Leaderboard" />
      <View style={styles.segments}>
        {TABS.map((t) => (
          <Pressable
            key={t.key}
            onPress={() => {
              playTap();
              setTab(t.key);
            }}
            style={[
              styles.segment,
              t.key === tab
                ? { backgroundColor: colors.text }
                : { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 },
            ]}
          >
            <Text
              style={[
                styles.segmentText,
                { color: t.key === tab ? colors.background : colors.textMuted },
              ]}
            >
              {t.label}
            </Text>
          </Pressable>
        ))}
      </View>

      <Text style={[styles.note, { color: colors.textMuted }]}>{note}</Text>

      {error ? (
        <StatusScreen message={error} onRetry={() => load(tab)} />
      ) : !list ? (
        <StatusScreen loading />
      ) : list.length === 0 ? (
        <Text style={[styles.empty, { color: colors.textMuted }]}>
          Nobody is on this board yet. Be the first.
        </Text>
      ) : (
        <ScrollView contentContainerStyle={styles.list}>
          {list.map((e) => (
            <Pressable
              key={`${e.rank}-${e.name}`}
              onPress={() => {
                playTap();
                setLooking(e.name);
              }}
              style={({ pressed }) => [
                styles.row,
                e.isMe
                  ? { borderColor: colors.accent, borderWidth: 2, backgroundColor: colors.surfaceAlt }
                  : { borderColor: colors.border, borderWidth: 1, backgroundColor: colors.surface },
                { opacity: pressed ? 0.7 : 1 },
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

              {e.crown && <Text style={[styles.crown, { color: colors.accent }]}>CROWN</Text>}
              {!!e.unit && <Text style={[styles.unit, { color: colors.textMuted }]}>{e.unit}</Text>}
              <Text style={[styles.value, { color: colors.text }]}>{e.value}</Text>
            </Pressable>
          ))}
        </ScrollView>
      )}

      <PlayerCardModal username={looking} onClose={() => setLooking(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  screenTitle: {
    fontSize: 26,
    fontFamily: fonts.extraBold,
    letterSpacing: -0.4,
    textAlign: 'center',
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 6,
  },
  segments: { flexDirection: 'row', gap: 6, paddingHorizontal: 14, paddingTop: 12 },
  segment: { flex: 1, borderRadius: 11, paddingVertical: 9, alignItems: 'center' },
  segmentText: { fontSize: 12, fontFamily: fonts.extraBold },
  note: { fontSize: 11.5, fontFamily: fonts.medium, lineHeight: 16, paddingHorizontal: 16, paddingTop: 10 },
  list: { padding: 14, gap: 8 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 13,
    gap: 10,
  },
  rank: { width: 20, fontSize: 13, fontFamily: fonts.extraBold },
  medal: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  medalText: { fontSize: 11, fontFamily: fonts.extraBold },
  name: { flex: 1, fontSize: 15, fontFamily: fonts.bold },
  nameMe: { fontFamily: fonts.extraBold },
  crown: { fontSize: 9, fontFamily: fonts.extraBold, letterSpacing: 1 },
  unit: { fontSize: 11, fontFamily: fonts.medium },
  value: { fontSize: 16, fontFamily: fonts.extraBold },
  empty: { fontSize: 13, fontFamily: fonts.medium, lineHeight: 19, padding: 18 },
});

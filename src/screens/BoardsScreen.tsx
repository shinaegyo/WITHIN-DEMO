import React, { useCallback, useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '../components/AppText';
import { Avatar } from '../components/Avatar';
import { ScreenTitle } from '../components/ScreenTitle';
import { PlayerCardModal } from '../components/PlayerCard';
import { StatusScreen } from '../components/StatusScreen';
import {
  ApiError,
  loadAllTimeLeaderboard,
  loadLeaderboard,
  Leaderboard,
  AllTimeLeaderboard,
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
/**
 * Two boards, not three.
 *
 * Impossible had a tab here and its own standings on its own screen - the same
 * list in two places, and the copy under this one had to explain a weekly reset
 * that has nothing to do with the daily. Rush and Window already keep their
 * boards where they are played, which is the pattern; adding them here would
 * have made four tabs of which three were duplicates.
 *
 * So this tab means one thing: the daily, which is the only mode that scores
 * points, keeps a streak, or places anybody.
 */
type Board = 'today' | 'alltime';

interface Row {
  rank: number;
  name: string;
  avatar: string | null;
  value: string;
  unit?: string;
  /** Shown small beside the value: today's board uses it for precision. */
  sub?: string;
  isMe: boolean;
  crown?: boolean;
}

const TABS: { key: Board; label: string; note: string }[] = [
  // The columns are explained under the board rather than above it: nothing
  // should stand between opening this tab and seeing the standings, and the
  // question only occurs to somebody who has already looked at the rows.
  { key: 'today', label: 'Today', note: 'Points from today’s three rounds. Finished days only.' },
  // Named for what it ranks. "All time" invited a total; this is a rate.
  { key: 'alltime', label: 'All time', note: 'Points from every daily challenge played.' },
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
  const [explain, setExplain] = useState<Board | null>(null);
  // Today's board carries more than a list: where you came as a share of the
  // field, how many people are level with you, and the shape of the day.
  const [today, setToday] = useState<Leaderboard | null>(null);
  const [allTime, setAllTime] = useState<AllTimeLeaderboard | null>(null);

  const load = useCallback(
    async (which: Board) => {
      setError(null);
      try {
        if (which === 'today') {
          const b = await loadLeaderboard();
          setToday(b);
          setRows((r) => ({
            ...r,
            today: b.entries.map((e) => ({
              rank: e.rank, name: e.name, avatar: e.avatar,
              value: `${e.score}`, sub: `${e.avgOff}`, isMe: e.isMe,
            })),
          }));
        } else if (which === 'alltime') {
          const b = await loadAllTimeLeaderboard();
          setAllTime(b);
          setRows((r) => ({
            ...r,
            alltime: b.entries.map((e) => ({
              rank: e.rank, name: e.name, avatar: e.avatar,
              value: `${e.score}`, sub: `${e.daysPlayed}`, isMe: e.isMe, crown: e.hasBelt,
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

      {/* Your day, before the podium.
          A position is the wrong instrument once there are thousands of
          players - nobody is glad to be four-thousandth at something they did
          well - so this says how you did rather than what number you are, and
          states the tie instead of hiding it. */}
      {tab === 'alltime' && allTime?.me && (
        <View style={[styles.mine, { borderColor: colors.border }]}>
          <Text style={[styles.mineLead, { color: colors.textMuted }]}>
            {allTime.me.topPercent !== null
              ? `TOP ${allTime.me.topPercent}% ALL TIME`
              : `${allTime.me.rank} OF ${allTime.totalPlayers} ALL TIME`}
          </Text>
          <View style={styles.mineLine}>
            <Text style={[styles.mineScore, { color: colors.text }]}>
              {allTime.me.totalPoints.toLocaleString()}
            </Text>
            <Text style={[styles.mineUnit, { color: colors.textMuted }]}>points</Text>
          </View>
          <Text style={[styles.mineNote, { color: colors.textMuted }]}>
            {allTime.me.daysPlayed} days played, {allTime.me.perDay} a day on average.
          </Text>
        </View>
      )}

      {tab === 'today' && today?.me && (
        <View style={[styles.mine, { borderColor: colors.border }]}>
          <Text style={[styles.mineLead, { color: colors.textMuted }]}>
            {today.me.topPercent !== null
              ? `TOP ${today.me.topPercent}% TODAY`
              : `${today.me.rank} OF ${today.totalPlayers} TODAY`}
          </Text>
          {/* One line. Stacked, the unit read as a third label in a card that
              already had two, and put a line break between a number and the
              word that says what it is. */}
          <View style={styles.mineLine}>
            <Text style={[styles.mineScore, { color: colors.text }]}>{today.me.score}</Text>
            <Text style={[styles.mineUnit, { color: colors.textMuted }]}>
              {today.me.score === 1 ? 'point' : 'points'}
            </Text>
          </View>
          {/* The explanation is unconditional. It used to ride along with the
              tie - "4 players on this score, the closer guesses rank higher" -
              so on any day you were alone on your score, nothing on the screen
              said what AVG OFF was for. The column was there every day and the
              reason for it only some days. */}
          <Text style={[styles.mineNote, { color: colors.textMuted }]}>
            Your guesses landed {today.me.avgOff} away on average — closer guesses rank higher when
            scores are level.
            {today.me.playersOnScore > 1
              ? ` ${today.me.playersOnScore.toLocaleString()} players finished on ${today.me.score}.`
              : ''}
          </Text>

        </View>
      )}

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
          {/* The precision column is labelled. A bare 881 beside a score is a
              number nobody can read, and one that is better when smaller. */}
          {tab === 'today' && (
            <View style={styles.head}>
              <Text style={[styles.headValue, { color: colors.textMuted }]}>POINTS</Text>
              {/* The explanation lives behind the header rather than under the
                  board. A footnote is read by nobody who is not already
                  curious, and a full screen for one column is far too much
                  room for one sentence. */}
              <Pressable onPress={() => { playTap(); setExplain('today'); }} hitSlop={10}>
                <Text style={[styles.headSub, styles.headTap, { color: colors.accent }]}>
                  AVG OFF ⓘ
                </Text>
              </Pressable>
            </View>
          )}
          {tab === 'alltime' && (
            <View style={styles.head}>
              <Text style={[styles.headValue, { color: colors.textMuted }]}>POINTS</Text>
              <Pressable onPress={() => { playTap(); setExplain('alltime'); }} hitSlop={10}>
                <Text style={[styles.headSub, styles.headTap, { color: colors.accent }]}>
                  DAYS ⓘ
                </Text>
              </Pressable>
            </View>
          )}
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
              {/* Points first, then the tiebreak, because that is the order
                  they are sorted in. The other way round you read what settles
                  a tie before you read the thing being tied. */}
              <Text style={[styles.value, { color: colors.text }]}>{e.value}</Text>
              {!!e.sub && <Text style={[styles.sub, { color: colors.textMuted }]}>{e.sub}</Text>}
            </Pressable>
          ))}
        </ScrollView>
      )}

      <PlayerCardModal username={looking} onClose={() => setLooking(null)} />

      <Modal visible={explain !== null} transparent animationType="fade" onRequestClose={() => setExplain(null)}>
        <Pressable style={styles.scrim} onPress={() => setExplain(null)}>
          <Pressable
            style={[styles.sheet, { backgroundColor: colors.surface, borderColor: colors.border }]}
            onPress={() => {}}
          >
            {explain === 'today' ? (
              <>
                <Text style={[styles.sheetTitle, { color: colors.text }]}>Avg off</Text>
                <Text style={[styles.sheetBody, { color: colors.textMuted }]}>
                  How far a typical guess landed from the answer.
                </Text>
                <Text style={[styles.sheetBody, { color: colors.textMuted }]}>
                  Say the number was 342 and you guessed 500, then 400, then 350, then 342. Those
                  guesses were 158, 58, 8 and 0 away — 224 altogether, across four guesses.
                </Text>
                <View style={[styles.sheetSum, { borderColor: colors.border }]}>
                  <Text style={[styles.sheetSumText, { color: colors.text }]}>224 ÷ 4 = 56 avg off</Text>
                </View>
                <Text style={[styles.sheetBody, { color: colors.textMuted }]}>
                  Lower is better. When two players finish level on points, the closer guesses rank
                  higher.
                </Text>
              </>
            ) : (
              <>
                <Text style={[styles.sheetTitle, { color: colors.text }]}>Days</Text>
                <Text style={[styles.sheetBody, { color: colors.textMuted }]}>
                  How many dailies you have finished.
                </Text>
                <Text style={[styles.sheetBody, { color: colors.textMuted }]}>
                  Two players on 2,400 points, one after 12 days and one after 20: the same total in
                  fewer days is the better record, so 12 ranks higher.
                </Text>
              </>
            )}
            <Pressable onPress={() => { playTap(); setExplain(null); }} style={styles.sheetClose}>
              <Text style={[styles.sheetCloseText, { color: colors.text }]}>Got it</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
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
  // Your own day, set apart from the podium above it.
  mine: {
    borderWidth: 1,
    borderRadius: 16,
    marginHorizontal: 20,
    marginBottom: 12,
    paddingVertical: 14,
    alignItems: 'center',
    gap: 2,
  },
  mineLead: { fontSize: 10.5, fontFamily: fonts.bold, letterSpacing: 1.8 },
  mineScore: { fontSize: 46, fontFamily: fonts.extraBold, letterSpacing: -2, lineHeight: 52 },
  mineLine: { flexDirection: 'row', alignItems: 'baseline', gap: 7 },
  mineUnit: { fontSize: 15, fontFamily: fonts.bold },
  headTap: { textDecorationLine: 'underline' },
  scrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center', padding: 26 },
  sheet: { borderWidth: 1, borderRadius: 20, padding: 22, gap: 10, maxWidth: 420, width: '100%' },
  sheetTitle: { fontSize: 21, fontFamily: fonts.extraBold, letterSpacing: -0.4 },
  sheetBody: { fontSize: 14, fontFamily: fonts.medium, lineHeight: 21 },
  sheetSum: { borderWidth: 1, borderRadius: 12, paddingVertical: 11, alignItems: 'center', marginVertical: 2 },
  sheetSumText: { fontSize: 15, fontFamily: fonts.extraBold },
  sheetClose: { alignSelf: 'flex-end', paddingTop: 6, paddingHorizontal: 4 },
  sheetCloseText: { fontSize: 14, fontFamily: fonts.extraBold },
  head: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, paddingRight: 18, paddingBottom: 4 },
  headSub: { fontSize: 8.5, fontFamily: fonts.bold, letterSpacing: 0.6, minWidth: 40, textAlign: 'right' },
  headValue: { fontSize: 8.5, fontFamily: fonts.bold, letterSpacing: 0.6, minWidth: 40, textAlign: 'right' },
  mineNote: { fontSize: 11.5, fontFamily: fonts.medium, textAlign: 'center', paddingHorizontal: 16 },
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
  sub: { fontSize: 11.5, fontFamily: fonts.bold, minWidth: 40, textAlign: 'right' },
  // Fixed width so the column header above it lines up with the numbers.
  value: { fontSize: 16, fontFamily: fonts.extraBold, minWidth: 40, textAlign: 'right' },
  empty: { fontSize: 13, fontFamily: fonts.medium, lineHeight: 19, padding: 18 },
});

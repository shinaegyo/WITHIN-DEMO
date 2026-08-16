import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '../components/AppText';
import { Avatar } from '../components/Avatar';
import { ScreenTitle } from '../components/ScreenTitle';
import { StatusScreen } from '../components/StatusScreen';
import { PagedRules, RulesButton } from '../components/PagedRules';
import { impossibleRules } from '../components/modeRules';
import {
  ApiError,
  EndlessEntry,
  HomeStatus,
  loadEndlessBoard,
  loadHomeStatus,
  messageFor,
  startEndlessSession,
} from '../lib/api';
import { ARENAS } from '../theme/arenas';
import { useTrack } from '../utils/useTrack';
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
 *
 * The rules sit underneath it. Impossible has more of them than the daily -
 * lives, tiers, a clue that arrives late, one climb a day - and the only place
 * they were written down was How to Play, five taps away on another tab. Under
 * the board is where somebody is already standing when they wonder.
 */
export function ImpossibleBoardScreen({
  onPlay,
  onBack,
}: {
  onPlay: () => void;
  onBack: () => void;
}) {
  useTrack('game');
  const { colors } = useTheme();
  const [rows, setRows] = useState<EndlessEntry[] | null>(null);
  const [status, setStatus] = useState<HomeStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rules, setRules] = useState(false);

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

  // The rulebook takes the whole screen rather than sitting under it.
  if (rules) return <PagedRules title="How The Impossible Climb works" onBack={() => setRules(false)} sections={impossibleRules()} />;

  if (error) return <StatusScreen message={error} onRetry={load} />;
  if (!rows) return <StatusScreen loading />;

  const left = status?.impossible.sessionsLeft ?? null;
  // From the board rather than the run: a climb that ran out of lives falls
  // back to its arena, and the deepest level reached is what the week records.
  const best = rows.find((e) => e.isMe)?.depth ?? status?.impossible.best ?? 0;
  const level = status?.impossible.level ?? 1;
  const lives = status?.impossible.lives ?? 0;
  // Once today's climb is started there are no sessions left, so sessionsLeft
  // alone would lock a player out of the run they are in the middle of. A day
  // is only over when the sessions and the lives are both gone.
  const canClimb = left === null || left > 0 || lives > 0;
  // Leaving mid-climb costs nothing, so the button has to say which of the two
  // it is about to do. "Climb" on a session already open reads as though it
  // might spend something, and nobody should have to press it to find out.
  const resuming = left === 0 && lives > 0;

  return (
    <View style={[styles.wrap, { backgroundColor: colors.background }]}>
      <ScreenTitle
        title="The Impossible Climb"
        subtitle="Everyone plays the same numbers this week, so how far you got compares directly. It resets on Monday."
        onBack={onBack}
      />
      <ScrollView contentContainerStyle={styles.content}>

        {rows.length === 0 && (
          <Text style={[styles.caption, { color: colors.textMuted }]}>
            Nobody has cleared a number this week. Be the first.
          </Text>
        )}

        {rows.map((e, i) => (
        <View
          // Ranks tie and names are not unique, so neither identifies a row.
          key={`${e.rank}-${e.name}-${i}`}
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

          <Avatar value={e.avatar} size={30} name={e.name} />

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

        {/* Set out plainly rather than folded behind a disclosure. A rule
            nobody opens is a rule nobody knows, and a row of chevrons down the
            app is furniture standing between the player and the only thing on
            the screen worth reading. It scrolls; that is what scrolling is
            for. */}
        <RulesButton onPress={() => setRules(true)} />
      </ScrollView>

      {/* The way in sits under the standings rather than replacing them. */}
      <View style={[styles.foot, { borderColor: colors.border, backgroundColor: colors.background }]}>
        <Text style={[styles.best, { color: colors.textMuted }]}>
          {best > 0
            ? `You are on level ${level}, ${best} cleared this week`
            : 'Your climb starts at level 1'}
          {left !== 0 && lives > 0 ? ` · ${lives * 20}% health` : ''}
        </Text>
        <Pressable
          onPress={async () => {
            playTap();
            // Spending a session is deliberate and explicit: looking at this
            // screen must never cost one.
            try {
              await startEndlessSession();
            } catch {
              return;
            }
            onPlay();
          }}
          disabled={!canClimb}
          style={({ pressed }) => [
            styles.play,
            {
              // The pill and its ink come from one predicate. They used to be
              // decided separately - the fill by whether a session was left,
              // the ink by whether the button worked at all - and a climb in
              // progress satisfied one and not the other, so the label went
              // black on a black pill the moment the status arrived.
              backgroundColor: canClimb ? colors.text : colors.border,
              opacity: pressed ? 0.85 : 1,
            },
          ]}
        >
          <Text
            style={[styles.playText, { color: canClimb ? colors.background : colors.textMuted }]}
          >
            {!canClimb
              ? "Today's climb is done — back tomorrow"
              : resuming
                ? `Resume · ${lives * 20}% health`
                : 'Start'}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  content: { padding: 16, gap: 8, paddingBottom: 20 },
  rulesHead: { fontSize: 15, fontFamily: fonts.extraBold, marginTop: 26, marginBottom: 8 },
  rule: { fontSize: 12.5, fontFamily: fonts.medium, lineHeight: 18, marginBottom: 10 },
  tiers: { borderWidth: 1, borderRadius: 14, paddingVertical: 4, marginTop: 2, marginBottom: 12 },
  tierRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 9, paddingHorizontal: 12, gap: 10 },
  swatch: { width: 12, height: 12, borderRadius: 3 },
  tierName: { flex: 1, fontSize: 13, fontFamily: fonts.bold },
  tierRange: { fontSize: 11.5, fontFamily: fonts.bold, width: 46, textAlign: 'right' },
  tierAttempts: { fontSize: 11.5, fontFamily: fonts.medium, width: 74, textAlign: 'right' },
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

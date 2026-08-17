import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '../components/AppText';
import { Avatar } from '../components/Avatar';
import { ScreenTitle } from '../components/ScreenTitle';
import { StatusScreen } from '../components/StatusScreen';
import { StatIcon } from '../components/StatIcon';
import { ShowMore, StandingsBreak, topTen } from '../components/Standings';
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
  const [expanded, setExpanded] = useState(false);

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

  if (error) return <StatusScreen message={error} onRetry={load} />;
  if (!rows) return <StatusScreen loading />;

  const left = status?.impossible.sessionsLeft ?? null;
  const level = status?.impossible.level ?? 1;
  const health = status?.impossible.health ?? 0;
  const summit = !!status?.impossible.summit;
  // Once today's climb is started there are no sessions left, so sessionsLeft
  // alone would lock a player out of the run they are in the middle of. A day
  // is only over when the sessions and the lives are both gone.
  const canClimb = !summit && (left === null || left > 0 || health > 0);
  // Leaving mid-climb costs nothing, so the button has to say which of the two
  // it is about to do. "Climb" on a session already open reads as though it
  // might spend something, and nobody should have to press it to find out.
  const resuming = left === 0 && health > 0;
  const { shown, hidden, breakAt } = topTen(rows, expanded);

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

        {shown.map((e, i) => (
        <React.Fragment key={`${e.rank}-${e.name}-${i}`}>
        {i === breakAt && <StandingsBreak />}
        <View
          // Ranks tie and names are not unique, so neither identifies a row.
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

          {/* A summit is depth 50 for everybody who reaches it, so the number
              stops separating them and the guess count starts. */}
          {e.topped ? (
            // A summit is level 50 for everybody who reaches it, so the level
            // stops separating them and the guess count starts.
            //
            // "TOPPED OUT · 228 guesses" answered that in three parts while
            // every other row answered it in two, and the finished players -
            // the ones worth looking at - had the busiest rows on the board.
            // The mountain says they went all the way without a word, which is
            // how the league badges already work, and the number keeps the slot
            // the level would have used.
            <View
              style={styles.levelWrap}
              accessibilityLabel={`Topped out in ${e.guesses} guesses`}
            >
              <StatIcon glyph="summit" color={colors.accent} size={18} />
              <Text style={[styles.depth, { color: colors.text }]}>{e.guesses}</Text>
            </View>
          ) : (
            // "47 numbers" counted what somebody had got through; the climb is
            // read as how high they are, and the ladder is already numbered.
            //
            // The number holds a fixed slot rather than sizing to its digits.
            // Right-aligned to the row's end, a level of 6 is narrower than 49,
            // so the word in front of it slid left and right down the column -
            // and "Level" is the thing the eye scans for, so it was the one
            // part that could not be allowed to move. Two digits is the whole
            // ladder, and 50 is the top.
            <View style={styles.levelWrap}>
              <Text style={[styles.levelLabel, { color: colors.text }]}>LVL</Text>
              <Text style={[styles.depth, { color: colors.text }]}>{e.depth}</Text>
            </View>
          )}
        </View>
        </React.Fragment>
        ))}

        <ShowMore count={hidden} onPress={() => setExpanded(true)} />

        {/* Said once under the board rather than seven times inside it.
            A summit row carries a mountain and a number, and that number is
            guesses where every other row's is a level - so on its own it reads
            as a level of 228, which is not a thing. Naming the unit in the row
            costs a long word in a tight column and repeats on every summit;
            here it also explains the ordering, which the row never could.

            Only once somebody has actually topped out. Before that it explains
            a row nobody can see. */}
        {rows.some((e) => e.topped) && (
          <Text style={[styles.caption, { color: colors.textMuted }]}>
            Topping out is level 50 for everyone, so summits rank by guesses used.
          </Text>
        )}

        {/* Set out plainly rather than folded behind a disclosure. A rule
            nobody opens is a rule nobody knows, and a row of chevrons down the
            app is furniture standing between the player and the only thing on
            the screen worth reading. It scrolls; that is what scrolling is
            for. */}
        {/* Set out rather than hidden behind a button. Start is meant to be
            the only thing on this screen that answers a press, and deleting
            the rules to achieve that would have left the mode's rules
            unreachable from the screen you land on. */}
        <Text style={[styles.rulesHead, { color: colors.text }]}>How it works</Text>
        {impossibleRules({ tiersFirst: true }).map((section, i) => (
          <View key={i} style={i === 0 ? undefined : styles.ruleGap}>
            {section}
          </View>
        ))}
      </ScrollView>

      {/* The way in sits under the standings rather than replacing them. */}
      <View style={[styles.foot, { borderColor: colors.border, backgroundColor: colors.background }]}>
        <Text style={[styles.best, { color: colors.textMuted }]}>
          {summit ? 'You topped out this week' : `You are on level ${level}`}
          {!summit && left !== 0 && health > 0 ? ` · ${health}% health` : ''}
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
            {summit
              ? 'Topped out'
              : !canClimb
                ? "Today's climb is done"
                : resuming
                  ? `Resume · ${health}% health`
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
  // Bigger than the headings inside it. At 15 it was smaller than every
  // section title underneath, so the thing naming the whole rulebook read as a
  // caption on the first rule rather than as a title over all of them.
  rulesHead: { fontSize: 24, fontFamily: fonts.extraBold, marginTop: 30, marginBottom: 14 },
  ruleGap: { marginTop: 20 },
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
  // Baseline rather than centre: the two sizes are far enough apart that
  // centring them left the word floating against the middle of the number.
  levelWrap: { flexDirection: 'row', alignItems: 'baseline', gap: 5 },
  // The number's size, colour and weight. Nothing about it is set apart.
  //
  // Every difference tried here read as a different font rather than as a
  // quieter one: muted split the phrase into two tones, and a lighter weight
  // beside an extra-bold number looked like two typefaces that had failed to
  // match. Abbreviating carries the label on its own - LVL is plainly not a
  // score - so nothing else has to.
  levelLabel: { fontSize: 17, fontFamily: fonts.extraBold, letterSpacing: 0.3 },
  depth: { fontSize: 17, fontFamily: fonts.extraBold, minWidth: 23, textAlign: 'right' },
});

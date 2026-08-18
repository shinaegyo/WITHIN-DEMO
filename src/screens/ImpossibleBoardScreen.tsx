import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '../components/AppText';
import { Avatar } from '../components/Avatar';
import { ScreenTitle } from '../components/ScreenTitle';
import { StatusScreen } from '../components/StatusScreen';
import { TierGlyph, tierFor } from '../components/TierGlyph';
import { PlayerCardModal } from '../components/PlayerCard';
import { LeagueRoster } from '../components/LeagueRoster';
import { ShowMore, StandingsBreak, topTen } from '../components/Standings';
import { impossibleRules } from '../components/modeRules';
import {
  ApiError,
  League,
  EndlessEntry,
  HomeStatus,
  loadEndlessBoard,
  loadHomeStatus,
  messageFor,
  startEndlessSession,
} from '../lib/api';
import { ARENAS, SUMMIT, arenaFor } from '../theme/arenas';
import { useTrack } from '../utils/useTrack';
import { fonts } from '../theme/fonts';
import { MEDALS } from '../theme/medals';
import { useTheme } from '../theme/ThemeContext';
import { playTap } from '../utils/sound';
import { radius, border } from '../theme/tokens';

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
  // Whose card is open. A name on this board used to be a dead end; the same
  // modal every other board uses now answers it, and it is the only place the
  // guess count behind a summit is written down.
  const [looking, setLooking] = useState<string | null>(null);
  const [leagueRoster, setLeagueRoster] = useState<League | null>(null);

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

  const level = status?.impossible.level ?? 1;
  const health = status?.impossible.health ?? 0;
  const summit = !!status?.impossible.summit;
  // Health is the whole of it. Nothing else rations the climb: play as many
  // sessions as the bar will carry, and the bar comes back in the morning.
  const canClimb = !summit && health > 0;
  // Leaving mid-climb costs nothing, so the button has to say which of the two
  // it is about to do. "Climb" on a session already open reads as though it
  // might spend something, and nobody should have to press it to find out.
  const resuming = !!status?.impossible.inSession;
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

        {/* The word once, over the column, instead of on every row. Six copies
            of LVL down the right edge was the label shouting louder than the
            numbers it was labelling. */}
        {rows.length > 0 && (
          <View style={styles.columnHeads}>
            {/* The name column had no heading, so the line read as a caption
                over the numbers rather than a heading over the board. Same
                size, weight and ink as LEVEL - two headings on one line. */}
            <Text style={[styles.columnHead, styles.columnHeadLeft, { color: colors.text }]}>
              STANDINGS
            </Text>
            <Text style={[styles.columnHead, { color: colors.text }]}>LEVEL</Text>
          </View>
        )}

        {shown.map((e, i) => (
        <React.Fragment key={`${e.rank}-${e.name}-${i}`}>
        {i === breakAt && <StandingsBreak />}
        <Pressable
          // Ranks tie and names are not unique, so neither identifies a row.
          onPress={() => {
            playTap();
            setLooking(e.name);
          }}
          style={[
            styles.row,
            e.isMe
              ? { borderColor: colors.accent, borderWidth: border.marked, backgroundColor: colors.surfaceAlt }
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

          {/* One column, one meaning: how high they are. A summit has no
              number to print - they are at the top, and the mountain says so.
              The guess count that separates two summiters lives on the card
              behind the row, because on the board it sat in the slot every
              other row uses for a level and read as a level of 228.

              The glyph wears its arena's own colour. Three of the five are
              close enough to be one colour at this size, so the shape is
              still what tells the tiers apart - the colour is warmth, not
              information. */}
          {e.topped ? (
            <View style={styles.value} accessibilityLabel="Topped out">
              <TierGlyph tier="summit" color={colors.accent} size={20} />
            </View>
          ) : (
            <View style={styles.value} accessibilityLabel={`Level ${e.depth}`}>
              <TierGlyph tier={tierFor(e.depth)} color={arenaFor(e.depth).accent} size={18} />
              <Text style={[styles.depth, { color: colors.text }]}>{e.depth}</Text>
            </View>
          )}
        </Pressable>
        </React.Fragment>
        ))}

        <ShowMore count={hidden} onPress={() => setExpanded(true)} />

        {/* The one thing the column cannot say. Every summit is the top level, so
            the mountain is the same on all of them and nothing on the board
            explains why one sits above another. Said once, underneath, and
            only once somebody has actually topped out - before that it
            describes a row nobody can see. */}
        {rows.some((e) => e.topped) && (
          <Text style={[styles.caption, { color: colors.textMuted }]}>
            Topping out is level {SUMMIT} for everyone, so summits rank by fewest guesses.
            Tap anyone to see theirs.
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
          {!summit && health > 0 ? ` · ${health}% health` : ''}
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

      <PlayerCardModal
        username={looking}
        onClose={() => setLooking(null)}
        onOpenLeague={(l) => {
          setLooking(null);
          setLeagueRoster(l);
        }}
      />

      <LeagueRoster league={leagueRoster} onClose={() => setLeagueRoster(null)} />
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
  tiers: { borderWidth: border.hairline, borderRadius: radius.card, paddingVertical: 4, marginTop: 2, marginBottom: 12 },
  tierRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 9, paddingHorizontal: 12, gap: 10 },
  swatch: { width: 12, height: 12, borderRadius: 3 },
  tierName: { flex: 1, fontSize: 13, fontFamily: fonts.bold },
  tierRange: { fontSize: 11.5, fontFamily: fonts.bold, width: 46, textAlign: 'right' },
  tierAttempts: { fontSize: 11.5, fontFamily: fonts.medium, width: 74, textAlign: 'right' },
  foot: { borderTopWidth: 1, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 14, gap: 8 },
  best: { fontSize: 12, fontFamily: fonts.medium, textAlign: 'center' },
  play: { borderRadius: radius.button, paddingVertical: 15, alignItems: 'center' },
  playText: { fontSize: 16, fontFamily: fonts.extraBold },
  caption: { fontSize: 12, fontFamily: fonts.medium, lineHeight: 18, marginBottom: 6 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.card,
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
  // One slot, whatever goes in it: a level, or the mountain that means there
  // is no level left to reach. Fixed and right-aligned so the column holds its
  // edge whether the number is 6, 37 or a glyph.
  // Glyph then number, right-aligned as one block. The glyph says which
  // arena they are standing in, the number says where in it - and the shape
  // carries the tier because three of the five arena accents are the same
  // pale blue at eighteen pixels.
  value: { flexDirection: 'row', alignItems: 'center', gap: 7, minWidth: 30, justifyContent: 'flex-end' },
  // Small, but not faint. It is the only thing on the screen that says what
  // the column of numbers means, and at a muted 9.5 it was the quietest
  // element above the loudest one. Kept to a header's size and given a
  // header's weight instead.
  columnHeads: { flexDirection: 'row', alignItems: 'center' },
  columnHead: {
    fontSize: 10.5,
    fontFamily: fonts.extraBold,
    letterSpacing: 1.2,
    textAlign: 'right',
    marginBottom: 6,
    paddingRight: 14,
  },
  /** Takes the slack so LEVEL stays where the rows put it. */
  columnHeadLeft: { flex: 1, textAlign: 'left', paddingRight: 0, paddingLeft: 14 },
  // The number's size, colour and weight. Nothing about it is set apart.
  //
  // Every difference tried here read as a different font rather than as a
  // quieter one: muted split the phrase into two tones, and a lighter weight
  // beside an extra-bold number looked like two typefaces that had failed to
  // match. Abbreviating carries the label on its own - LVL is plainly not a
  // score - so nothing else has to.
  depth: { fontSize: 17, fontFamily: fonts.extraBold, textAlign: 'right', minWidth: 23 },
});

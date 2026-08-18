import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from './AppText';
import { ruleStyles } from './PagedRules';
import { ARENAS, SUMMIT } from '../theme/arenas';
import { TierGlyph, Tier } from './TierGlyph';
import { fonts } from '../theme/fonts';
import { useTheme } from '../theme/ThemeContext';
import { radius, border } from '../theme/tokens';

/**
 * Every mode's rules, written as pages rather than paragraphs.
 *
 * They used to sit inline under each mode's leaderboard - eight paragraphs of
 * 12.5pt body text on Duels alone, which is a book, not a rulebook. Split into
 * one idea per section and handed to PagedRules, which fits as many as the
 * screen holds and no more.
 *
 * Kept in one file because the point is that all four read identically. Four
 * sets of rules living beside four different screens is how they drifted into
 * four different voices in the first place.
 */

function H({ children }: { children: React.ReactNode }) {
  const { colors } = useTheme();
  return <Text style={[ruleStyles.h2, { color: colors.text }]}>{children}</Text>;
}

function P({ children, first }: { children: React.ReactNode; first?: boolean }) {
  const { colors } = useTheme();
  return (
    <Text style={[first ? ruleStyles.body : ruleStyles.spaced, { color: colors.textMuted }]}>
      {children}
    </Text>
  );
}

/** A bordered block of value/label rows, the shape Impossible's tiers use. */
function Table({ rows }: { rows: [string, string, string?][] }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.table, { borderColor: colors.border }]}>
      {rows.map(([a, b, c]) => (
        <View key={a + b} style={styles.row}>
          <Text style={[styles.rowKey, { color: colors.text }]}>{a}</Text>
          <Text style={[styles.rowMid, { color: colors.textMuted }]}>{b}</Text>
          {c !== undefined && <Text style={[styles.rowEnd, { color: colors.text }]}>{c}</Text>}
        </View>
      ))}
    </View>
  );
}

export function duelRules(): React.ReactNode[] {
  return [
    <>
      <H>Setting up</H>
      <P first>
        Challenge a friend. You set the number they have to find and they set yours, and neither of
        you guesses until both are in.
      </P>
    </>,

    <>
      <H>Three rounds</H>
      <P first>A fresh number each round, always chosen by the other player.</P>
      <Table rows={[['Round 1', '', '7 attempts'], ['Round 2', '', '6 attempts'], ['Round 3', '', '5 attempts']]} />
      <P>
        You never play at the same time, and never see their board until the round is settled.
      </P>
    </>,

    <>
      <H>Winning</H>
      <P first>
        Fewer guesses takes the round. The same number of guesses is a tie, and if only one of you
        finds it at all, it is theirs.
      </P>
      <P>
        Most rounds after three wins the duel. Level after three and a fourth number decides it,
        with five attempts; tie that too and the duel is drawn.
      </P>
    </>,

    <>
      <H>What it is worth</H>
      <P first>
        Separate from your daily — no points, no streak, no place on the leaderboard.
      </P>
      <Table rows={[['Win', '', '80 XP'], ['Loss', '', '25 XP']]} />
    </>,
  ];
}

export function rushRules(): React.ReactNode[] {
  return [
    <>
      <H>Three minutes</H>
      <P first>
        Find one number, the next appears immediately, and you keep going until the clock runs out.
        Your score is how many you found.
      </P>
      <Table
        rows={[
          ['3:00', 'on the clock', 'once a day'],
          ['∞', 'guesses', 'no limit'],
          ['0', 'clues', 'colors only'],
          ['15 XP', 'a number', 'found'],
        ]}
      />
    </>,

    <>
      <H>Reading the colors</H>
      <P first>
        No clues and no limit on guesses — the clock is the only thing you spend. Blue means aim
        higher, red means lower, and the stronger the color the closer you are.
      </P>
    </>,

    <>
      <H>The clock</H>
      <P first>
        One run a day, starting the moment you press the button. Leaving stops it, and coming back
        gives you three seconds of countdown, so an interruption costs you nothing.
      </P>
      <P>Equal scores break on guesses used.</P>
    </>,
  ];
}

/**
 * `tiersFirst` puts the table before the prose, for the board screen.
 *
 * Somebody standing on the standings has already been told what the mode is by
 * the standings themselves - what they want is the shape of the climb: how deep
 * the tiers go and what each one costs them in attempts. In the rulebook, where
 * a first-time reader arrives, the paragraph still comes first.
 */
export function impossibleRules(opts?: { tiersFirst?: boolean }): React.ReactNode[] {
  const sections: React.ReactNode[] = [
    <>
      <H>The Impossible Climb</H>
      <P first>
        Seventy-five numbers, one after another, five guesses each. Everyone plays the same
        sequence this week, so how far you got compares directly. It resets on Monday.
      </P>
      <P>Clear level 75 and you have topped out. Summits rank on guesses used.</P>
    </>,

    <>
      <H>Health</H>
      <P first>
        You start every day at 100%. Running out of attempts costs health, not the climb — the same
        number is waiting. A miss costs 18% on the Ground, rising a point a tier to 22% in Orbit,
        so a day is four or five misses long.
      </P>
      <P>Solve a number you have never failed in two guesses and you take 10% back.</P>
    </>,

    <>
      <H>What each tier takes</H>
      <P first>
        The Ground and the Sky hand you a clue with every number. Above them the climb takes
        something away instead.
      </P>
      <P>
        Stratosphere hides the arrow: you learn how close you are, never which way. Thin air holds
        the shade back a guess, so you commit before you know. Orbit takes nothing — five guesses,
        full colours, no clue and no trick.
      </P>
    </>,

    <>
      <H>Checkpoints</H>
      <P first>
        Every fifth level is a checkpoint, and so is the first of a tier. You never start further
        back than your last one — clear 37 and stop, and tomorrow begins at 35.
      </P>
    </>,

    <>
      <H>Running out</H>
      <P first>
        Lose all your health and that is the day; you come back tomorrow at 100%, from your last
        checkpoint. Nothing else limits how long you play.
      </P>
    </>,

    <>
      <H>The five tiers</H>
      <P first>
        Fifteen levels each, five guesses a number. What changes is what a miss costs and whether a
        clue arrives at all. A number cleared pays 20 XP, a new tier 50.
      </P>
      <TierTable />
    </>,
  ];

  if (!opts?.tiersFirst) return sections;
  const tiers = sections[sections.length - 1];
  return [tiers, ...sections.slice(0, -1)];
}

/** Straight from the table the game reads, so it cannot drift. */
function TierTable() {
  const { colors } = useTheme();
  return (
    <View style={[styles.table, { borderColor: colors.border }]}>
      <View style={styles.row}>
        <View style={styles.swatch} />
        <Text style={[styles.tierName, styles.head, { color: colors.textMuted }]}>TIER</Text>
        <Text style={[styles.rowMid, styles.head, { color: colors.textMuted }]}>LEVELS</Text>
        <Text style={[styles.rowCol, styles.head, { color: colors.textMuted }]}>TRIES</Text>
        <Text style={[styles.tierFall, styles.head, { color: colors.textMuted }]}>FALL</Text>
      </View>
      {ARENAS.map((a, i) => {
        const next = ARENAS[i + 1];
        return (
          <View key={a.key} style={styles.row}>
            {/* The glyph rather than a colour chip, because the glyph is what
                a player meets on the board - three of the five arena colours
                are the same pale blue at this size, so a swatch column taught
                nothing and this one is a legend. */}
            {/* The glyph rather than a colour chip: it is what a player meets
                on the board, so the table doubles as its legend. The colour is
                the arena's own, which is the one place the five are shown
                together and can actually be told apart. */}
            <View style={styles.swatch}>
              <TierGlyph tier={a.key as Tier} color={a.accent} size={20} />
            </View>
            <Text style={[styles.tierName, { color: colors.text }]}>{a.name}</Text>
            <Text style={[styles.rowMid, { color: colors.text }]}>
              {a.from}–{next ? next.from - 1 : SUMMIT}
            </Text>
            <Text style={[styles.rowCol, { color: colors.text }]}>{a.attempts}</Text>
            <Text style={[styles.tierFall, { color: colors.text }]}>−{a.fall}%</Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  table: { borderWidth: border.hairline, borderRadius: radius.card, paddingVertical: 4, marginTop: 14 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 14, gap: 10 },
  rowKey: { fontSize: 14.5, fontFamily: fonts.extraBold, minWidth: 62 },
  rowMid: { flex: 1, fontSize: 14.5, fontFamily: fonts.extraBold, paddingRight: 8 },
  rowCol: { width: 46, textAlign: 'right', fontSize: 14.5, fontFamily: fonts.extraBold },
  rowEnd: { fontSize: 14.5, fontFamily: fonts.extraBold, textAlign: 'right' },
  // The tier table's own last column, because its rows are short and want
  // aligning. Everything else in a rules table is a phrase.
  tierFall: { width: 54, textAlign: 'right', fontSize: 14.5, fontFamily: fonts.extraBold },
  swatch: { width: 22, alignItems: 'center', justifyContent: 'center' },
  tierName: { fontSize: 14.5, fontFamily: fonts.extraBold, minWidth: 96 },
  // The header row is the same shape as the rows under it, only quieter -
  // four columns that each announced themselves differently read as four
  // separate tables sharing a border.
  head: { fontSize: 11, letterSpacing: 1 },
});

import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from './AppText';
import { ruleStyles } from './PagedRules';
import { ARENAS, SUMMIT } from '../theme/arenas';
import { TierGlyph, Tier } from './TierGlyph';
import { fonts } from '../theme/fonts';
import { useTheme } from '../theme/ThemeContext';

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
        Add someone as a friend and challenge them. Once they accept, you both choose: you set the
        number they have to find, and they set yours.
      </P>
      <P>
        Neither of you can guess until both numbers are in, so nobody starts while the other is
        still deciding.
      </P>
    </>,

    <>
      <H>Three rounds</H>
      <P first>A fresh number each round, always chosen by the other player.</P>
      <Table rows={[['Round 1', '', '7 attempts'], ['Round 2', '', '6 attempts'], ['Round 3', '', '5 attempts']]} />
      <P>
        You never play at the same time, and you never see their board until the round is settled.
        Finish a round and you wait for them — the next opens once you have both played it.
      </P>
    </>,

    <>
      <H>Winning a round</H>
      <P first>A round goes to whoever found the number in fewer guesses.</P>
      <P>
        Solve it in the same number of guesses and the round is a tie, shown in orange, counting for
        neither of you.
      </P>
      <P>
        If only one of you finds it, that round is theirs however many attempts it took. If neither
        of you does, it is a tie.
      </P>
    </>,

    <>
      <H>Ties</H>
      <P first>Whoever has taken more rounds after three wins the duel.</P>
      <P>
        Level after three — one round each, all three tied, or any other way of arriving even — and
        a fourth number decides it, with five attempts.
      </P>
      <P>If that one ties too, the duel is drawn and neither of you takes it.</P>
    </>,

    <>
      <H>What it is worth</H>
      <P first>
        Duels are separate from your daily. They change no points, no streak and no place on the
        leaderboard.
      </P>
      <Table rows={[['Win', '', '80 XP'], ['Loss', '', '25 XP']]} />
      <P>Both pay toward your level, because turning up is most of it.</P>
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
        No clues, and no limit on guesses — the clock is the only thing you spend.
      </P>
      <P>
        The colors work as they do everywhere else: blue means aim higher, red means lower, and the
        stronger the color the closer you are.
      </P>
    </>,

    <>
      <H>The clock</H>
      <P first>
        One run a day, and it starts the moment you press the button — not when the first guess
        lands.
      </P>
      <P>
        Leaving stops it. Close the app, switch tabs or go Home and the clock holds where it was.
        Coming back gives you three seconds of countdown before it starts again, so an interruption
        costs you nothing.
      </P>
    </>,

    <>
      <H>Ties</H>
      <P first>Equal scores break on guesses used.</P>
      <P>
        Two people who both found seven are separated by who spent fewer guesses getting there,
        because reading the colors quickly is the whole skill of the mode.
      </P>
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
        Seventy-five numbers, one after another, and everyone plays the same sequence this week —
        so how far you got compares directly. It resets on Monday. The Ground and the Sky give you
        one clue per number, and a weak one. From Stratosphere up there are none, and in Orbit a
        guess drops from six to five — the step that ends most weeks. Clear level 75 and you have
        topped out, and everyone who finishes is ranked on guesses used. Almost nobody will.
      </P>
    </>,

    <>
      <H>Health</H>
      <P first>
        You start every day at 100%. Running out of attempts on a number costs health, not the
        climb — the same number is waiting and you try it again. What it costs depends on how high
        you are: 21% on the Ground, rising a point a tier to 25% in Orbit. Solve one in three guesses or fewer and you take
        10% back, wherever you are. A fall always costs more than a clean solve returns, so a day
        is about four or five misses long.
      </P>
    </>,

    <>
      <H>Checkpoints</H>
      <P first>
        Every fifth level is a checkpoint, and so is the first level of a tier. You never start
        further back than your last one — clear level 37 and stop, and tomorrow begins at 35. It is
        also where you land at zero health.
      </P>
    </>,

    <>
      <H>Running out</H>
      <P first>
        Lose all your health and that is the day. Come back tomorrow at 100%. Nothing limits how
        long you play, and nothing carries over — every day is a clean attempt.
      </P>
    </>,

    <>
      <H>The five tiers</H>
      <P first>
        Fifteen levels each. Five guesses a number, all the way up — what changes is what a miss
        costs and whether a clue arrives at all. Every number cleared pays 20 XP toward your level,
        and reaching a new tier pays 50.
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
  table: { borderWidth: 1, borderRadius: 14, paddingVertical: 4, marginTop: 14 },
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

import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from './AppText';
import { ruleStyles } from './PagedRules';
import { ARENAS, SUMMIT } from '../theme/arenas';
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
          ['0', 'clues', 'colours only'],
          ['15 XP', 'a number', 'found'],
        ]}
      />
    </>,

    <>
      <H>Reading the colours</H>
      <P first>
        No clues, and no limit on guesses — the clock is the only thing you spend.
      </P>
      <P>
        The colours work as they do everywhere else: blue means aim higher, red means lower, and the
        stronger the colour the closer you are.
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
        because reading the colours quickly is the whole skill of the mode.
      </P>
    </>,
  ];
}

export function windowRules(): React.ReactNode[] {
  return [
    <>
      <H>Three probes</H>
      <P first>
        Three probe guesses, answered with the same colours as everywhere else: blue means aim
        higher, red means lower, and the stronger the colour the closer you are.
      </P>
      <P>They cost nothing and none of them ends the round.</P>
    </>,

    <>
      <H>Then commit</H>
      <P first>
        You commit to a range the number has to be inside — say 525 to 560. Your score is 101 minus
        the width of it.
      </P>
      <P>
        Miss, and it is nothing at all, however narrow the window was. That is the whole bet: three
        probes leave a range you know is safe, and halving it is worth twice as much with everything
        at stake.
      </P>
    </>,

    <>
      <H>What a window pays</H>
      <Table
        rows={[
          ['exact', '1 wide', '100'],
          ['±3', '7 wide', '94'],
          ['±5', '11 wide', '90'],
          ['±12', '25 wide', '76'],
          ['±25', '51 wide', '50'],
          ['±35', '71 wide', '30'],
        ]}
      />
      <P>One a day, the same number for everyone, and every point is an XP toward your level.</P>
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
        Fifty numbers, one after another, and everyone plays the same sequence this week — so how
        far you got compares directly. It resets on Monday.
      </P>
      <P>One clue per number, and it gets sharper the higher you go.</P>
      <P>
        Clear level 50 and you have topped out. Everyone who finishes is ranked on guesses used,
        so every wasted guess counts, including the ones down on the Ground.
      </P>
    </>,

    <>
      <H>Health</H>
      <P first>
        You start each day at 100%. Running out of attempts on a number costs health — not the
        climb. The same number is waiting and you try it again.
      </P>
      <P>
        What it costs depends on how high you are: 10% on the Ground, 50% in Orbit. Ten mistakes
        down there, two up here.
      </P>
      <P>
        Solve one in three guesses or fewer and you take 20% back. The easy tiers are where you
        bank the health that carries you through the hard ones.
      </P>
    </>,

    <>
      <H>Checkpoints</H>
      <P first>
        Every fifth level is a checkpoint, and so is the first level of every tier — so a fall can
        never cost you the tier you climbed into.
      </P>
      <P>Clear level 27 and stop, and tomorrow begins at 25.</P>
      <P>
        It is also where you land at zero health. In Orbit there are only two, at 41 and 46: the
        last stretch is the one place a fall costs more than four numbers.
      </P>
    </>,

    <>
      <H>One climb a day</H>
      <P first>
        Spent on your first guess rather than by opening it, so looking at the screen never costs
        you anything.
      </P>
      <P>
        Health goes back to 100% every day — whatever you had left when you stopped, the next day
        starts you full.
      </P>
      <P>
        The week's board keeps the deepest level you have ever reached, so a climb that ends badly
        still counts for everything it got through.
      </P>
    </>,

    <>
      <H>The five tiers</H>
      <P first>Ten levels each. Higher means fewer attempts and a costlier fall.</P>
      <TierTable />
      <P>Every number cleared pays 20 XP toward your level, and reaching a new tier pays 50.</P>
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
        <Text style={[styles.tierName, { color: colors.textMuted }]}>TIER</Text>
        <Text style={[styles.rowMid, { color: colors.textMuted }]}>LEVELS</Text>
        <Text style={[styles.rowCol, { color: colors.textMuted }]}>TRIES</Text>
        <Text style={[styles.rowEnd, { color: colors.textMuted }]}>FALL</Text>
      </View>
      {ARENAS.map((a, i) => {
        const next = ARENAS[i + 1];
        return (
          <View key={a.key} style={styles.row}>
            <View style={[styles.swatch, { backgroundColor: a.background }]} />
            <Text style={[styles.tierName, { color: colors.text }]}>{a.name}</Text>
            <Text style={[styles.rowMid, { color: colors.textMuted }]}>
              {a.from}–{next ? next.from - 1 : SUMMIT}
            </Text>
            <Text style={[styles.rowCol, { color: colors.text }]}>{a.attempts}</Text>
            <Text style={[styles.rowEnd, { color: colors.text }]}>−{a.fall}%</Text>
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
  rowMid: { flex: 1, fontSize: 13.5, fontFamily: fonts.medium },
  rowCol: { width: 46, textAlign: 'right', fontSize: 13.5, fontFamily: fonts.bold },
  rowEnd: { width: 52, textAlign: 'right', fontSize: 14.5, fontFamily: fonts.extraBold },
  swatch: { width: 14, height: 14, borderRadius: 4 },
  tierName: { fontSize: 14.5, fontFamily: fonts.extraBold, minWidth: 96 },
});

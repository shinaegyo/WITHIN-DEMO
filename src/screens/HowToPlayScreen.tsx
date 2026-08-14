import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { getTileAccent, getTileFill, getTileInk } from '../theme/colors';
import { fonts } from '../theme/fonts';
import { useTheme } from '../theme/ThemeContext';

/** Nothing in the game itself explains the colour system, so this screen does. */
export function HowToPlayScreen({ showTitle = true }: { showTitle?: boolean } = {}) {
  const { colors } = useTheme();

  // Rendered the same way as a real tile, so the page can't drift from the game.
  const Tile = ({
    direction,
    tier,
    guess,
    band,
  }: {
    direction: 'below' | 'above';
    tier: string;
    guess: number;
    band: string;
  }) => {
    const fill = getTileFill(direction, tier);
    const accent = getTileAccent(direction, tier);
    const ink = fill ? '#FFFFFF' : colors.text;
    // Same legibility floor the real tile uses for the palest two rungs.
    const bandInk = fill ? '#FFFFFF' : getTileInk(direction, tier);
    return (
      <View style={[styles.tile, { backgroundColor: fill ?? colors.surface }]}>
        <View style={[styles.accentBar, { backgroundColor: accent }]} />
        <Text style={[styles.tileGuess, { color: ink }]}>{guess}</Text>
        <Text style={[styles.tileBand, { color: bandInk }]}>{band}</Text>
        <Text style={[styles.tileArrow, { color: bandInk }]}>
          {direction === 'below' ? '▲' : '▼'}
        </Text>
      </View>
    );
  };

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {showTitle && <Text style={[styles.h1, { color: colors.text }]}>How to play</Text>}
      <Text style={[styles.body, { color: colors.textMuted }]}>
        Three numbers between 1 and 1000 are chosen each day. Everyone in the world gets the same
        three — only the order differs — and you play them one round at a time.
      </Text>

      <Text style={[styles.h2, { color: colors.text }]}>Which way to go</Text>
      <Text style={[styles.body, { color: colors.textMuted }]}>
        Blue means the answer is higher than your guess — aim up. Red means it's lower — aim down. The
        arrow says the same thing, so you can play by colour or by arrow.
      </Text>

      <View style={styles.group}>
        <Text style={[styles.groupLabel, { color: colors.textMuted }]}>TOO LOW — GO HIGHER</Text>
        <Tile direction="below" tier="vast" guess={200} band="500+ AWAY" />
        <Tile direction="below" tier="distant" guess={400} band="250–499 AWAY" />
        <Tile direction="below" tier="light" guess={650} band="100–249 AWAY" />
        <Tile direction="below" tier="medium" guess={750} band="25–99 AWAY" />
        <Tile direction="below" tier="dark" guess={785} band="11–24 AWAY" />
        <Tile direction="below" tier="intense" guess={795} band="WITHIN 10" />
      </View>

      <View style={styles.group}>
        <Text style={[styles.groupLabel, { color: colors.textMuted }]}>TOO HIGH — GO LOWER</Text>
        <Tile direction="above" tier="vast" guess={900} band="500+ AWAY" />
        <Tile direction="above" tier="distant" guess={600} band="250–499 AWAY" />
        <Tile direction="above" tier="light" guess={350} band="100–249 AWAY" />
        <Tile direction="above" tier="medium" guess={250} band="25–99 AWAY" />
        <Tile direction="above" tier="dark" guess={215} band="11–24 AWAY" />
        <Tile direction="above" tier="intense" guess={205} band="WITHIN 10" />
      </View>

      <Text style={[styles.body, { color: colors.textMuted, marginTop: 14 }]}>
        The stronger the colour, the closer you are. A faint tile with only a coloured edge means
        you're still a long way off; a fully coloured tile means you're nearly there.
      </Text>

      <Text style={[styles.h2, { color: colors.text }]}>Clues</Text>
      <Text style={[styles.body, { color: colors.textMuted }]}>
        Each round starts with one clue about that round's number, such as "the number is divisible
        by 3". Land a guess within 10 and a second, more specific clue unlocks for the rest of that
        round.
      </Text>

      <Text style={[styles.h2, { color: colors.text }]}>Rounds and attempts</Text>
      <Text style={[styles.body, { color: colors.textMuted }]}>
        Each round is tighter than the last: seven attempts in round 1, six in round 2, five in
        round 3.
      </Text>
      <Text style={[styles.body, { color: colors.textMuted, marginTop: 10 }]}>
        Cut it fine and it costs you. Solve a round on your very last attempt and the next round
        gives you one attempt fewer still, down to a minimum of five. Solve with even one attempt
        to spare and your limit stays exactly where it is.
      </Text>

      <Text style={[styles.h2, { color: colors.text }]}>If you run out of attempts</Text>
      <Text style={[styles.body, { color: colors.textMuted }]}>
        The round is over and it scores nothing, and no more points can be added for the rest of the
        day. You still play the rounds that are left and still see every number. Points are only
        collected while your day is unbroken.
      </Text>
      <Text style={[styles.body, { color: colors.textMuted, marginTop: 10 }]}>
        The number is revealed once the round ends, whether you found it or not.
      </Text>

      <Text style={[styles.h2, { color: colors.text }]}>Impossible</Text>
      <Text style={[styles.body, { color: colors.textMuted }]}>
        Numbers one after another. Six attempts each for the first nineteen, five from the
        twentieth, four from the fiftieth. One miss ends the run. Everyone plays the same numbers
        each week, so how far you got is worth comparing.
      </Text>
      <Text style={[styles.body, { color: colors.textMuted, marginTop: 10 }]}>
        It is called Impossible because it is. Four attempts for a number between 1 and 1000 is
        close to a coin toss, so a run ending at six or seven is a good one, not a failure.
      </Text>
      <Text style={[styles.body, { color: colors.textMuted, marginTop: 10 }]}>
        Five runs a day. Every run starts from the first number again, and the week's board keeps
        your deepest — so the five are attempts at one climb, not five separate scores.
      </Text>

      <Text style={[styles.h2, { color: colors.text }]}>Duelling a friend</Text>
      <Text style={[styles.body, { color: colors.textMuted }]}>
        Add someone as a friend and you can challenge them. Once they accept, you both get the same
        three numbers and the same seven, six and five attempts. Each round goes to whoever needed
        fewer guesses. Solve it in the same number and the round is a tie, shown in orange, counting
        for neither of you.
      </Text>
      <Text style={[styles.body, { color: colors.textMuted, marginTop: 10 }]}>
        Rounds are played one at a time. When you finish one you wait for them, and the next opens
        once you have both played it — so you always know how the duel stands before the next
        number. If all three end level, a fourth number decides it. If that ties too, the duel is
        drawn.
      </Text>
      <Text style={[styles.body, { color: colors.textMuted, marginTop: 10 }]}>
        You never play at the same time, and you never see their board until the round is settled.
        Duels are separate from your daily: they change no points, no streak and no leaderboard
        place.
      </Text>

      <Text style={[styles.h2, { color: colors.text }]}>Twist and Bonus days</Text>
      <Text style={[styles.body, { color: colors.textMuted }]}>
        Five days a week play by the rules above. The other two are marked, and the home screen
        says which is which. The Twist of the Week makes the day harder — fewer attempts, a clue
        withheld, or no clues at all. The Bonus of the Week does the opposite — extra attempts,
        clues opened early, or points multiplied.
      </Text>
      <Text style={[styles.body, { color: colors.textMuted, marginTop: 10 }]}>
        There are twenty-five of each, and everyone in the world gets the same two on the same
        days.
      </Text>

      <Text style={[styles.h2, { color: colors.text }]}>Scoring</Text>
      <Text style={[styles.body, { color: colors.textMuted }]}>
        Each round is worth up to 100, so a perfect day is 300.
      </Text>
      <View style={[styles.scoreBox, { borderColor: colors.border }]}>
        {([
          ['1st attempt', 100],
          ['2nd attempt', 90],
          ['3rd attempt', 80],
          ['4th attempt', 70],
          ['5th attempt', 60],
          ['6th attempt', 50],
          ['7th attempt', 40],
          ['Out of attempts', 0],
        ] as const).map(([label, points]) => (
          <View key={label} style={styles.scoreRow}>
            <Text style={[styles.scoreLabel, { color: colors.textMuted }]}>{label}</Text>
            <Text style={[styles.scoreValue, { color: colors.text }]}>{points}</Text>
          </View>
        ))}
      </View>

      <Text style={[styles.h2, { color: colors.text }]}>Streaks</Text>
      <Text style={[styles.body, { color: colors.textMuted }]}>
        Finish all three rounds without using a retry and your streak grows. Miss a day, get
        eliminated, or take a retry, and it starts again from zero — a streak is meant to be earned
        outright. New numbers arrive at midnight, your time.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 24, paddingBottom: 60 },
  h1: { fontSize: 30, fontFamily: fonts.logo, letterSpacing: -0.6, marginBottom: 14 },
  h2: { fontSize: 17, fontFamily: fonts.extraBold, marginTop: 28, marginBottom: 6 },
  body: { fontSize: 15, fontFamily: fonts.medium, lineHeight: 22 },
  group: { marginTop: 18 },
  groupLabel: {
    fontSize: 10,
    fontFamily: fonts.bold,
    letterSpacing: 1,
    marginBottom: 8,
  },
  tile: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 46,
    borderRadius: 12,
    paddingLeft: 18,
    paddingRight: 14,
    marginBottom: 7,
    overflow: 'hidden',
  },
  accentBar: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 6 },
  tileGuess: { flex: 1, fontSize: 18, fontFamily: fonts.extraBold },
  tileBand: { fontSize: 10, fontFamily: fonts.extraBold, letterSpacing: 0.6 },
  tileArrow: { fontSize: 14, marginLeft: 10 },
  scoreBox: { borderWidth: 1, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 6, marginTop: 12 },
  scoreRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 7 },
  scoreLabel: { fontSize: 14, fontFamily: fonts.medium },
  scoreValue: { fontSize: 15, fontFamily: fonts.extraBold },
});

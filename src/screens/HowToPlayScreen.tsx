import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { getTileAccent, getTileFill } from '../theme/colors';
import { fonts } from '../theme/fonts';
import { useTheme } from '../theme/ThemeContext';

/** Nothing in the game itself explains the colour system, so this screen does. */
export function HowToPlayScreen() {
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
    return (
      <View style={[styles.tile, { backgroundColor: fill ?? colors.surface }]}>
        <View style={[styles.accentBar, { backgroundColor: accent }]} />
        <Text style={[styles.tileGuess, { color: ink }]}>{guess}</Text>
        <Text style={[styles.tileBand, { color: fill ? '#FFFFFF' : accent }]}>{band}</Text>
        <Text style={[styles.tileArrow, { color: fill ? '#FFFFFF' : accent }]}>
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
      <Text style={[styles.h1, { color: colors.text }]}>How to play</Text>
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
        <Tile direction="below" tier="light" guess={140} band="100+ AWAY" />
        <Tile direction="below" tier="medium" guess={365} band="25–99 AWAY" />
        <Tile direction="below" tier="dark" guess={410} band="11–24 AWAY" />
        <Tile direction="below" tier="intense" guess={421} band="WITHIN 10" />
      </View>

      <View style={styles.group}>
        <Text style={[styles.groupLabel, { color: colors.textMuted }]}>TOO HIGH — GO LOWER</Text>
        <Tile direction="above" tier="light" guess={890} band="100+ AWAY" />
        <Tile direction="above" tier="medium" guess={500} band="25–99 AWAY" />
        <Tile direction="above" tier="dark" guess={445} band="11–24 AWAY" />
        <Tile direction="above" tier="intense" guess={430} band="WITHIN 10" />
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
        Round 1 gives you seven attempts. Solve a round and you move on to the next one.
      </Text>
      <Text style={[styles.body, { color: colors.textMuted, marginTop: 10 }]}>
        Cut it fine and it costs you. Solve a round on your very last attempt and the next round
        gives you one attempt fewer: 7, then 6, then 5, then 4. It never drops below 3. Solve with
        even one attempt to spare and your limit stays exactly where it is.
      </Text>
      <Text style={[styles.body, { color: colors.textMuted, marginTop: 10 }]}>
        Run out of attempts and your day ends there. You keep the points you've already earned, and
        you can watch an ad to retry the round you lost.
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
        Finish all three rounds to keep your streak. Miss a day, or get eliminated without
        retrying, and it starts again from zero. New numbers arrive at midnight, your time.
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

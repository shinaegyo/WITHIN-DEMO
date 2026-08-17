import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Text } from '../components/AppText';
import { getTileAccent, getTileFill, getTileInk } from '../theme/colors';
import { useTrack } from '../utils/useTrack';
import { fonts } from '../theme/fonts';
import { useTheme } from '../theme/ThemeContext';

/** Space between two sections sharing a page. */
const GAP = 26;
/** styles.page, top and bottom together. */
const PAGE_PADDING = 40;

/** Nothing in the game itself explains the colour system, so this screen does. */
export function HowToPlayScreen({ showTitle = true }: { showTitle?: boolean } = {}) {
  // The calm track. Outside the games the app is not silent any more - it has
  // its own room rather than the game's.
  useTrack('home');
  const { width } = useWindowDimensions();
  const [page, setPage] = useState(0);
  const [heights, setHeights] = useState<number[]>([]);
  const [viewport, setViewport] = useState(0);
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

  // The rules in reading order. Where they break into pages is worked out from
  // how tall they actually turn out to be, not decided here.
  const sections: React.ReactNode[] = [
    <>
      {showTitle && <Text style={[styles.h1, { color: colors.text }]}>How to play</Text>}
      <Text style={[styles.body, { color: colors.textMuted }]}>
        Three numbers between 1 and 1000 are chosen each day. Everyone gets the same three, in the
        same order, and each round asks for them a different way.
      </Text>
    </>,

    <>
      <Text style={[styles.h2, { color: colors.text }]}>Which way to go</Text>
      <Text style={[styles.body, { color: colors.textMuted }]}>
        Blue means the answer is higher than your guess — aim up. Red means it's lower — aim down.
        The arrow says the same thing, so you can play by color or by arrow.
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
        The stronger the color, the closer you are. A faint tile with only a colored edge means
        you're still a long way off; a fully colored tile means you're nearly there.
      </Text>
    </>,

    <>
      <Text style={[styles.h2, { color: colors.text }]}>Round one — call your shot</Text>
      <Text style={[styles.body, { color: colors.textMuted }]}>
        Before your first guess, say how many guesses you need. Make the call and take the prize.
        Find it later than you said and it pays 5; never find it and it pays 3.
      </Text>
      <View style={[styles.scoreBox, { borderColor: colors.border }]}>
        {([
          ['1 guess', 30],
          ['2 guesses', 20],
          ['3 guesses', 18],
          ['4 guesses', 16],
          ['5 guesses', 14],
          ['6 guesses', 12],
          ['7 guesses', 10],
        ] as const).map(([label, points]) => (
          <View key={label} style={styles.scoreRow}>
            <Text style={[styles.scoreLabel, { color: colors.textMuted }]}>{label}</Text>
            <Text style={[styles.scoreValue, { color: colors.text }]}>{points}</Text>
          </View>
        ))}
      </View>
    </>,

    <>
      <Text style={[styles.h2, { color: colors.text }]}>Round two — choose your clue</Text>
      <Text style={[styles.body, { color: colors.textMuted }]}>
        One clue, and you pick what kind: how the number is written, what it is made of, or where
        it sits. You only find out what it says after you choose. Six guesses, paying 16 down to 6,
        and 3 if it gets away.
      </Text>
    </>,

    <>
      <Text style={[styles.h2, { color: colors.text }]}>Round three — name a range</Text>
      <Text style={[styles.body, { color: colors.textMuted }]}>
        Three free guesses first. They cost nothing and none of them ends the round — then you name
        a range you believe the number is inside. The narrower it is, the more it pays; naming it
        exactly pays most of all. Outside pays 3.
      </Text>
      <View style={[styles.scoreBox, { borderColor: colors.border }]}>
        {([
          ['exactly', 24],
          ['1 either side', 18],
          ['3 either side', 16],
          ['8 either side', 12],
          ['18 either side', 8],
          ['35 either side', 4],
        ] as const).map(([label, points]) => (
          <View key={label} style={styles.scoreRow}>
            <Text style={[styles.scoreLabel, { color: colors.textMuted }]}>{label}</Text>
            <Text style={[styles.scoreValue, { color: colors.text }]}>{points}</Text>
          </View>
        ))}
      </View>
    </>,

    <>
      <Text style={[styles.h2, { color: colors.text }]}>If you run out of attempts</Text>
      <Text style={[styles.body, { color: colors.textMuted }]}>
        The round is over and it pays 3 — turning up for a number you never found is worth more
        than nothing. Every round stands on its own, so a missed number costs you that round and
        nothing else.
      </Text>
      <Text style={[styles.body, { color: colors.textMuted, marginTop: 10 }]}>
        The number is revealed once the round ends, whether you found it or not.
      </Text>
    </>,

    <>
      <Text style={[styles.h2, { color: colors.text }]}>Streaks and levels</Text>
      <Text style={[styles.body, { color: colors.textMuted }]}>
        Finish all three rounds without using a retry and your streak grows. Miss a round, miss a
        day, or take a retry, and it starts again from zero — a streak is meant to be earned
        outright. New numbers arrive at midnight, your time.
      </Text>
      <Text style={[styles.body, { color: colors.textMuted, marginTop: 10 }]}>
        Your level is the other half, and everything pays into it. The daily pays its points, plus
        fifty for all three rounds won. Impossible pays twenty a number and fifty for reaching a
        new tier. A duel pays eighty to win and twenty-five to lose. Practice pays nothing, which
        is what makes it practice. Each level costs a little more than the last.
      </Text>
    </>,

    <>
      <Text style={[styles.h2, { color: colors.text }]}>The daily challenge</Text>
      <Text style={[styles.body, { color: colors.textMuted }]}>
        Everything above. Three rounds, once a day, the same numbers for everyone — this is the
        game, and the only mode that scores points, keeps a streak and places you on the
        leaderboard.
      </Text>
      {/* The modes used to be spelled out here as well: Impossible's tiers and
          lives, the duel's rounds and ties, and eventually Rush too. Every one of them already explains itself on its own screen,
          under How it works, next to the button that starts it — so this page
          was a second copy of the same rules, kept somewhere else and going
          stale on its own schedule.

          What stays is what is true in every mode: which way the colours
          point, what the clue is, how a round runs out, and that the daily is
          the only thing that scores. */}
      <Text style={[styles.body, { color: colors.textMuted, marginTop: 10 }]}>
        It also comes first. The other modes stay shut until today's three rounds are done, every
        day — they are what the day opens into, not an alternative to it. Each one explains its own
        rules on the way in.
      </Text>
    </>,

  ];

  const count = sections.length;
  const measured = viewport > 0 && heights.length === count && heights.every((h) => h > 0);

  /**
   * Fill each page before starting the next.
   *
   * Grouping the sections by hand meant guessing how tall they are, and a guess
   * is only ever right for one screen: the same grouping that fits a phone
   * leaves a tablet two-thirds empty. So the sections are measured once,
   * off-screen, and a page ends where the next one genuinely would not fit.
   */
  const pages = useMemo(() => {
    if (!measured) return [] as number[][];
    const room = viewport - PAGE_PADDING;
    const out: number[][] = [];
    let current: number[] = [];
    let used = 0;
    for (let i = 0; i < count; i++) {
      const needed = current.length === 0 ? heights[i] : heights[i] + GAP;
      // Breaking early is worse than overflowing: a page holding one short
      // section is the empty screen this is meant to remove, and a page that
      // runs a little long simply scrolls. So a break needs the page to be
      // reasonably full already - otherwise the next section comes along too.
      if (current.length > 0 && used + needed > room && used >= room * 0.6) {
        out.push(current);
        current = [];
        // A section taller than the screen still gets its own page and scrolls
        // there, rather than dragging a short neighbour into the overflow.
        used = heights[i];
      } else {
        used += needed;
      }
      current.push(i);
    }
    if (current.length > 0) out.push(current);
    return out;
  }, [measured, heights, viewport, count]);

  return (
    <View style={[styles.wrap, { backgroundColor: colors.background }]}>
      <View style={styles.flex} onLayout={(e) => setViewport(e.nativeEvent.layout.height)}>
        {!measured && (
          // The measuring pass: laid out at the real page width so the text
          // wraps exactly as it will, then dropped once the heights are in.
          <View style={[styles.measure, { width }]} pointerEvents="none">
            {sections.map((section, i) => (
              <View
                key={i}
                onLayout={(e) => {
                  const h = e.nativeEvent.layout.height;
                  setHeights((prev) => {
                    if (prev[i] === h) return prev;
                    const next = prev.slice();
                    next[i] = h;
                    // Keep the array dense, so `every` means what it says.
                    for (let k = 0; k < count; k++) if (next[k] === undefined) next[k] = 0;
                    return next;
                  });
                }}
              >
                {section}
              </View>
            ))}
          </View>
        )}

        {measured && (
          <ScrollView
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            scrollEventThrottle={16}
            onScroll={(e) => setPage(Math.round(e.nativeEvent.contentOffset.x / width))}
          >
            {pages.map((group, p) => (
              <ScrollView
                key={p}
                style={{ width }}
                contentContainerStyle={styles.page}
                showsVerticalScrollIndicator={false}
              >
                {group.map((i, n) => (
                  <View key={i} style={n === 0 ? undefined : { marginTop: GAP }}>
                    {sections[i]}
                  </View>
                ))}
              </ScrollView>
            ))}
          </ScrollView>
        )}
      </View>

      {/* One dot per page. A horizontal pager gives no other sign that there is
          more to come, where a scrollbar would have. */}
      <View style={styles.dots}>
        {pages.map((_, i) => (
          <View
            key={i}
            style={[styles.dot, { backgroundColor: i === page ? colors.text : colors.border }]}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  flex: { flex: 1 },
  measure: { position: 'absolute', left: 0, top: 0, opacity: 0, paddingHorizontal: 22 },
  page: { flexGrow: 1, paddingHorizontal: 22, paddingTop: 16, paddingBottom: 24 },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 6, paddingVertical: 14 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  h1: { fontSize: 30, fontFamily: fonts.logo, letterSpacing: -0.6, marginBottom: 14 },
  // Space between sections is the pager's business, not the heading's.
  h2: { fontSize: 17, fontFamily: fonts.extraBold, marginBottom: 6 },
  body: { fontSize: 15, fontFamily: fonts.medium, lineHeight: 22 },
  group: { marginTop: 18 },
  groupLabel: { fontSize: 10, fontFamily: fonts.bold, letterSpacing: 1, marginBottom: 8 },
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

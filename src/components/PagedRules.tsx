import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Text } from './AppText';
import { ScreenTitle } from './ScreenTitle';
import { fonts } from '../theme/fonts';
import { useTheme } from '../theme/ThemeContext';
import { playTap } from '../utils/sound';
import { radius, border } from '../theme/tokens';

/** Space between two sections sharing a page. */
const GAP = 26;
/** styles.page, top and bottom together. */
const PAGE_PADDING = 40;

/**
 * A rulebook, paged rather than poured down one screen.
 *
 * Extracted from HowToPlayScreen, which had worked this way for the game-wide
 * rules while every mode explained itself in eight paragraphs stacked under its
 * leaderboard. Reading those was reading a book; this is the same content one
 * idea at a time.
 *
 * The pages are worked out rather than written down. Grouping sections by hand
 * means guessing how tall they are, and a guess is only ever right for one
 * screen size - the grouping that fits a phone leaves a tablet two-thirds
 * empty. So every section is measured once, off-screen, at the real page width,
 * and a page ends where the next section genuinely would not fit.
 */
export function PagedRules({
  title,
  onBack,
  sections,
}: {
  title: string;
  onBack: () => void;
  sections: React.ReactNode[];
}) {
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const [page, setPage] = useState(0);
  const [heights, setHeights] = useState<number[]>([]);
  const [viewport, setViewport] = useState(0);

  const count = sections.length;
  const measured = viewport > 0 && heights.length === count && heights.every((h) => h > 0);

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
      // runs a little long simply scrolls.
      if (current.length > 0 && used + needed > room && used >= room * 0.6) {
        out.push(current);
        current = [];
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
      <ScreenTitle title={title} onBack={onBack} />

      <View style={styles.flex} onLayout={(e) => setViewport(e.nativeEvent.layout.height)}>
        {!measured && (
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

/**
 * The shared type for rule pages, so all four modes read identically.
 *
 * Body copy is 15.5pt here against the 12.5 these rules were set at inline.
 * That size was chosen to keep eight paragraphs on one screen, which was the
 * wrong problem to solve - once the pages do that work, the type can be the
 * size someone would actually want to read.
 */
export const ruleStyles = StyleSheet.create({
  h2: { fontSize: 21, fontFamily: fonts.extraBold, letterSpacing: -0.4, marginBottom: 10 },
  body: { fontSize: 15.5, fontFamily: fonts.medium, lineHeight: 24 },
  spaced: { fontSize: 15.5, fontFamily: fonts.medium, lineHeight: 24, marginTop: 12 },
});

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  flex: { flex: 1 },
  measure: { position: 'absolute', opacity: 0, paddingHorizontal: 22 },
  page: { paddingHorizontal: 22, paddingTop: 12, paddingBottom: 28 },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 7, paddingVertical: 16 },
  dot: { width: 7, height: 7, borderRadius: 4 },
});

/**
 * The way in, identical on all four modes.
 *
 * Outlined rather than filled: every one of these screens already has a solid
 * button that starts the mode, and the rules must never be the thing the eye
 * lands on first.
 */
export function RulesButton({ onPress }: { onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={() => {
        playTap();
        onPress();
      }}
      style={({ pressed }) => [
        buttonStyles.button,
        { borderColor: colors.border, opacity: pressed ? 0.6 : 1 },
      ]}
    >
      <Text style={[buttonStyles.label, { color: colors.textMuted }]}>How to play</Text>
    </Pressable>
  );
}

const buttonStyles = StyleSheet.create({
  button: {
    borderWidth: border.hairline,
    borderRadius: radius.card,
    paddingVertical: 13,
    alignItems: 'center',
    alignSelf: 'stretch',
    marginTop: 22,
  },
  label: { fontSize: 14, fontFamily: fonts.extraBold },
});

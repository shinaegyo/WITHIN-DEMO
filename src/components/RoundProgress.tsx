import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { Text } from './AppText';
import { RoundSummary } from '../lib/api';
import { feedbackColors } from '../theme/colors';
import { fonts } from '../theme/fonts';
import { useTheme } from '../theme/ThemeContext';

interface Props {
  /**
   * The round whose board is on screen — not the day's counter. Those differ
   * for the moment between solving a round and starting the next one, and the
   * bar has to describe what the player is actually looking at.
   */
  activeRound: number;
  totalRounds: number;
  rounds: RoundSummary[];
  totalScore: number;
  /** COLD / THE CLUE / THE BET — what this round is, said next to its number. */
  kindLabel?: string;
  /** False when the header is already carrying the day's score. */
  showScore?: boolean;
}

/**
 * One segment per round, so a player can see at a glance where they are in the
 * day and what each finished round scored.
 */
function Segment({
  base,
  fillColor,
  finished,
  score,
}: {
  base: string;
  fillColor: string | null;
  finished: boolean;
  score: number | null;
}) {
  // Starts full when the round was already finished on mount — reopening the
  // app mid-day shouldn't replay every earlier round's animation.
  const progress = useRef(new Animated.Value(finished ? 1 : 0)).current;
  const previously = useRef(finished);

  useEffect(() => {
    if (finished === previously.current) return;
    previously.current = finished;
    Animated.timing(progress, {
      toValue: finished ? 1 : 0,
      duration: 340,
      // Width can't be driven natively.
      useNativeDriver: false,
    }).start();
  }, [finished, progress]);

  return (
    <View style={[styles.segment, { backgroundColor: base }]}>
      {fillColor && (
        <Animated.View
          style={[
            styles.fill,
            {
              backgroundColor: fillColor,
              width: progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }),
            },
          ]}
        />
      )}
      {score !== null && (
        <Animated.Text style={[styles.segmentText, { opacity: progress }]}>{score}</Animated.Text>
      )}
    </View>
  );
}

export function RoundProgress({
  activeRound,
  totalRounds,
  rounds,
  totalScore,
  kindLabel,
  showScore = true,
}: Props) {
  const { colors } = useTheme();

  const byRound = new Map(rounds.map((r) => [r.round, r]));

  return (
    <View style={styles.wrap}>
      <View style={styles.headRow}>
        <Text style={[styles.label, { color: colors.textMuted }]}>
          ROUND {activeRound} OF {totalRounds}
          {kindLabel ? ` · ${kindLabel}` : ''}
        </Text>
        {/* The number alone. A total shown against 300 turns a good day into a
            percentage of a maximum almost nobody reaches. */}
        {showScore && (
          <Text style={[styles.score, { color: colors.text }]}>
            {totalScore}
            <Text style={[styles.scoreMax, { color: colors.textMuted }]}> PTS</Text>
          </Text>
        )}
      </View>

      <View style={styles.bar}>
        {Array.from({ length: totalRounds }).map((_, i) => {
          const n = i + 1;
          const r = byRound.get(n);
          const won = r?.status === 'won';
          const lost = r?.status === 'lost';
          const finished = won || lost;
          const active = n === activeRound && !finished;

          return (
            <Segment
              key={n}
              // The result sweeps across whatever the segment already was, so
              // the round being played fills rather than being replaced.
              base={active ? colors.accent : colors.border}
              fillColor={won ? feedbackColors.correct : lost ? feedbackColors.oneAway : null}
              finished={finished}
              score={won ? (r?.score ?? 0) : null}
            />
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // flexShrink 0: the centred sheet beside it is flex 1, and a sibling with
  // no floor gets squeezed to nothing by it.
  wrap: { gap: 6, flexShrink: 0 },
  headRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  metaRow: { flexDirection: 'row', alignItems: 'baseline', gap: 10 },
  clock: { fontSize: 12, fontFamily: fonts.bold, fontVariant: ['tabular-nums'] },
  label: { fontSize: 10, fontFamily: fonts.bold, letterSpacing: 1.2 },
  score: { fontSize: 16, fontFamily: fonts.extraBold },
  scoreMax: { fontSize: 12, fontFamily: fonts.bold },
  bar: { flexDirection: 'row', gap: 6 },
  segment: {
    flex: 1,
    height: 8,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  fill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    borderRadius: 4,
  },
  segmentText: {
    color: '#FFFFFF',
    fontSize: 7,
    fontFamily: fonts.bold,
  },
});

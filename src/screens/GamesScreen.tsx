import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '../components/AppText';
import { ScreenTitle } from '../components/ScreenTitle';
import { HomeStatus, loadHomeStatus } from '../lib/api';
import { feedbackColors } from '../theme/colors';
import { useTrack } from '../utils/useTrack';
import { fonts } from '../theme/fonts';
import { useTheme } from '../theme/ThemeContext';
import { playTap } from '../utils/sound';

/**
 * Everything that is not the daily.
 *
 * Each row says what is true right now rather than only what it is - whose turn
 * it is, how many runs are left, who holds the crown. That status is the reason
 * to open one of these, and it was the one thing a list of names could not say.
 */
export function GamesScreen({
  onDuels,
  onImpossible,
  onRush,
  onWindow,
  onPractice,
  practiceLeft,
}: {
  onDuels: () => void;
  onImpossible: () => void;
  onRush: () => void;
  onWindow: () => void;
  onPractice: () => void;
  practiceLeft: number | null;
}) {
  // The Games tab is the game section, so it carries the game section's
  // music. Left to inherit it was silent arriving from Home and playing
  // arriving back from Rush, which is the worst of both.
  useTrack('game');
  const { colors } = useTheme();
  const [status, setStatus] = useState<HomeStatus | null>(null);

  const load = useCallback(() => {
    loadHomeStatus()
      .then(setStatus)
      .catch(() => {
        /* the rows still work without their status lines */
      });
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 20000);
    return () => clearInterval(id);
  }, [load]);

  // Named for what it rehearses. Sitting under three modes, "practice round"
  // read as practice for those - and it is not: it is one number played the way
  // the daily plays, with nothing counted.
  const practiceLabel =
    practiceLeft === null
      ? 'One number, played like the daily. Nothing counted.'
      : practiceLeft === 0
        ? 'One number, played like the daily. None left today.'
        : `One number, played like the daily. ${practiceLeft} left today.`;

  const rows = [
    {
      label: 'Duel',
      sub: 'You pick their number, they pick yours',
      status: status && status.duelsWaiting > 0 ? `${status.duelsWaiting} waiting on you` : 'Start one',
      urgent: !!status && status.duelsWaiting > 0,
      onPress: onDuels,
    },
    {
      label: 'The Impossible Climb',
      sub: 'A climb that keeps your place all week',
      status: status
        ? status.impossible.sessionsLeft === 0 && status.impossible.lives === 0
          ? `You are on level ${status.impossible.level}`
          : status.impossible.sessionsLeft === 0
            ? `Level ${status.impossible.level} · ${status.impossible.lives * 20}% health`
            : `Level ${status.impossible.level} · ready`
        : '',
      urgent: false,
      onPress: onImpossible,
    },
    {
      label: 'Window',
      sub: 'Three probes, then how sure are you?',
      // What happened, once it has. "One a day" is a rule, and a rule is only
      // worth saying while it still governs something you can do.
      status: status?.window.played
        ? status.window.inside
          ? `${status.window.score} points`
          : 'Missed today'
        : 'One a day',
      urgent: false,
      onPress: onWindow,
    },
    {
      label: 'Rush',
      sub: 'Three minutes, as many numbers as you can find',
      // A run still on the clock is the one case that must stay pressable -
      // somebody who left mid-run has to be able to get back to it.
      status: status?.rush.running
        ? 'Still running'
        : status?.rush.played
          ? `${status.rush.found} found`
          : 'One run a day',
      urgent: !!status?.rush.running,
      onPress: onRush,
    },
  ];

  return (
    <ScrollView
      style={[styles.wrap, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
    >
      <ScreenTitle title="Games" />
      {/* Every row answers a press, played or not.

          They used to dim and go dead once the day's game was spent, which
          read as "nothing here" - but behind each of these is the day's
          standings, and finishing is exactly when somebody wants to see where
          they landed. The status line already says it has been played; a row
          that refuses to open takes the result away with the game. */}
      {rows.map((r) => (
        <Pressable
          key={r.label}
          onPress={() => {
            playTap();
            r.onPress();
          }}
          style={({ pressed }) => [
            styles.row,
            {
              backgroundColor: pressed ? colors.surfaceAlt : colors.surface,
              borderColor: colors.border,
            },
          ]}
        >
          <View style={styles.main}>
            {/* Two lines. "The Impossible Climb" is four words and one line
                clipped it to "The Impossibl...", which is the one row here
                somebody has to be able to read. */}
            <Text style={[styles.label, { color: colors.text }]} numberOfLines={2}>
              {r.label}
            </Text>
            <Text style={[styles.sub, { color: colors.textMuted }]} numberOfLines={2}>
              {r.sub}
            </Text>
          </View>
          <Text
            style={[styles.status, { color: r.urgent ? feedbackColors.correct : colors.textMuted }]}
            numberOfLines={1}
          >
            {r.status}
          </Text>
          <Text style={[styles.arrow, { color: colors.textMuted }]}>›</Text>
        </Pressable>
      ))}

      {/* An action, so it looks like one. A left-aligned line of bold text was
          a link pretending not to be a button. */}
      <View style={[styles.divider, { backgroundColor: colors.border }]} />

      <Pressable
        disabled={practiceLeft === 0}
        onPress={() => {
          playTap();
          onPractice();
        }}
        style={({ pressed }) => [
          styles.practice,
          practiceLeft === 0
            ? { backgroundColor: colors.surfaceAlt, borderColor: colors.border, borderWidth: 1 }
            : { backgroundColor: colors.text, opacity: pressed ? 0.85 : 1 },
        ]}
      >
        <Text
          style={[
            styles.practiceText,
            { color: practiceLeft === 0 ? colors.textMuted : colors.background },
          ]}
        >
          Practice the Daily
        </Text>
      </Pressable>
      <Text style={[styles.practiceSub, { color: colors.textMuted }]}>
        {practiceLeft === 0 ? 'All three played today · new numbers at midnight' : practiceLabel}
      </Text>

      <Text style={[styles.note, { color: colors.textMuted }]}>
        None of these touch your points, streak or place on the leaderboard. That is the daily, and
        it is the only thing that counts.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  content: { padding: 18, gap: 9 },
  screenTitle: {
    fontSize: 26,
    fontFamily: fonts.extraBold,
    marginBottom: 4,
    letterSpacing: -0.4,
    textAlign: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 18,
    // Twice the height: four rows and a note left most of the screen empty, and
    // a row you can hit without looking is worth more than the space it saves.
    paddingVertical: 30,
    paddingHorizontal: 18,
    gap: 10,
  },
  main: { flex: 1, minWidth: 0 },
  label: { fontSize: 17, fontFamily: fonts.extraBold },
  sub: { fontSize: 12, fontFamily: fonts.medium, marginTop: 3 },
  status: {
    fontSize: 12,
    fontFamily: fonts.bold,
    textAlign: 'right',
    flexShrink: 1,
    maxWidth: '46%',
  },
  arrow: { fontSize: 16, fontFamily: fonts.bold, marginTop: -2 },
  divider: { height: 1, marginTop: 20, marginHorizontal: 40 },
  practice: {
    marginTop: 18,
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
  },
  practiceText: { fontSize: 15, fontFamily: fonts.extraBold },
  practiceSub: { fontSize: 11.5, fontFamily: fonts.medium, textAlign: 'center', marginTop: 8 },
  note: {
    fontSize: 12,
    fontFamily: fonts.medium,
    lineHeight: 18,
    marginTop: 16,
    paddingHorizontal: 2,
    textAlign: 'center',
  },
});

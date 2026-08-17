import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '../components/AppText';
import { ScreenTitle } from '../components/ScreenTitle';
import { HomeStatus, loadHomeStatus } from '../lib/api';
import { feedbackColors } from '../theme/colors';
import { useTrack } from '../utils/useTrack';
import { useDailyGameContext } from '../state/DailyGameContext';
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
interface Row {
  label: string;
  sub: string;
  status: string;
  urgent: boolean;
  onPress: () => void;
}

export function GamesScreen({
  onDuels,
  onImpossible,
  onRush,
  onPractice,
  practiceLeft,
}: {
  onDuels: () => void;
  onImpossible: () => void;
  onRush: () => void;
  onPractice: () => void;
  practiceLeft: number | null;
}) {
  // The Games tab is the game section, so it carries the game section's
  // music. Left to inherit it was silent arriving from Home and playing
  // arriving back from Rush, which is the worst of both.
  useTrack('game');
  const { colors } = useTheme();
  // The daily is the game; these are what it unlocks. Reaching them without
  // playing it - the Games tab is one swipe from Home - let somebody spend
  // their evening on Rush and never see the thing everybody else played.
  const { game } = useDailyGameContext();
  // No exemption. There was one for days before the points started, on the
  // grounds that a day scoring toward nothing should not charge admission -
  // but it made the rule untestable on the only day anybody wanted to test it,
  // and it expires on its own anyway. Finish the three rounds, or come back.
  const locked = !game || game.dayStatus === 'playing';
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

  /**
   * Grouped by what each one asks of you, rather than listed.
   *
   * The old order opened with Duel - the one mode a player on their own cannot
   * start - which is the worst possible first row on a screen somebody is
   * scanning to find something to do. And four modes in a flat list read as
   * four of the same thing, when the actual difference between them is what
   * they cost you: a week of attention, three minutes, or another person.
   *
   * The headings carry that, so the shape of the game is legible without
   * opening a rulebook.
   */
  const groups: { label: string; rows: Row[] }[] = [
    {
      label: 'ALL WEEK',
      rows: [
        {
          label: 'The Impossible Climb',
          sub: 'Fifty numbers. Your place is kept between days',
          status: status
            ? status.impossible.summit
              ? 'Topped out this week'
              : status.impossible.sessionsLeft === 0 && status.impossible.health === 0
                ? `You are on level ${status.impossible.level}`
                : status.impossible.sessionsLeft === 0
                  ? `Level ${status.impossible.level} · ${status.impossible.health}% health`
                  : `Level ${status.impossible.level} · ready`
            : '',
          urgent: false,
          onPress: onImpossible,
        },
      ],
    },
    {
      label: 'ONE A DAY',
      rows: [
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
      ],
    },
    {
      // Not "with a friend" any more: the queue pairs you with whoever is here.
      label: 'PLAY SOMEBODY',
      rows: [
        {
          label: 'Duel',
          sub: 'A friend or a stranger. You pick their number, they pick yours',
          // Waiting outlives the duels screen, so this is the only place most
          // players will find out it is still going on.
          status: status?.queued
            ? 'Waiting for an opponent'
            : status && status.duelsWaiting > 0
              ? `${status.duelsWaiting} waiting on you`
              : 'Start one',
          urgent: !!status && (status.duelsWaiting > 0 || status.queued),
          onPress: onDuels,
        },
      ],
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
      {locked && (
        <Text style={[styles.locked, { color: colors.textMuted }]}>
          Play today's three rounds first. These open when the daily is done.
        </Text>
      )}

      {groups.map((group) => (
        <React.Fragment key={group.label}>
          <Text style={[styles.group, { color: colors.textMuted }]}>{group.label}</Text>
          {group.rows.map((r) => (
        <Pressable
          key={r.label}
          disabled={locked}
          onPress={() => {
            playTap();
            r.onPress();
          }}
          style={({ pressed }) => [
            styles.row,
            {
              backgroundColor: pressed && !locked ? colors.surfaceAlt : colors.surface,
              borderColor: colors.border,
            },
            locked && styles.dim,
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
          {!locked && <Text style={[styles.arrow, { color: colors.textMuted }]}>›</Text>}
        </Pressable>
          ))}
        </React.Fragment>
      ))}

      {/* An action, so it looks like one. A left-aligned line of bold text was
          a link pretending not to be a button. */}
      <View style={[styles.divider, { backgroundColor: colors.border }]} />

      <Pressable
        disabled={locked || practiceLeft === 0}
        onPress={() => {
          playTap();
          onPractice();
        }}
        style={({ pressed }) => [
          styles.practice,
          // Locked and spent look the same, because they are the same to a
          // thumb: a black button that refuses a press reads as broken.
          locked || practiceLeft === 0
            ? { backgroundColor: colors.surfaceAlt, borderColor: colors.border, borderWidth: 1 }
            : { backgroundColor: colors.text, opacity: pressed ? 0.85 : 1 },
        ]}
      >
        <Text
          style={[
            styles.practiceText,
            { color: locked || practiceLeft === 0 ? colors.textMuted : colors.background },
          ]}
        >
          Practice the Daily
        </Text>
      </Pressable>
      <Text style={[styles.practiceSub, { color: colors.textMuted }]}>
        {locked
          ? 'Opens once you have played the daily'
          : practiceLeft === 0
            ? 'All three played today · new numbers at midnight'
            : practiceLabel}
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
  dim: { opacity: 0.4 },
  group: { fontSize: 11.5, fontFamily: fonts.extraBold, letterSpacing: 1, marginTop: 12, marginBottom: 1 },
  locked: { fontSize: 13, fontFamily: fonts.semiBold, lineHeight: 19, paddingHorizontal: 2 },
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

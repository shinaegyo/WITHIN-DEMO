import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '../components/AppText';
import { HomeStatus, loadHomeStatus } from '../lib/api';
import { feedbackColors } from '../theme/colors';
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
  onPractice,
  practiceLeft,
}: {
  onDuels: () => void;
  onImpossible: () => void;
  onRush: () => void;
  onPractice: () => void;
  practiceLeft: number | null;
}) {
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

  const rows = [
    {
      label: 'Challenge',
      sub: 'Duel a friend, picking each other’s numbers',
      status: status && status.duelsWaiting > 0 ? `${status.duelsWaiting} waiting on you` : 'Start one',
      urgent: !!status && status.duelsWaiting > 0,
      onPress: onDuels,
    },
    {
      label: 'Impossible',
      sub: 'A climb that keeps your place all week',
      status: status
        ? status.impossible.sessionsLeft === 0 && status.impossible.lives === 0
          ? `Level ${status.impossible.level} · back tomorrow`
          : status.impossible.sessionsLeft === 0
            ? `Level ${status.impossible.level} · ${status.impossible.lives} ${
                status.impossible.lives === 1 ? 'life' : 'lives'
              } left`
            : `Level ${status.impossible.level} · ready`
        : '',
      urgent: false,
      onPress: onImpossible,
    },
    {
      label: 'Rush',
      sub: 'Three minutes, as many numbers as you can find',
      status: 'One run a day',
      urgent: false,
      onPress: onRush,
    },
    {
      label: 'Practice',
      sub: 'Unranked, unscored, as many as you have left',
      status:
        practiceLeft === null
          ? ''
          : practiceLeft === 0
            ? 'None left today'
            : `${practiceLeft} left today`,
      urgent: false,
      onPress: onPractice,
    },
  ];

  return (
    <ScrollView
      style={[styles.wrap, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
    >
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
            <Text style={[styles.label, { color: colors.text }]} numberOfLines={1}>
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
  note: { fontSize: 12, fontFamily: fonts.medium, lineHeight: 18, marginTop: 12, paddingHorizontal: 2 },
});

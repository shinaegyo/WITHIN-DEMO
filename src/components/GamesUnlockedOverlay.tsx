import React from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from './AppText';
import { Mark } from './Mark';
import { fonts } from '../theme/fonts';
import { useTheme } from '../theme/ThemeContext';
import { playTap } from '../utils/sound';

/**
 * What the daily unlocks, said once, to somebody who has just finished it.
 *
 * The Games tab is locked until the day's three rounds are done, which is the
 * right rule and a terrible teacher: a new player finishes their first daily
 * and four modes quietly become available on a tab they have no reason to open.
 * Nothing announced them, and the home screen's row of tiles reads as
 * decoration to somebody who has never seen them lit.
 *
 * So it interrupts, exactly once. Every mode gets a sentence - not a name, a
 * sentence, because "Rush" tells nobody anything - and the rule that governs
 * all of them is stated plainly at the top: play the daily, and the rest of the
 * game opens for the day.
 *
 * Deliberately not shown to anybody else. A player on their ninth day knows
 * what Rush is, and being told again is how a game starts feeling like an
 * advert for itself.
 */

const MODES: { name: string; line: string }[] = [
  {
    name: 'The Impossible Climb',
    line: 'Seventy-five numbers, one week. Everybody climbs the same ones, and your place is kept between days.',
  },
  {
    name: 'Rush',
    line: 'Three minutes. Find as many numbers as you can before the clock runs out.',
  },
  {
    name: 'Duels',
    line: 'You pick their number, they pick yours. Three rounds, no clock — add a friend by username to start one.',
  },
];

export function GamesUnlockedOverlay({
  onClimb,
  onDone,
}: {
  onClimb: () => void;
  onDone: () => void;
}) {
  const { colors } = useTheme();

  return (
    <Modal transparent animationType="fade" visible onRequestClose={onDone}>
      <View style={styles.backdrop}>
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.head}>
            <Mark size={30} ink={colors.text} />
            <Text style={[styles.title, { color: colors.text }]}>The rest of the game</Text>
          </View>

          <Text style={[styles.lead, { color: colors.textMuted }]}>
            That is today's daily done — and it opens everything else. Four more games, every day,
            as soon as your three rounds are finished.
          </Text>

          <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
            {MODES.map((m) => (
              <View key={m.name} style={styles.mode}>
                <Text style={[styles.modeName, { color: colors.text }]}>{m.name}</Text>
                <Text style={[styles.modeLine, { color: colors.textMuted }]}>{m.line}</Text>
              </View>
            ))}
          </ScrollView>

          <Text style={[styles.foot, { color: colors.textMuted }]}>
            None of them touch your points or your streak. That is the daily, and it is the only
            thing that counts.
          </Text>

          <Pressable
            onPress={() => {
              playTap();
              onClimb();
            }}
            style={({ pressed }) => [
              styles.primary,
              { backgroundColor: colors.text, opacity: pressed ? 0.85 : 1 },
            ]}
          >
            <Text style={[styles.primaryText, { color: colors.background }]}>
              Start the Climb
            </Text>
          </Pressable>

          <Pressable
            onPress={() => {
              playTap();
              onDone();
            }}
            style={({ pressed }) => [styles.later, { opacity: pressed ? 0.6 : 1 }]}
          >
            <Text style={[styles.laterText, { color: colors.textMuted }]}>Maybe later</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    padding: 20,
  },
  card: { borderWidth: 1, borderRadius: 24, padding: 22, maxHeight: '88%' },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  title: { fontSize: 23, fontFamily: fonts.extraBold },
  lead: { fontSize: 13.5, fontFamily: fonts.medium, lineHeight: 20, marginBottom: 16 },
  list: { flexGrow: 0 },
  mode: { marginBottom: 14 },
  modeName: { fontSize: 15.5, fontFamily: fonts.extraBold, marginBottom: 3 },
  modeLine: { fontSize: 13, fontFamily: fonts.medium, lineHeight: 19 },
  foot: { fontSize: 12, fontFamily: fonts.medium, lineHeight: 18, marginTop: 2, marginBottom: 16 },
  primary: { borderRadius: 16, paddingVertical: 15, alignItems: 'center' },
  primaryText: { fontSize: 16, fontFamily: fonts.extraBold },
  later: { paddingVertical: 13, alignItems: 'center' },
  laterText: { fontSize: 13.5, fontFamily: fonts.bold },
});

import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '../components/AppText';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Avatar } from '../components/Avatar';
import { StepHeader } from '../components/StepHeader';
import { fonts } from '../theme/fonts';
import { useTheme } from '../theme/ThemeContext';

/**
 * The last thing before a first real day: the daily comes first.
 *
 * The other modes are already hidden until the three rounds are done, and a
 * rule you meet by noticing something missing is a rule you assume is a bug.
 * Said once, here, it reads as the shape of the game instead - the daily is the
 * game, and the rest is what the day opens into.
 */
export function DailyFirstScreen({
  onStart,
  onBack,
  username,
  avatar,
}: {
  onStart: () => void;
  onBack?: () => void;
  username?: string;
  avatar?: string | null;
}) {
  const { colors } = useTheme();

  // The three that exist, in the order the Games tab lists them. Ranked and
  // Challenge were named here long after Ranked stopped being reachable and
  // Challenge became Duel, and Window outlived itself the same way - a first
  // screen promising modes the game does not have is a worse introduction
  // than no list at all.
  const modes = [
    { name: 'The Impossible Climb', detail: 'Fifty numbers over a week. Your place is kept between days' },
    { name: 'Rush', detail: 'Three minutes, as many numbers as you can find' },
    { name: 'Duel', detail: 'A friend or a stranger, picking each other’s numbers' },
  ];

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]} edges={['top', 'bottom']}>
      <StepHeader onBack={onBack} />
      <View style={styles.body}>
        {/* Their character, the moment before their first real round - the end
            of setting up and the start of playing, not a farewell. */}
        {!!username && (
          <View style={styles.who}>
            <Avatar value={avatar} size={44} name={username} />
            <Text style={[styles.whoText, { color: colors.text }]} numberOfLines={1}>
              You're set, {username}
            </Text>
          </View>
        )}
        <Text style={[styles.title, { color: colors.text }]}>The daily comes first</Text>
        <Text style={[styles.lede, { color: colors.textMuted }]}>
          Every day gives you three numbers. Finish all three rounds and the rest of the game opens
          up for the day.
        </Text>

        <View style={styles.list}>
          {modes.map((m) => (
            <View key={m.name} style={[styles.row, { borderColor: colors.border }]}>
              <Text style={[styles.rowName, { color: colors.text }]}>{m.name}</Text>
              <Text style={[styles.rowDetail, { color: colors.textMuted }]}>{m.detail}</Text>
            </View>
          ))}
        </View>

        <Text style={[styles.foot, { color: colors.textMuted }]}>
          Locked until today’s three rounds are done — every day, not just the first. Today’s three
          numbers are waiting.
        </Text>
      </View>

      <View style={styles.footer}>
        <Pressable
          onPress={onStart}
          style={({ pressed }) => [
            styles.button,
            { backgroundColor: colors.text, opacity: pressed ? 0.85 : 1 },
          ]}
        >
          <Text style={[styles.buttonText, { color: colors.background }]}>Play today’s numbers</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  body: { flex: 1, justifyContent: 'center', paddingHorizontal: 26 },
  who: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 18 },
  whoText: { fontSize: 17, fontFamily: fonts.extraBold, flexShrink: 1 },
  title: { fontSize: 30, fontFamily: fonts.extraBold, letterSpacing: -0.6 },
  lede: { fontSize: 15, fontFamily: fonts.medium, lineHeight: 22, marginTop: 8 },
  list: { marginTop: 26, gap: 8 },
  row: { borderWidth: 1, borderRadius: 14, paddingVertical: 12, paddingHorizontal: 15 },
  rowName: { fontSize: 15, fontFamily: fonts.extraBold },
  rowDetail: { fontSize: 12, fontFamily: fonts.medium, marginTop: 2 },
  foot: { fontSize: 12.5, fontFamily: fonts.medium, lineHeight: 18, marginTop: 20 },
  footer: { paddingHorizontal: 20, paddingBottom: 8 },
  button: { borderRadius: 16, paddingVertical: 16, alignItems: 'center' },
  buttonText: { fontSize: 16, fontFamily: fonts.extraBold },
});

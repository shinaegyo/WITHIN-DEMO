import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from './AppText';
import { fonts } from '../theme/fonts';
import { useTheme } from '../theme/ThemeContext';

/**
 * The top ten, and you, however far down you are.
 *
 * Every mode's board printed everything it was given, which is fine at twenty
 * players and unreadable at two hundred - and the row that matters most is
 * whichever one is yours. So: ten, a break, your row, and a button for the
 * rest. Nobody has to scroll past ninety strangers to find themselves, and
 * nobody loses the ninety who are there.
 */

export interface Ranked {
  isMe?: boolean;
}

export function topTen<T extends Ranked>(rows: T[], expanded: boolean, keep = 10) {
  if (expanded || rows.length <= keep) {
    return { shown: rows, hidden: 0, breakAt: -1 };
  }
  const head = rows.slice(0, keep);
  const me = rows.find((r) => r.isMe);
  // Your row is already up there, or you are not on this board at all.
  if (!me || head.includes(me)) {
    return { shown: head, hidden: rows.length - keep, breakAt: -1 };
  }
  return { shown: [...head, me], hidden: rows.length - keep - 1, breakAt: keep };
}

/** The gap between the top ten and your row, so the jump is not silent. */
export function StandingsBreak() {
  const { colors } = useTheme();
  return (
    <View style={styles.break}>
      <Text style={[styles.breakText, { color: colors.textMuted }]}>···</Text>
    </View>
  );
}

export function ShowMore({ count, onPress }: { count: number; onPress: () => void }) {
  const { colors } = useTheme();
  if (count <= 0) return null;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.more,
        { borderColor: colors.border, backgroundColor: pressed ? colors.surfaceAlt : 'transparent' },
      ]}
    >
      <Text style={[styles.moreText, { color: colors.text }]}>
        Show {count} more
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  break: { alignItems: 'center', paddingVertical: 4 },
  breakText: { fontSize: 15, fontFamily: fonts.bold, letterSpacing: 2 },
  more: {
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 11,
    alignItems: 'center',
    marginTop: 8,
  },
  moreText: { fontSize: 13.5, fontFamily: fonts.bold },
});

import React from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from './AppText';
import { LeagueBadge } from './LeagueBadge';
import { fonts } from '../theme/fonts';
import { useTheme } from '../theme/ThemeContext';
import { League } from '../lib/api';
import { LEAGUES, LEAGUE_FLOOR, LEAGUE_INK } from '../theme/leagues';
import { playTap } from '../utils/sound';

/**
 * The ladder, written down.
 *
 * Every badge in the app was decoration until this existed: the profile, the
 * home row and the board all showed which league somebody was in, and nothing
 * anywhere said what the next one cost or that there were six. A player on 78
 * points could see a bronze hexagon and had no way to learn that Silver was 122
 * away.
 *
 * The floors come from LEAGUE_FLOOR rather than being written again here, so
 * this cannot drift from the server's season_league - which was already the
 * reason that table exists.
 *
 * Legend states both of its conditions. It is the only league with a rate as
 * well as a total, and a player sitting on eleven hundred points at thirty a
 * day is not being kept out by points.
 */
export function LeagueLadder({
  visible,
  onClose,
  league,
  points,
  onOpenLeague,
}: {
  visible: boolean;
  onClose: () => void;
  /** Null before the season board loads, or for somebody not on it yet. */
  league: League | null;
  points: number | null;
  /** Given a league, show who is in it. Absent means the rows do not open. */
  onOpenLeague?: (league: League) => void;
}) {
  const { colors } = useTheme();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.scrim} onPress={onClose}>
        <Pressable
          style={[styles.sheet, { backgroundColor: colors.surface, borderColor: colors.border }]}
          onPress={(e) => e.stopPropagation()}
        >
          <Text style={[styles.label, { color: colors.textMuted }]}>LEAGUES THIS SEASON</Text>

          <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
            {LEAGUES.map((l, i) => {
              const here = l === league;
              const floor = LEAGUE_FLOOR[l];
              // A band, not a doorway. The column read "200" against Silver
              // and "you · 24" against your own row - the same space meaning
              // a threshold on five rows and a score on the sixth, so neither
              // was legible without working out which kind of number it was.
              // Every row now states the range it covers, and where you are
              // sits under your name where it cannot be mistaken for one.
              const above = LEAGUES[i + 1];
              const span = above ? `${floor}\u2013${LEAGUE_FLOOR[above] - 1}` : `${floor}+`;
              return (
                <Pressable
                  key={l}
                  disabled={!onOpenLeague}
                  onPress={() => {
                    if (!onOpenLeague) return;
                    playTap();
                    onOpenLeague(l);
                  }}
                  style={({ pressed }) => [
                    styles.row,
                    here && { backgroundColor: colors.surfaceAlt, borderColor: LEAGUE_INK[l] },
                    { opacity: pressed && onOpenLeague ? 0.7 : 1 },
                  ]}
                >
                  <LeagueBadge league={l} size={18} />
                  <View style={styles.names}>
                    <Text style={[styles.name, { color: colors.text }]}>{l}</Text>
                    {here && points !== null && (
                      <Text style={[styles.here, { color: LEAGUE_INK[l] }]}>
                        You · {points} {points === 1 ? 'point' : 'points'}
                      </Text>
                    )}
                  </View>
                  <Text style={[styles.floor, { color: colors.textMuted }]}>{span}</Text>
                </Pressable>
              );
            })}
          </ScrollView>

          <Text style={[styles.note, { color: colors.textMuted }]}>
            Points are this season only, and reset when it ends.
          </Text>

          <Pressable onPress={() => { playTap(); onClose(); }} style={styles.close}>
            <Text style={[styles.closeText, { color: colors.textMuted }]}>Close</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', padding: 22 },
  sheet: { borderRadius: 18, borderWidth: 1, padding: 18 },
  label: { fontSize: 11, fontFamily: fonts.bold, letterSpacing: 1.1, marginBottom: 12 },
  list: { maxHeight: 340 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 10, paddingHorizontal: 10,
    borderRadius: 10, borderWidth: 1, borderColor: 'transparent', marginBottom: 4,
  },
  names: { flex: 1 },
  name: { fontSize: 14, fontFamily: fonts.semiBold },
  floor: { fontSize: 12.5, fontFamily: fonts.medium },
  here: { fontSize: 11.5, fontFamily: fonts.bold, marginTop: 1 },
  note: { fontSize: 12, fontFamily: fonts.medium, lineHeight: 17, marginTop: 12 },
  close: { alignSelf: 'center', paddingVertical: 12, paddingHorizontal: 20, marginTop: 4 },
  closeText: { fontSize: 14, fontFamily: fonts.semiBold },
});

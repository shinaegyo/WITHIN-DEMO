import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '../components/AppText';
import { Avatar } from '../components/Avatar';
import { LevelBar } from '../components/LevelBar';
import { AllTimeEntry, XpState, loadAllTimeLeaderboard, loadRanked, loadXp } from '../lib/api';
import { useDailyGameContext } from '../state/DailyGameContext';
import { fonts } from '../theme/fonts';
import { useTrack } from '../utils/useTrack';
import { loadSeasonHistory, SeasonHistory } from '../lib/api';
import { useTheme } from '../theme/ThemeContext';

/** 1st, 2nd, 3rd — a bare "3" beside a field size reads as a score. */
function ordinalRank(n: number): string {
  const rest = n % 100;
  if (rest >= 11 && rest <= 13) return `${n}th`;
  return `${n}${['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;
}

function monthName(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}
import { playTap } from '../utils/sound';

/**
 * You, and the settings that describe how you play rather than how you are
 * doing.
 *
 * The numbers come first because they are the reason to open it; the rows
 * underneath are everything the menu used to hold, which is where they belong
 * once a tab bar exists.
 */
export function ProfileScreen({
  username,
  avatar,
  onAvatar,
  onAccount,
  onAudio,
  onHowToPlay,
  onPrivacy,
}: {
  username: string;
  avatar: string | null;
  onAvatar: () => void;
  onAccount: () => void;
  onAudio: () => void;
  onHowToPlay: () => void;
  onPrivacy: () => void;
}) {
  // Silent. Music belongs to playing, not to the rooms around it - and it has
  // to be asked for, because a screen that says nothing keeps whatever the
  // last one started, so this kept a mode's track playing over a list.
  useTrack(null);
  const [history, setHistory] = useState<SeasonHistory | null>(null);

  // Nothing on the profile survived a season ending, which made winning one
  // worth exactly as much on the 1st as losing it. This is the line that keeps
  // it: the best month you have ever had, and how big the field was.
  useEffect(() => {
    loadSeasonHistory()
      .then(setHistory)
      .catch(() => {
        /* the profile reads fine without it */
      });
  }, []);

  const { colors, mode, toggle } = useTheme();
  const { game } = useDailyGameContext();
  const [rank, setRank] = useState<AllTimeEntry | null>(null);
  const [rating, setRating] = useState<number | null>(null);
  const [crown, setCrown] = useState(false);
  const [xp, setXp] = useState<XpState | null>(null);

  const load = useCallback(() => {
    loadXp()
      .then(setXp)
      .catch(() => {});
    loadAllTimeLeaderboard()
      .then((b) => setRank(b.entries.find((e) => e.isMe) ?? null))
      .catch(() => {});
    loadRanked()
      .then((r) => {
        setRating(r.played > 0 ? r.rating : null);
        setCrown(r.iHoldBelt);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const stats = game?.stats;

  const Row = ({ label, detail, onPress, tag }: { label: string; detail: string; onPress: () => void; tag?: string }) => (
    <Pressable
      onPress={() => {
        playTap();
        onPress();
      }}
      style={({ pressed }) => [
        styles.row,
        { borderColor: colors.border, backgroundColor: pressed ? colors.surfaceAlt : colors.surface },
      ]}
    >
      <View style={styles.rowMain}>
        <Text style={[styles.rowLabel, { color: colors.text }]}>{label}</Text>
        <Text style={[styles.rowDetail, { color: colors.textMuted }]}>{detail}</Text>
      </View>
      {!!tag && <Text style={[styles.tag, { color: colors.accent }]}>{tag}</Text>}
      <Text style={[styles.arrow, { color: colors.textMuted }]}>›</Text>
    </Pressable>
  );

  return (
    <ScrollView
      style={[styles.wrap, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
    >
      <Pressable style={styles.head} onPress={onAvatar}>
        <Avatar value={avatar} size={72} />
        <View style={styles.headText}>
          <View style={styles.nameRow}>
            <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>
              {username}
            </Text>
            {crown && <Text style={[styles.crown, { color: colors.accent }]}>CROWN</Text>}
          </View>
          <Text style={[styles.sub, { color: colors.textMuted }]}>
            {avatar ? 'Tap to change your avatar' : 'Tap to choose an avatar'}
          </Text>
        </View>
      </Pressable>

      <View style={styles.levelWrap}>
        <LevelBar xp={xp} />
      </View>

      <View style={styles.stats}>
        {[
          { label: 'DAY STREAK', value: stats ? `${stats.currentStreak}` : '—' },
          { label: 'ALL TIME', value: stats ? `${stats.totalPoints}` : '—' },
          { label: 'BEST STREAK', value: stats ? `${stats.maxStreak}` : '—' },
        ].map((s) => (
          <View key={s.label} style={[styles.stat, { borderColor: colors.border }]}>
            <Text style={[styles.statValue, { color: colors.text }]}>{s.value}</Text>
            <Text style={[styles.statLabel, { color: colors.textMuted }]}>{s.label}</Text>
          </View>
        ))}
      </View>

      <Text style={[styles.line, { color: colors.textMuted }]}>
        {rank ? `#${rank.rank} all time` : 'Finish a day to reach the board'}
        {rating !== null ? ` · ${rating} ranked` : ''}
      </Text>

      {!!history?.best && (
        <Text style={[styles.seasonBest, { color: colors.text }]}>
          Best season: {ordinalRank(history.best.rank)} of {history.best.players} in{' '}
          {monthName(history.best.season)}
          {history.seasonsPlayed > 1 ? ` · ${history.seasonsPlayed} seasons played` : ''}
        </Text>
      )}

      {/* Ordered by how much each one changes your experience, and grouped so
          the order reads as deliberate rather than as the sequence they
          happened to be built in.

          Identity first: an account without an email loses its streak and its
          whole history the moment somebody clears their browser, which makes
          it the highest-stakes row on the screen. It used to sit below a
          cosmetic. Then the one thing here that makes you better at the game,
          then the two preferences, then the row nobody opens unless they came
          looking for it. */}
      <View style={styles.rows}>
        <Row label="Profile & sign in" detail="Your name, and an email to keep your streak" onPress={onAccount} />
        <Row
          label="Avatar"
          detail={avatar ? 'Change your character or colour' : 'Pick a character and a colour'}
          tag={avatar ? undefined : 'NEW'}
          onPress={onAvatar}
        />
      </View>

      <View style={styles.rows}>
        <Row label="How to play" detail="The rules, in full" onPress={onHowToPlay} />
        <Row label="Audio" detail="Sound effects, music, and how loud each is" onPress={onAudio} />
        <Pressable
          onPress={() => {
            playTap();
            toggle();
          }}
          style={({ pressed }) => [
            styles.row,
            { borderColor: colors.border, backgroundColor: pressed ? colors.surfaceAlt : colors.surface },
          ]}
        >
          <View style={styles.rowMain}>
            <Text style={[styles.rowLabel, { color: colors.text }]}>Theme</Text>
            <Text style={[styles.rowDetail, { color: colors.textMuted }]}>
              {mode === 'dark' ? 'Dark' : 'Light'} — tap to switch
            </Text>
          </View>
          <Text style={[styles.arrow, { color: colors.textMuted }]}>{mode === 'dark' ? '☾' : '☀'}</Text>
        </Pressable>
      </View>

      <View style={styles.rows}>
        <Row label="Privacy" detail="What the game keeps, and how to remove it" onPress={onPrivacy} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  content: { padding: 18, paddingBottom: 40 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  headText: { flex: 1, minWidth: 0 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { fontSize: 24, fontFamily: fonts.extraBold, flexShrink: 1 },
  crown: { fontSize: 9, fontFamily: fonts.extraBold, letterSpacing: 1.2 },
  sub: { fontSize: 12, fontFamily: fonts.medium, marginTop: 2 },
  levelWrap: { marginTop: 20 },
  stats: { flexDirection: 'row', gap: 8, marginTop: 20 },
  stat: { flex: 1, borderWidth: 1, borderRadius: 14, paddingVertical: 12, alignItems: 'center' },
  statValue: { fontSize: 20, fontFamily: fonts.extraBold },
  statLabel: { fontSize: 8.5, fontFamily: fonts.bold, letterSpacing: 1.1, marginTop: 1 },
  line: { fontSize: 12, fontFamily: fonts.medium, marginTop: 10, textAlign: 'center' },
  seasonBest: { fontSize: 13, fontFamily: fonts.extraBold, textAlign: 'center', marginTop: 6 },
  rows: { marginTop: 20, gap: 8 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 13,
    paddingHorizontal: 15,
    gap: 10,
  },
  rowMain: { flex: 1, minWidth: 0 },
  rowLabel: { fontSize: 15, fontFamily: fonts.extraBold },
  rowDetail: { fontSize: 11.5, fontFamily: fonts.medium, marginTop: 2 },
  tag: { fontSize: 9.5, fontFamily: fonts.extraBold, letterSpacing: 1.1 },
  arrow: { fontSize: 16, fontFamily: fonts.bold, marginTop: -2 },
});

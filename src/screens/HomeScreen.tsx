import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '../components/AppText';
import { Wordmark } from '../components/Wordmark';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusScreen } from '../components/StatusScreen';
import { useDailyGameContext } from '../state/DailyGameContext';
import { feedbackColors } from '../theme/colors';
import { fonts } from '../theme/fonts';
import { useTheme } from '../theme/ThemeContext';
import { playTap } from '../utils/sound';
import { useFocusEffect } from '@react-navigation/native';
import { playTrack } from '../utils/music';
import { formatCountdown, msUntilLocalMidnight } from '../utils/countdown';
import { PRACTICE_PER_DAY, practiceRemaining } from '../utils/practiceLimit';
import { shareInvite, shareResult } from '../utils/share';
import {
  HomeStatus,
  LeaderboardEntry,
  loadHomeStatus,
  loadXp,
  XpState,
} from '../lib/api';
import { MEDALS } from '../theme/medals';
import { Avatar } from '../components/Avatar';
import { Mark } from '../components/Mark';


interface Props {
  onPlay: () => void;
  onEndless: () => void;
  onOpenLeaderboard: () => void;
  onOpenFriends: () => void;
  onOpenDuels: () => void;
  onOpenRanked: () => void;
  onOpenProfile: () => void;
  /** Bumped by the navigator so the count refreshes on return from practice. */
  practiceEpoch: number;
  username: string;
}

export function HomeScreen({
  onPlay,
  onEndless,
  onOpenLeaderboard,
  onOpenFriends,
  onOpenDuels,
  onOpenRanked,
  onOpenProfile,
  practiceEpoch,
  username,
}: Props) {
  const { colors, mode, toggle } = useTheme();
  const { phase, game, loadError, reload, refresh } = useDailyGameContext();
  const [remaining, setRemaining] = useState(msUntilLocalMidnight());
  const [practiceLeft, setPracticeLeft] = useState<number | null>(null);
  const [shareNote, setShareNote] = useState<string | null>(null);
  const [shareFailed, setShareFailed] = useState(false);
  const [modes, setModes] = useState<HomeStatus | null>(null);
  // The first screen is sized to the viewport so it keeps the open, centred
  // layout it had before anything sat below it. Everything else scrolls in
  // underneath rather than crowding it.
  const [viewport, setViewport] = useState(0);
  const [xp, setXp] = useState<XpState | null>(null);

  // On focus rather than on mount: a tab screen mounts once and never again,
  // so coming back from a mode used to leave that mode's music playing.
  useFocusEffect(
    useCallback(() => {
      playTrack('home');
    }, []),
  );

  useEffect(() => {
    practiceRemaining().then(setPracticeLeft);
  }, [practiceEpoch]);

  // The countdown reaching zero has to actually mean something. A timer is set
  // for midnight itself rather than waiting for the next tick to notice, so the
  // new day is on screen at 00:00 for anyone with the app open.
  //
  // The one-second tick still checks the date as well: a phone asleep through
  // midnight never fires the timer on time, and it comes back to a stale day.
  useEffect(() => {
    let cancelled = false;
    let day = new Date().toDateString();
    let midnight: ReturnType<typeof setTimeout>;

    const check = () => {
      setRemaining(msUntilLocalMidnight());
      const now = new Date().toDateString();
      if (now === day) return;
      day = now;
      // Refetch in place: the new day should appear, not a spinner.
      void refresh();
    };

    const armMidnight = () => {
      if (cancelled) return;
      // A hair past the hour, so the server agrees the date has turned.
      midnight = setTimeout(() => {
        check();
        armMidnight();
      }, msUntilLocalMidnight() + 250);
    };

    armMidnight();
    const id = setInterval(check, 1000);
    return () => {
      cancelled = true;
      clearInterval(id);
      clearTimeout(midnight);
    };
  }, [refresh]);

  // Fetched whether or not the day is done: the standings are worth seeing
  // before you play as much as after.
  const dayOver = !!game && game.dayStatus !== 'playing';
  useEffect(() => {
    let cancelled = false;

    loadHomeStatus()
      .then((s2) => {
        if (!cancelled) setModes(s2);
      })
      .catch(() => {
        /* the modes still work without their status lines */
      });

    // Refetched when the day's score moves, because finishing the day is the
    // most likely moment for the level to have changed underneath.

    loadXp()
      .then((x) => {
        if (!cancelled) setXp(x);
      })
      .catch(() => {
        /* the header simply stays quiet */
      });

    return () => {
      cancelled = true;
    };
  }, [dayOver, game?.totalScore]);

  if (phase === 'loading') {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]} edges={['top', 'bottom']}>
        <StatusScreen loading />
      </SafeAreaView>
    );
  }

  if (phase === 'failed' || !game) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]} edges={['top', 'bottom']}>
        <StatusScreen message={loadError} onRetry={reload} />
      </SafeAreaView>
    );
  }

  const finished = game.dayStatus !== 'playing';
  const eliminated = game.dayStatus === 'eliminated';
  const inProgress =
    game.dayStatus === 'playing' && (game.currentRound > 1 || game.round.attemptsUsed > 0);
  // The score leads only once there is one to lead with. Part-way through the
  // first round the total is still zero, and a screen-filling 0 reads as a
  // verdict rather than a starting point. A finished day always shows its
  // score, including a zero — that one is a real result.
  const started = finished || game.totalScore > 0;

  const byRound = new Map(game.rounds.map((r) => [r.round, r]));

  // Only days played before rounds stopped ending the day can be eliminated.
  // Nothing new produces this, but showing such a day as a normal finish would
  // claim all three rounds were played when only one was.
  const status = eliminated
    ? `KNOCKED OUT ON ROUND ${game.currentRound}`
    : finished
      ? 'ALL 3 ROUNDS DONE'
      : 'TODAY SO FAR';

  const primaryLabel = finished
    ? 'Share result'
    : inProgress
      ? `Continue round ${game.currentRound}`
      : 'Play';



  const lastHour = !finished && remaining < 60 * 60 * 1000;

  // Finishing the day turns the button into the share, which is the only thing
  // left to do with a day that is over.
  const onPrimary = finished
    ? async () => {
        playTap();
        const res = await shareResult(game);
        setShareFailed(!res.ok);
        if (res.copied) setShareNote('Copied — paste it anywhere.');
        else if (!res.ok) setShareNote('Could not share — try again.');
      }
    : onPlay;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]} edges={['top', 'bottom']}>
      <View style={styles.header}>
        {/* The menu is gone: everything it held is a tab now, and two
            navigations that disagree is worse than either alone. The slot it
            left holds the player level, which every mode feeds. */}
        {xp ? (
          <Pressable
            onPress={() => {
              playTap();
              onOpenProfile();
            }}
            style={({ pressed }) => [
              styles.levelPill,
              { backgroundColor: colors.surfaceAlt, opacity: pressed ? 0.7 : 1 },
            ]}
          >
            <Text style={[styles.levelPillText, { color: colors.text }]}>LVL {xp.level}</Text>
          </Pressable>
        ) : (
          <View style={styles.iconButton} />
        )}

        {started ? <Wordmark size={24} color={colors.text} /> : <View />}

        <Pressable
          style={[styles.iconButton, { backgroundColor: colors.surfaceAlt }]}
          onPress={toggle}
          accessibilityLabel="Toggle light/dark mode"
        >
          <Text style={styles.iconText}>{mode === 'dark' ? '☀' : '☾'}</Text>
        </Pressable>
      </View>

      {/* No rank here. With a handful of players a day, "#2 of 4" reads as an
          empty room rather than a standing, and that is the first thing anyone
          sees. The leaderboard still has it for whoever goes looking. */}

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.body}
        showsVerticalScrollIndicator={false}
        onLayout={(e) => setViewport(e.nativeEvent.layout.height)}
      >
        <View style={[styles.hero, viewport ? { minHeight: viewport } : null]}>

        {started ? (
          <>
            <Text style={[styles.status, { color: colors.textMuted }]}>{status}</Text>

            {/* No denominator. It read as a shortfall against a maximum almost
                nobody reaches, and once a Bonus day multiplies the total the
                figure to measure against changes too — so the number stopped
                meaning anything at a glance. The score alone is the thing
                worth knowing. */}
            <Text style={[styles.score, { color: colors.text }]} numberOfLines={1} adjustsFontSizeToFit>
              {game.totalScore}
            </Text>
            <Text style={[styles.scoreMax, { color: colors.textMuted }]}>
              {game.totalScore === 1 ? 'POINT' : 'POINTS'}
            </Text>

            {/* Same reading as the in-game progress bar: green solved with its
                score, red lost, grey not reached. */}
            <View style={styles.chips}>
              {[1, 2, 3].map((n) => {
                const r = byRound.get(n);
                const won = r?.status === 'won';
                const lost = r?.status === 'lost';
                return (
                  <View
                    key={n}
                    style={[
                      styles.chip,
                      {
                        backgroundColor: won
                          ? feedbackColors.correct
                          : lost
                            ? feedbackColors.oneAway
                            : colors.border,
                      },
                    ]}
                  >
                    {/* A lost round is a red bar and nothing else. The cross
                        said the same thing twice, in the harsher voice. */}
                    <Text style={styles.chipText}>{won ? r?.score : ''}</Text>
                  </View>
                );
              })}
            </View>
          </>
        ) : (
          <>
            <View style={styles.brand}>
              <Mark size={44} ink={colors.text} />
              <Wordmark size={58} color={colors.text} />
            </View>
            <Text style={[styles.tagline, { color: colors.textMuted }]}>Three rounds. One number each.</Text>
          </>
        )}

        {/* Three modes, each saying what is true right now rather than sitting
            there as a door with a name on it. Whether a friend is waiting on
            your number is the reason to open one of these, and it was the one
            thing the screen would not tell you. */}

        <View style={styles.statRow}>
          <View style={[styles.stat, { borderColor: colors.border, backgroundColor: colors.surface }]}>
            <Text style={[styles.statValue, { color: colors.text }]}>{game.stats.currentStreak}</Text>
            <Text style={[styles.statLabel, { color: colors.textMuted }]}>DAY STREAK</Text>
          </View>
          <View style={[styles.stat, { borderColor: colors.border, backgroundColor: colors.surface }]}>
            <Text style={[styles.statValue, { color: colors.text }]} numberOfLines={1} adjustsFontSizeToFit>
              {game.stats.totalPoints.toLocaleString()}
            </Text>
            <Text style={[styles.statLabel, { color: colors.textMuted }]}>ALL TIME</Text>
          </View>
        </View>

        <Pressable
          style={({ pressed }) => [
            styles.primary,
            finished ? styles.primaryHug : styles.primaryWide,
            { backgroundColor: colors.text, opacity: pressed ? 0.85 : 1 },
          ]}
          onPress={onPrimary}
        >
          <Text
            style={[
              styles.primaryText,
              finished && styles.primaryTextHug,
              { color: colors.background },
            ]}
          >
            {primaryLabel}
          </Text>
        </Pressable>

        {shareNote && (
          <Text
            style={[styles.note, { color: shareFailed ? colors.textMuted : feedbackColors.correct }]}
          >
            {shareNote}
          </Text>
        )}
        </View>

      </ScrollView>


      {/* Pinned rather than scrolled. The clock is the reason to come back, so
          it should be readable wherever the player happens to be on the page,
          and it should never move while they read it. */}
      <View style={[styles.footer, { borderColor: colors.border, backgroundColor: colors.background }]}>
        {/* The clock only becomes urgent for someone who still has a day to
            play. Once the day is done it is just a countdown to the next one. */}
        <Text
          style={[
            styles.nextLabel,
            { color: lastHour ? colors.text : colors.textMuted },
            lastHour && styles.nextLabelUrgent,
          ]}
        >
          {lastHour ? 'LAST HOUR TO PLAY TODAY' : 'NEXT NUMBERS IN'}
        </Text>
        <Text style={[styles.countdown, { color: colors.text }]}>{formatCountdown(remaining)}</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  levelPill: {
    height: 28,
    minWidth: 52,
    paddingHorizontal: 10,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  levelPillText: { fontSize: 11, fontFamily: fonts.extraBold, letterSpacing: 0.8 },
  menuIcon: { fontSize: 19, fontFamily: fonts.bold },
  dot: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 2,
  },
  iconText: { fontSize: 17 },
  scroll: { flex: 1 },
  body: {
    paddingHorizontal: 28,
    // Room to scroll past the last section rather than ending flush against
    // the pinned clock.
    paddingBottom: 72,
  },
  brand: { alignItems: 'center', gap: 10 },
  hero: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  boardCard: {
    alignSelf: 'stretch',
    // Sections are separated by a clear band of space rather than a hairline.
    // Sitting eight points apart, two different lists read as one confusing
    // one.
    marginTop: 44,
    gap: 8,
  },
  boardHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 6,
  },
  boardTitle: { fontSize: 9.5, fontFamily: fonts.bold, letterSpacing: 1.4 },
  boardMore: { fontSize: 11.5, fontFamily: fonts.bold },
  boardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 11,
    paddingVertical: 9,
    paddingHorizontal: 11,
  },
  boardGap: { marginTop: 10 },
  boardRank: { width: 18, fontSize: 12, fontFamily: fonts.extraBold, textAlign: 'center' },
  boardMedal: {
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boardMedalText: { fontSize: 10, fontFamily: fonts.extraBold },
  boardName: { flex: 1, fontSize: 13, fontFamily: fonts.bold },
  boardNameMe: { fontFamily: fonts.extraBold },
  boardOut: { fontSize: 8.5, fontFamily: fonts.bold, letterSpacing: 0.8 },
  boardScore: { fontSize: 14, fontFamily: fonts.extraBold },
  status: {
    fontSize: 10.5,
    fontFamily: fonts.bold,
    letterSpacing: 1.5,
    marginBottom: 6,
  },
  score: {
    fontSize: 84,
    fontFamily: fonts.extraBold,
    letterSpacing: -3,
    lineHeight: 90,
    includeFontPadding: false,
  },
  scoreMax: {
    fontSize: 11,
    fontFamily: fonts.bold,
    letterSpacing: 1.6,
    marginTop: 2,
  },
  chips: {
    flexDirection: 'row',
    gap: 6,
    alignSelf: 'stretch',
    marginTop: 18,
  },
  chip: {
    flex: 1,
    height: 44,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipText: { color: '#FFFFFF', fontSize: 11, fontFamily: fonts.extraBold },
  tagline: {
    fontSize: 14,
    fontFamily: fonts.medium,
    marginTop: 4,
  },
  primary: {
    borderRadius: 15,
    alignItems: 'center',
    marginTop: 22,
  },
  primaryWide: { alignSelf: 'stretch', paddingVertical: 16 },
  // Share is a footnote to the day, not the way out of it: the two mode
  // buttons above are what someone does next. Sized down to match that.
  primaryHug: { alignSelf: 'center', paddingVertical: 9, paddingHorizontal: 21 },
  primaryText: { fontSize: 15.5, fontFamily: fonts.extraBold },
  primaryTextHug: { fontSize: 12.5 },
  note: { fontSize: 11.5, fontFamily: fonts.medium, marginTop: 8 },
  statRow: {
    flexDirection: 'row',
    gap: 10,
    alignSelf: 'stretch',
    marginTop: 20,
  },
  stat: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
  },
  statValue: { fontSize: 19, fontFamily: fonts.extraBold },
  statLabel: { fontSize: 8.5, fontFamily: fonts.bold, letterSpacing: 1.1, marginTop: 1 },
  modes: { gap: 8, alignSelf: 'stretch', marginTop: 20 },
  // Full width, one per row. Three abreast left each about a hundred points
  // wide, which is enough for a name and nothing else - and the status line is
  // the only reason to look at these at all.
  mode: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 11,
    paddingHorizontal: 14,
    gap: 10,
  },
  modeMain: { flex: 1, minWidth: 0 },
  modeText: { fontSize: 14.5, fontFamily: fonts.extraBold },
  modeArrow: { fontSize: 16, fontFamily: fonts.bold, marginTop: -2 },
  modeSub: { fontSize: 10.5, fontFamily: fonts.medium, marginTop: 1 },
  modeStatus: { fontSize: 11, fontFamily: fonts.bold, flexShrink: 1, textAlign: 'right' },
  practiceText: { fontSize: 13.5, fontFamily: fonts.extraBold },
  practiceCount: { fontFamily: fonts.medium },
  footer: {
    alignItems: 'center',
    borderTopWidth: 1,
    paddingTop: 10,
    paddingBottom: 12,
    paddingHorizontal: 28,
  },
  nextLabel: {
    fontSize: 10,
    fontFamily: fonts.bold,
    letterSpacing: 1.2,
  },
  nextLabelUrgent: { fontFamily: fonts.extraBold },
  countdown: {
    fontSize: 32,
    fontFamily: fonts.extraBold,
    letterSpacing: 1,
    marginTop: 2,
  },
});

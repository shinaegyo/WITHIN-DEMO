import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Wordmark } from '../components/Wordmark';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusScreen } from '../components/StatusScreen';
import { useDailyGameContext } from '../state/DailyGameContext';
import { feedbackColors } from '../theme/colors';
import { fonts } from '../theme/fonts';
import { useTheme } from '../theme/ThemeContext';
import { formatCountdown, msUntilLocalMidnight } from '../utils/countdown';
import { practiceRemaining } from '../utils/practiceLimit';
import { shareResult } from '../utils/share';
import { loadLeaderboard } from '../lib/api';
import { MAX_DAILY_SCORE } from '../game/scoring';

interface Props {
  onPlay: () => void;
  onPractice: () => void;
  onOpenMenu: () => void;
  /** Bumped by the navigator so the count refreshes on return from practice. */
  practiceEpoch: number;
  username: string;
}

export function HomeScreen({ onPlay, onPractice, onOpenMenu, practiceEpoch, username }: Props) {
  const { colors, mode, toggle } = useTheme();
  const { phase, game, loadError, reload } = useDailyGameContext();
  const [remaining, setRemaining] = useState(msUntilLocalMidnight());
  const [practiceLeft, setPracticeLeft] = useState<number | null>(null);
  const [shareNote, setShareNote] = useState<string | null>(null);
  const [shareFailed, setShareFailed] = useState(false);
  const [rank, setRank] = useState<{ place: number; of: number } | null>(null);

  useEffect(() => {
    practiceRemaining().then(setPracticeLeft);
  }, [practiceEpoch]);

  useEffect(() => {
    const id = setInterval(() => setRemaining(msUntilLocalMidnight()), 1000);
    return () => clearInterval(id);
  }, []);

  // The daily leaderboard only lists players who have finished all three
  // rounds, so there is no rank to ask for before then. Stays null if the
  // player is past the fetched page rather than showing a wrong number.
  const dayOver = !!game && game.dayStatus !== 'playing';
  useEffect(() => {
    if (!dayOver) {
      setRank(null);
      return;
    }
    let cancelled = false;
    loadLeaderboard()
      .then((board) => {
        const me = board.entries.find((e) => e.isMe);
        if (!cancelled) {
          setRank(me ? { place: me.rank, of: board.totalPlayers } : null);
        }
      })
      .catch(() => {
        /* the rank is a nicety; a failure here shouldn't disturb the screen */
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

  const status = eliminated
    ? `ELIMINATED ON ROUND ${game.currentRound}`
    : finished
      ? 'ALL 3 ROUNDS DONE'
      : 'TODAY SO FAR';

  const primaryLabel = finished
    ? 'Share result'
    : inProgress
      ? `Continue round ${game.currentRound}`
      : 'Press to play';

  const onPrimary = finished
    ? async () => {
        const res = await shareResult(game);
        setShareFailed(!res.ok);
        if (res.copied) setShareNote('Copied — paste it anywhere.');
        else if (!res.ok) setShareNote('Could not share — try again.');
      }
    : onPlay;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable
          style={[styles.iconButton, { backgroundColor: colors.surfaceAlt }]}
          onPress={onOpenMenu}
          accessibilityLabel="Open menu"
        >
          <Text style={[styles.menuIcon, { color: colors.text }]}>☰</Text>
        </Pressable>

        {started ? <Wordmark size={24} /> : <View />}

        <Pressable
          style={[styles.iconButton, { backgroundColor: colors.surfaceAlt }]}
          onPress={toggle}
          accessibilityLabel="Toggle light/dark mode"
        >
          <Text style={styles.iconText}>{mode === 'dark' ? '☀' : '☾'}</Text>
        </Pressable>
      </View>

      {/* The field grows through the day as more people finish, so a bare
          position appears to slide backwards for no reason. Naming the field
          size makes the movement legible. */}
      {rank !== null && (
        <View style={styles.rankRow}>
          <Text style={[styles.rankLabel, { color: colors.textMuted }]}>TODAY'S RANK</Text>
          <Text style={[styles.rankValue, { color: colors.text }]}>
            #{rank.place}
            <Text style={[styles.rankOf, { color: colors.textMuted }]}> of {rank.of}</Text>
          </Text>
        </View>
      )}

      <View style={styles.body}>
        {started ? (
          <>
            <Text style={[styles.status, { color: colors.textMuted }]}>{status}</Text>

            {/* The total is stacked under the score rather than sitting beside
                it. A permanent "/300" next to every result reads as a shortfall,
                since almost nobody finishes on 300. */}
            <Text style={[styles.score, { color: colors.text }]} numberOfLines={1} adjustsFontSizeToFit>
              {game.totalScore}
            </Text>
            <Text style={[styles.scoreMax, { color: colors.textMuted }]}>OF {MAX_DAILY_SCORE}</Text>

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
                    <Text style={styles.chipText}>{won ? r?.score : lost ? '✕' : ''}</Text>
                  </View>
                );
              })}
            </View>
          </>
        ) : (
          <>
            <Wordmark size={62} />
            <Text style={[styles.tagline, { color: colors.textMuted }]}>Three rounds. One number each.</Text>
          </>
        )}

        {/* Share is sized to its words. Stretched across the screen it left a
            wide gap either side of two short words, which read as an empty bar
            rather than a button. Play still spans, because starting the day is
            the one thing the screen is for. */}
        <Pressable
          style={({ pressed }) => [
            styles.primary,
            finished ? styles.primaryHug : styles.primaryWide,
            { backgroundColor: colors.text, opacity: pressed ? 0.85 : 1 },
          ]}
          onPress={onPrimary}
        >
          <Text style={[styles.primaryText, { color: colors.background }]}>{primaryLabel}</Text>
        </Pressable>

        {shareNote && (
          <Text
            style={[styles.note, { color: shareFailed ? colors.textMuted : feedbackColors.correct }]}
          >
            {shareNote}
          </Text>
        )}

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

        {/* Practice unlocks after the daily, so it tops up a session rather
            than replacing the thing people came for. */}
        {finished && practiceLeft !== null && (
          <Pressable disabled={practiceLeft === 0} onPress={onPractice} style={styles.practice}>
            <Text
              style={[
                styles.practiceText,
                { color: colors.textMuted, opacity: practiceLeft === 0 ? 0.5 : 1 },
              ]}
            >
              {practiceLeft > 0 ? 'Practice' : 'No practice left today'}
            </Text>
          </Pressable>
        )}
      </View>

      {finished && (
        <View style={styles.footer}>
          <Text style={[styles.nextLabel, { color: colors.textMuted }]}>NEXT NUMBERS IN</Text>
          <Text style={[styles.countdown, { color: colors.text }]}>{formatCountdown(remaining)}</Text>
        </View>
      )}
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
  menuIcon: { fontSize: 19, fontFamily: fonts.bold },
  iconText: { fontSize: 17 },
  body: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
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
    height: 22,
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
  primaryHug: { alignSelf: 'center', paddingVertical: 13, paddingHorizontal: 30 },
  primaryText: { fontSize: 15.5, fontFamily: fonts.extraBold },
  note: { fontSize: 11.5, fontFamily: fonts.medium, marginTop: 8 },
  statRow: {
    flexDirection: 'row',
    gap: 10,
    alignSelf: 'stretch',
    marginTop: 14,
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
  practice: { marginTop: 18, paddingVertical: 6 },
  rankRow: { alignItems: 'center', marginTop: 10 },
  rankLabel: { fontSize: 9, fontFamily: fonts.bold, letterSpacing: 1.4 },
  rankValue: { fontSize: 22, fontFamily: fonts.extraBold, marginTop: 1 },
  rankOf: { fontSize: 13, fontFamily: fonts.bold },
  practiceText: { fontSize: 12.5, fontFamily: fonts.bold, textDecorationLine: 'underline' },
  footer: {
    alignItems: 'center',
    paddingBottom: 18,
    paddingHorizontal: 28,
  },
  nextLabel: {
    fontSize: 10,
    fontFamily: fonts.bold,
    letterSpacing: 1.2,
  },
  countdown: {
    fontSize: 32,
    fontFamily: fonts.extraBold,
    letterSpacing: 1,
    marginTop: 2,
  },
});

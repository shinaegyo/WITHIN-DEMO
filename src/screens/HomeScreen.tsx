import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
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
import { LeaderboardEntry, loadLeaderboard } from '../lib/api';
import { MEDALS } from '../theme/medals';
import { MAX_DAILY_SCORE } from '../game/scoring';

interface Props {
  onPlay: () => void;
  onPractice: () => void;
  onOpenMenu: () => void;
  onOpenLeaderboard: () => void;
  /** Bumped by the navigator so the count refreshes on return from practice. */
  practiceEpoch: number;
  username: string;
}

export function HomeScreen({
  onPlay,
  onPractice,
  onOpenMenu,
  onOpenLeaderboard,
  practiceEpoch,
  username,
}: Props) {
  const { colors, mode, toggle } = useTheme();
  const { phase, game, loadError, reload } = useDailyGameContext();
  const [remaining, setRemaining] = useState(msUntilLocalMidnight());
  const [practiceLeft, setPracticeLeft] = useState<number | null>(null);
  const [shareNote, setShareNote] = useState<string | null>(null);
  const [shareFailed, setShareFailed] = useState(false);
  const [rank, setRank] = useState<{ place: number; of: number } | null>(null);
  const [board, setBoard] = useState<LeaderboardEntry[]>([]);
  // The first screen is sized to the viewport so it keeps the open, centred
  // layout it had before anything sat below it. Everything else scrolls in
  // underneath rather than crowding it.
  const [viewport, setViewport] = useState(0);

  useEffect(() => {
    practiceRemaining().then(setPracticeLeft);
  }, [practiceEpoch]);

  useEffect(() => {
    const id = setInterval(() => setRemaining(msUntilLocalMidnight()), 1000);
    return () => clearInterval(id);
  }, []);

  // Fetched whether or not the day is done: the standings are worth seeing
  // before you play as much as after. A rank only appears once the player is
  // actually on the board.
  const dayOver = !!game && game.dayStatus !== 'playing';
  useEffect(() => {
    let cancelled = false;
    loadLeaderboard()
      .then((res) => {
        if (cancelled) return;
        setBoard(res.entries);
        const me = res.entries.find((e) => e.isMe);
        setRank(me ? { place: me.rank, of: res.totalPlayers } : null);
      })
      .catch(() => {
        /* the board is a nicety; a failure here shouldn't disturb the screen */
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
      : 'Press to play';

  // Top ten, with the player appended when they placed outside it — a board
  // that never shows your own row is just a list of other people.
  const top = board.slice(0, 10);
  const me = board.find((e) => e.isMe);
  const preview = me && !top.some((e) => e.isMe) ? [...top, me] : top;

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
        {/* Today's standings, in reach without leaving the screen. They move
            through the day, which is the point: a reason to look again this
            evening rather than only tomorrow. */}
        {board.length > 0 && (
          <Pressable style={styles.boardCard} onPress={onOpenLeaderboard}>
            <View style={styles.boardHead}>
              <Text style={[styles.boardTitle, { color: colors.textMuted }]}>TODAY'S TOP</Text>
              <Text style={[styles.boardMore, { color: colors.textMuted }]}>All time ›</Text>
            </View>

            {preview.map((item, i) => (
              <View
                key={item.rank}
                style={[
                  styles.boardRow,
                  {
                    borderColor: colors.border,
                    backgroundColor: item.isMe ? colors.surfaceAlt : colors.surface,
                  },
                  // A gap in the numbering means the player's own row was
                  // pulled up from further down; say so with space.
                  i > 0 && preview[i - 1].rank < item.rank - 1 && styles.boardGap,
                ]}
              >
                {MEDALS[item.rank] ? (
                  <View style={[styles.boardMedal, { backgroundColor: MEDALS[item.rank].ring }]}>
                    <Text style={[styles.boardMedalText, { color: MEDALS[item.rank].ink }]}>
                      {item.rank}
                    </Text>
                  </View>
                ) : (
                  <Text style={[styles.boardRank, { color: colors.textMuted }]}>{item.rank}</Text>
                )}

                <Text style={[styles.boardName, { color: colors.text }]} numberOfLines={1}>
                  {item.name}
                  {item.isMe ? '  (you)' : ''}
                </Text>

                {!item.isComplete && (
                  <Text style={[styles.boardOut, { color: colors.textMuted }]}>OUT</Text>
                )}
                <Text style={[styles.boardScore, { color: colors.text }]}>{item.score}</Text>
              </View>
            ))}
          </Pressable>
        )}

      </ScrollView>

      {/* Pinned rather than scrolled. The clock is the reason to come back, so
          it should be readable wherever the player happens to be on the page,
          and it should never move while they read it. */}
      <View style={[styles.footer, { borderColor: colors.border, backgroundColor: colors.background }]}>
        <Text style={[styles.nextLabel, { color: colors.textMuted }]}>NEXT NUMBERS IN</Text>
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
  menuIcon: { fontSize: 19, fontFamily: fonts.bold },
  iconText: { fontSize: 17 },
  scroll: { flex: 1 },
  body: {
    paddingHorizontal: 28,
    paddingBottom: 32,
  },
  hero: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  boardCard: {
    alignSelf: 'stretch',
    marginTop: 8,
    gap: 8,
  },
  boardHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 2,
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
  countdown: {
    fontSize: 32,
    fontFamily: fonts.extraBold,
    letterSpacing: 1,
    marginTop: 2,
  },
});

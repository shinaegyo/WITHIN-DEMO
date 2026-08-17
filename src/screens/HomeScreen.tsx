import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '../components/AppText';
import { Wordmark } from '../components/Wordmark';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusScreen } from '../components/StatusScreen';
import { POINTS_EPOCH } from '../game/constants';
import { useDailyGameContext } from '../state/DailyGameContext';
import { feedbackColors } from '../theme/colors';
import { fonts } from '../theme/fonts';
import { useTheme } from '../theme/ThemeContext';
import { playTap } from '../utils/sound';
import { useTrack } from '../utils/useTrack';
import { useContext } from 'react';
import { NavigationContext } from '@react-navigation/native';
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
import { LevelUpOverlay } from '../components/LevelUpOverlay';
import { GamesUnlockedOverlay } from '../components/GamesUnlockedOverlay';
import { gamesIntroSeen, markGamesIntroSeen } from '../utils/gamesIntroSeen';
import { lastSeenLevel, markLevelSeen } from '../utils/levelSeen';


interface Props {
  onPlay: () => void;
  onEndless: () => void;
  onOpenLeaderboard: () => void;
  onOpenFriends: () => void;
  onOpenDuels: () => void;
  onOpenRanked: () => void;
  onRush: () => void;
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
  onRush,
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
  // Set only when this device has not yet congratulated the player for the
  // level they are now on.
  const [levelUp, setLevelUp] = useState<{ from: number; to: number } | null>(null);
  // Shown once, to somebody who has just finished their first day.
  const [unlocked, setUnlocked] = useState(false);

  // The calm track. Outside the games the app is not silent any more - it has
  // its own room rather than the game's.
  useTrack('home');

  /**
   * Re-read the modes whenever this screen comes back.
   *
   * They were fetched on mount and on the day's score changing, and a tab
   * screen mounts once - so losing all your health in a climb and coming home
   * left the tile saying 80% and offering Continue, describing a run that had
   * already ended. Everything on this block is somebody else's screen's state.
   *
   * Focus is an addition rather than a requirement, the same way useTrack does
   * it: without a navigator above, the mount fetch still stands.
   */
  const nav = useContext(NavigationContext);
  useEffect(() => {
    if (!nav) return;
    return nav.addListener('focus', () => {
      loadHomeStatus().then(setModes).catch(() => {});
      loadXp().then(setXp).catch(() => {});
    });
  }, [nav]);

  /**
   * What the daily unlocks, said the first time it unlocks anything.
   *
   * The Games tab is locked until the day's rounds are done, which teaches a
   * new player nothing: four modes quietly become available on a tab they have
   * no reason to open. gamesPlayed of 1 is the first finished day, and the
   * device flag keeps it to one showing - a player on their ninth day does not
   * need to be told what Rush is.
   */
  useEffect(() => {
    if (!game || game.dayStatus === 'playing') return;
    if (game.stats.gamesPlayed > 1) return;
    let alive = true;
    gamesIntroSeen().then((seen) => {
      if (alive && !seen) setUnlocked(true);
    });
    return () => {
      alive = false;
    };
  }, [game?.dayStatus, game?.stats.gamesPlayed]);

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

  /**
   * Home is where the level-up lands.
   *
   * XP arrives from five places and none of them is a good host: Impossible has
   * no gap between numbers, the duel result is about the duel, and a Rush score
   * has already been covered once. Home is where every mode returns to, so one
   * check here catches all of them and interrupts nothing.
   *
   * A device that has never recorded a level writes it down silently. Otherwise
   * a player who was already level 6 would be congratulated for it the first
   * time they opened the app after this shipped.
   */
  useEffect(() => {
    if (!xp) return;
    let alive = true;
    (async () => {
      const seen = await lastSeenLevel();
      if (!alive) return;
      if (seen === null || xp.level <= seen) {
        markLevelSeen(xp.level);
        return;
      }
      setLevelUp({ from: seen, to: xp.level });
    })();
    return () => {
      alive = false;
    };
  }, [xp?.level]);

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
  // The same rule the Games tab enforces, for the same reason: the daily is
  // the game and these are what it unlocks. Home showed them open while the
  // Games tab refused them, which made the rule read as a bug on whichever
  // screen you met second. Days before the points start are exempt there and
  // exempt here - a day that scores toward nothing cannot charge for entry.
  const beforeScoring = game.puzzleDate < POINTS_EPOCH;
  const modesLocked = !finished && !beforeScoring;
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



  // The tints. Drained a long way down from the board's own green and red, so
  // the card reads as ink with a hint rather than as two loud bars.
  const roundTint = { won: '#E8F1EA', lost: '#F7EAE7' };
  const roundEdge = { won: '#5E9B70', lost: '#C08074' };
  const roundInk = { won: '#2F5C3E' };

  // A climb with health already spent, or a day's session already opened, is
  // one somebody is in the middle of - Start would ask them to begin something
  // they never stopped.
  const climbOpen = !!modes && modes.impossible.health > 0 && modes.impossible.sessionsLeft === 0;
  const climbDone =
    !!modes && (modes.impossible.summit || (modes.impossible.health === 0 && modes.impossible.sessionsLeft === 0));

  const impossibleState = modes
    ? modes.impossible.summit
      ? 'Topped out this week'
      : modes.impossible.health > 0 || modes.impossible.sessionsLeft > 0
        ? `Level ${modes.impossible.level} · ${modes.impossible.health}% health`
        : `You are on level ${modes.impossible.level}`
    : 'A climb that keeps your place';

  /**
   * One line each, and always the same kind of fact.
   *
   * Ready is doing real work: it says you can do this now, which is the only
   * thing a shortcut has to say. What the mode *is* belongs in the Games tab
   * and the rules, not on a home screen nobody reads four modes of.
   */
  const modeTiles = [
    {
      name: 'Rush',
      state: !modes ? 'Ready' : modes.rush.running ? 'In progress' : modes.rush.played ? `${modes.rush.found} found` : 'Ready',
      live: !!modes?.rush.running,
      go: onRush,
    },
    {
      // Last, with the two that need nobody ahead of it. It used to sit in the
      // middle so it would not read as third in a list of three of a kind -
      // but the Games tab now groups by what each mode asks of you, and a home
      // screen contradicting that order is a third arrangement to learn.
      name: 'Duel',
      // Two words. A third of a phone width is not enough for a sentence, and
      // "Challenge a fri…" is worse than saying less.
      state: modes?.queued
        ? 'Waiting'
        : modes && modes.duelsWaiting > 0
          ? `${modes.duelsWaiting} waiting`
          : 'Start one',
      live: !!modes && (modes.duelsWaiting > 0 || modes.queued),
      go: onOpenDuels,
    },
  ];

  /**
   * One thing to try, not a list.
   *
   * Untried modes first, because the boards say the problem is discovery
   * rather than appetite - the daily had twenty-four finishers today and the
   * side modes a handful. It disappears when there is nothing untried and
   * nothing pending: a screen that always has an ask is one people skim.
   */
  const suggestion = (() => {
    if (!modes || !finished) return null;
    if (!modes.rush.played && !modes.rush.running) {
      return 'Rush is still open today — three minutes, one run.';
    }
    if (modes.duelsWaiting > 0) return 'A duel is waiting on your move.';
    return null;
  })();

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

        {/* The mark alone. Six letters and a shape saying the same thing twice
            crowded a row that also holds a level pill and a button, and the
            name is on the icon, the store listing and the tab - this is the one
            place it can be dropped without anybody losing their way.

            Laid over the row rather than in it. Sharing a space-between row
            with a level pill on one side and a round button on the other
            centres a thing between two of different widths, which is not the
            middle of anything. */}
        {started && (
          <View pointerEvents="none" style={styles.headerBrand}>
            <Mark size={30} ink={colors.text} />
          </View>
        )}

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
            {/* The day in one card. It used to be a column of small things -
                score, chips, two stat boxes, a button - each its own island
                with two hundred points of nothing beneath them. A centred
                layout needs mass to hold the middle and there was none. */}
            <View style={[styles.card, { borderColor: colors.border, backgroundColor: colors.surface }]}>
              <View style={styles.cardHead}>
                <Text style={[styles.cardLabel, { color: colors.textMuted }]}>{status}</Text>
                {finished && (
                  <Pressable onPress={onPrimary} hitSlop={8}>
                    <Text style={[styles.shareLink, { color: colors.text }]}>Share</Text>
                  </Pressable>
                )}
              </View>

              <View style={styles.scoreLine}>
                <Text style={[styles.score, { color: colors.text }]} numberOfLines={1} adjustsFontSizeToFit>
                  {game.totalScore}
                </Text>
                <Text style={[styles.scoreUnit, { color: colors.textMuted }]}>
                  {game.totalScore === 1 ? 'point' : 'points'}
                </Text>
              </View>

              {/* Colour drained right down, with the ink doing the reading.
                  Blue and red already mean "go higher" and "go lower" on every
                  tile in the game; full-strength green and red here gave red
                  two jobs on two screens. */}
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
                        { backgroundColor: won ? roundTint.won : lost ? roundTint.lost : colors.surfaceAlt },
                      ]}
                    >
                      <View
                        style={[
                          styles.chipEdge,
                          { backgroundColor: won ? roundEdge.won : lost ? roundEdge.lost : colors.border },
                        ]}
                      />
                      <Text style={[styles.chipText, { color: won ? roundInk.won : colors.textMuted }]}>
                        {won ? r?.score : ''}
                      </Text>
                    </View>
                  );
                })}
              </View>

              <View style={[styles.cardRule, { backgroundColor: colors.border }]} />
              <View style={styles.cardFoot}>
                <Text style={[styles.footText, { color: colors.textMuted }]}>
                  {game.stats.currentStreak} day streak
                </Text>
                <Text style={[styles.footText, { color: colors.textMuted }]}>
                  {game.stats.totalPoints.toLocaleString()} points
                </Text>
              </View>
            </View>

            {/* A day part-way through needs a door, and the card is not one.
                The moment round one scores, the screen switches to the card
                and the only button on it is Share, which appears when the day
                is over - so anybody who left after a round came back to their
                points with no way back to the next one. */}
            {!finished && (
              <Pressable
                style={({ pressed }) => [
                  styles.primary,
                  styles.primaryWide,
                  { backgroundColor: colors.text, opacity: pressed ? 0.85 : 1 },
                ]}
                onPress={onPrimary}
              >
                <Text style={[styles.primaryText, { color: colors.background }]}>{primaryLabel}</Text>
              </Pressable>
            )}

            {/* Named, because somebody arriving for the first time reads a
                daily puzzle and does not know there is anything else here. */}
            <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>MORE GAMES</Text>

            {modesLocked && (
              <Text style={[styles.suggestion, { color: colors.textMuted }]}>
                Play today's three rounds first. These open when the daily is done.
              </Text>
            )}

            {suggestion && (
              <Text style={[styles.suggestion, { color: colors.text }]}>{suggestion}</Text>
            )}

            {/* Impossible gets the width, because it is the one with unfinished
                business - a level and lives waiting is a reason to come back,
                where a name on a door is not. */}
            {/* The row is not pressable; the button is. Tapping the name did
                the same thing as tapping Start, which made the button
                decorative and meant a thumb resting on the card started a
                climb. */}
            <View style={[styles.featured, { backgroundColor: colors.text }]}>
              <View style={styles.featuredMain}>
                <Text style={[styles.featuredName, { color: colors.background }]}>The Impossible Climb</Text>
                <Text style={[styles.featuredState, { color: colors.background }]}>
                  {impossibleState}
                </Text>
              </View>
              {/* A spent day closes the climb, not the week. The button used to
                  say Tomorrow and refuse the press, which shut the only door to
                  the standings at the hour somebody most wants to see where
                  their week landed - and the whole mode rests on everybody
                  playing the same numbers. Same destination either way; the
                  board's own Start is what knows there is nothing left. */}
              <Pressable
                disabled={modesLocked}
                onPress={() => {
                  playTap();
                  onEndless();
                }}
                style={({ pressed }) => [
                  styles.featuredGo,
                  {
                    backgroundColor: colors.background,
                    opacity: modesLocked ? 0.4 : pressed ? 0.8 : 1,
                  },
                ]}
              >
                <Text style={[styles.featuredGoText, { color: colors.text }]}>
                  {climbDone ? 'Standings' : climbOpen ? 'Continue' : 'Start'}
                </Text>
              </Pressable>
            </View>

            {/* One line each, and always the same kind of fact: what is true
                for you right now. A description and a state stacked with no
                grammar between them read as neither. */}
            <View style={styles.tiles}>
              {modeTiles.map((t) => (
                <Pressable
                  key={t.name}
                  disabled={modesLocked}
                  onPress={() => {
                    playTap();
                    t.go();
                  }}
                  style={({ pressed }) => [
                    styles.tile,
                    {
                      borderColor: colors.border,
                      backgroundColor: colors.surface,
                      opacity: modesLocked ? 0.45 : pressed ? 0.7 : 1,
                    },
                  ]}
                >
                  <Text style={[styles.tileName, { color: colors.text }]}>{t.name}</Text>
                  <Text
                    style={[styles.tileState, { color: t.live ? colors.accent : colors.textMuted }]}
                    numberOfLines={1}
                  >
                    {t.state}
                  </Text>
                </Pressable>
              ))}
            </View>
          </>
        ) : (
          <>
            <View style={styles.brand}>
              <Mark size={44} ink={colors.text} />
              <Wordmark size={58} color={colors.text} />
            </View>
            <Text style={[styles.tagline, { color: colors.textMuted }]}>Three rounds. One number each.</Text>

            <View style={styles.statRow}>
              <View style={[styles.stat, { borderColor: colors.border, backgroundColor: colors.surface }]}>
                <Text style={[styles.statValue, { color: colors.text }]}>{game.stats.currentStreak}</Text>
                <Text style={[styles.statLabel, { color: colors.textMuted }]}>STREAK</Text>
              </View>
              <View style={[styles.stat, { borderColor: colors.border, backgroundColor: colors.surface }]}>
                <Text style={[styles.statValue, { color: colors.text }]} numberOfLines={1} adjustsFontSizeToFit>
                  {game.stats.totalPoints.toLocaleString()}
                </Text>
                <Text style={[styles.statLabel, { color: colors.textMuted }]}>POINTS</Text>
              </View>
            </View>

            <Pressable
              style={({ pressed }) => [
                styles.primary,
                styles.primaryWide,
                { backgroundColor: colors.text, opacity: pressed ? 0.85 : 1 },
              ]}
              onPress={onPrimary}
            >
              <Text style={[styles.primaryText, { color: colors.background }]}>{primaryLabel}</Text>
            </Pressable>
          </>
        )}

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

      {/* Ahead of the level card in the tree and behind it in practice: a
          first day rarely levels anybody, and if it does, the level card is
          the one that should be read first. */}
      {unlocked && !levelUp && (
        <GamesUnlockedOverlay
          onClimb={() => {
            markGamesIntroSeen();
            setUnlocked(false);
            onEndless();
          }}
          onDone={() => {
            markGamesIntroSeen();
            setUnlocked(false);
          }}
        />
      )}

      {levelUp && xp && (
        <LevelUpOverlay
          from={levelUp.from}
          to={levelUp.to}
          needed={xp.needed}
          onDone={() => {
            markLevelSeen(levelUp.to);
            setLevelUp(null);
          }}
        />
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
  card: {
    alignSelf: 'stretch',
    borderWidth: 1,
    borderRadius: 20,
    padding: 18,
    gap: 12,
  },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardLabel: { fontSize: 9.5, fontFamily: fonts.bold, letterSpacing: 1.5 },
  shareLink: { fontSize: 12.5, fontFamily: fonts.extraBold, textDecorationLine: 'underline' },
  scoreLine: { flexDirection: 'row', alignItems: 'baseline', gap: 9 },
  scoreUnit: { fontSize: 14, fontFamily: fonts.bold },
  cardRule: { height: 1, alignSelf: 'stretch' },
  cardFoot: { flexDirection: 'row', justifyContent: 'space-between' },
  footText: { fontSize: 11.5, fontFamily: fonts.medium },
  sectionLabel: { alignSelf: 'flex-start', fontSize: 9.5, fontFamily: fonts.bold, letterSpacing: 1.5, marginTop: 26 },
  suggestion: { alignSelf: 'stretch', fontSize: 13, fontFamily: fonts.semiBold, lineHeight: 19, marginTop: 8 },
  featured: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginTop: 10,
  },
  featuredMain: { flexShrink: 1, gap: 3 },
  featuredName: { fontSize: 16, fontFamily: fonts.extraBold },
  featuredState: { fontSize: 11, fontFamily: fonts.medium, opacity: 0.72 },
  featuredGo: { borderRadius: 11, paddingHorizontal: 15, paddingVertical: 8 },
  featuredGoText: { fontSize: 12.5, fontFamily: fonts.extraBold },
  tiles: { alignSelf: 'stretch', flexDirection: 'row', gap: 8, marginTop: 8 },
  tile: { flex: 1, minWidth: 0, borderWidth: 1, borderRadius: 14, paddingVertical: 12, paddingHorizontal: 11, gap: 5 },
  tileName: { fontSize: 13, fontFamily: fonts.extraBold },
  tileState: { fontSize: 10, fontFamily: fonts.semiBold },
  brand: { alignItems: 'center', gap: 10 },
  headerBrand: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 8,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
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
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  // The colour is one edge rather than the whole tile, which is what lets the
  // score be read in ink instead of in white on green.
  chipEdge: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 3.5 },
  chipText: { fontSize: 12, fontFamily: fonts.extraBold },
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

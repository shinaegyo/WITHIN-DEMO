import React, { useCallback, useEffect, useState } from 'react';
import { Modal, Platform, Pressable, TextInput, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '../components/AppText';
import { Avatar } from '../components/Avatar';
import { ScreenTitle } from '../components/ScreenTitle';
import { PlayerCardModal } from '../components/PlayerCard';
import { LeagueRoster } from '../components/LeagueRoster';
import { StatusScreen } from '../components/StatusScreen';
import {
  ApiError,
  League,
  loadLeaderboard,
  loadSeasonLeaderboard,
  loadBoardWindow,
  findPlayer,
  suggestPlayers,
  PlayerSuggestion,
  Leaderboard,
  SeasonLeaderboard,
  messageFor,
} from '../lib/api';
import { fonts } from '../theme/fonts';
import { useTrack } from '../utils/useTrack';
import { MEDALS } from '../theme/medals';
import { LeagueBadge } from '../components/LeagueBadge';
import { useTheme } from '../theme/ThemeContext';
import { playTap } from '../utils/sound';
import { radius, border, numeral } from '../theme/tokens';

/**
 * Every board in one place.
 *
 * They answer different questions - who won today, who has won most, who got
 * deepest this week, who beats people - and splitting them across four screens
 * meant three of them were never found. One screen, four segments, and each
 * loads only when it is asked for.
 */
/**
 * Two boards, not three.
 *
 * Impossible had a tab here and its own standings on its own screen - the same
 * list in two places, and the copy under this one had to explain a weekly reset
 * that has nothing to do with the daily. Rush already keeps its board where it
 * is played, which is the pattern; adding them here would have made four tabs
 * of which three were duplicates.
 *
 * So this tab means one thing: the daily, which is the only mode that scores
 * points, keeps a streak, or places anybody.
 */
/**
 * Two boards, not three.
 *
 * All time never reset, so the gap between somebody who started in week one
 * and somebody who started today only ever widened - it ranked length of
 * service and called it skill. Season does the same job on a horizon a new
 * player can actually win, and today is the only board where showing up today
 * is enough. A lifetime total is still a fact about a player; it lives on
 * their profile, where a fact belongs, rather than in a league nobody can
 * enter.
 */
type Board = 'today' | 'season';

/** "today" | "this season" | "all time" — the window, said in a sentence. */
const WHEN: Record<Board, string> = {
  today: 'today',
  season: 'this season',
};

/** 7th, not 7 — a bare number beside a field size reads as a score. */
function ordinalRank(n: number): string {
  const rest = n % 100;
  if (rest >= 11 && rest <= 13) return `${n}th`;
  return `${n}${['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;
}


/**
 * Where you came, said the way that suits the size of the crowd.
 *
 * The rule is your position, not the size of the field. Being 37th of ten
 * thousand is a real achievement and "Top 1%" throws it away, lumping you in
 * with ninety-nine other people - so a place inside the top hundred is stated
 * as a place. Below that a position tells you nothing you want to know, and
 * the share does: nobody is glad to be four-thousandth at something they did
 * well.
 *
 * Under twenty players a percentage is nonsense in the other direction, and
 * the server withholds it there anyway.
 *
 * Decimals are deliberately absent. If the top hundred always show a rank then
 * anybody seeing a share is at least 101st, which is over 1% until the game
 * has a hundred thousand players - and by then the cutoff should be higher
 * than a hundred rather than the number more precise.
 */
const NAMED_PLACES = 100;

function standing(
  me: { rank: number; topPercent: number | null },
  total: number,
  when: string,
): string {
  if (me.topPercent === null || me.rank <= NAMED_PLACES) {
    return `#${me.rank.toLocaleString()} OF ${total.toLocaleString()} ${when}`;
  }
  return `TOP ${me.topPercent}% ${when}`;
}

/** "August" — the season is a calendar month, so it has the month's name. */
function seasonName(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString(undefined, { month: 'long' });
}

/** Whole days to the first of next month, counted from midnight tonight. */
function daysLeft(endsOn: string): string {
  const end = new Date(`${endsOn}T00:00:00`).getTime();
  const now = new Date();
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const days = Math.max(0, Math.round((end - midnight) / 86400000));
  if (days === 0) return 'today';
  return days === 1 ? '1 day' : `${days} days`;
}

interface Row {
  rank: number;
  name: string;
  avatar: string | null;
  value: string;
  unit?: string;
  /** Shown small beside the value. */
  sub?: string;
  subInk?: string;
  /** The season board wears the league rather than saying it. */
  league?: League;
  isMe: boolean;
  crown?: boolean;
}

// A tab is a label. The line that used to sit under it explained a rule
// nobody had asked about yet, on a screen somebody opened to see where they
// came - and the sheet behind the header explains both boards properly for
// anyone who does ask.
// Season first, and open on it.
//
// Today only holds the people who have finished the daily in the last few
// hours - three of them, most of the time - so a leaderboard opened on Today
// was a leaderboard that looked empty. Season carries everyone who has played
// at all this month, which is the board that answers "where do I stand".
//
// Today keeps its place beside it: it is the sharper question once there are
// enough people playing to fill it, and it is one tap away.
const TABS: { key: Board; label: string }[] = [
  // The columns are explained under the board rather than above it: nothing
  // should stand between opening this tab and seeing the standings, and the
  // question only occurs to somebody who has already looked at the rows.
  { key: 'season', label: 'Season' },
  // One line each. The reasoning behind a board - why a season resets, what a
  // lifetime total is for - moved into the sheet with everything else, because
  // two lines of explanation above a leaderboard is read once and then skipped
  // forever.
  { key: 'today', label: 'Today' },
];

export function BoardsScreen() {
  // The calm track. Outside the games the app is not silent any more - it has
  // its own room rather than the game's.
  useTrack('home');
  const { colors } = useTheme();
  const [tab, setTab] = useState<Board>('season');
  const [rows, setRows] = useState<Partial<Record<Board, Row[]>>>({});
  const [error, setError] = useState<string | null>(null);
  const [looking, setLooking] = useState<string | null>(null);
  // Opened from the crest on a player card. The card closes first, so there
  // is never a sheet on top of a sheet with two Close buttons.
  const [leagueRoster, setLeagueRoster] = useState<League | null>(null);
  /**
   * Which sheet is open, in one value.
   *
   * It was two - a board for the column explanation and a boolean for your own
   * figure - and closing set them in sequence. The modal keeps its children
   * mounted while it fades, so for the length of the fade `mine` was false and
   * the other branch rendered: press Got it on your score and the full
   * explanation flashed up as it left.
   */
  const [sheet, setSheet] = useState<{ kind: 'mine' } | { kind: 'column'; board: Board } | null>(null);
  // Not a fourth tab: friends is a filter on all three windows, not a window of
  // its own. Today among friends is the one people check every morning.
  const [friends, setFriends] = useState(false);
  // Everything below the podium: a page at a time, or a window centred on
  // somebody. The podium itself is still the first page, so the two never
  // disagree about who is third.
  const [more, setMore] = useState<Row[]>([]);
  const [nextFrom, setNextFrom] = useState(10);
  const [ended, setEnded] = useState(false);
  const [query, setQuery] = useState('');
  const [found, setFound] = useState<string | null>(null);
  const [hints, setHints] = useState<PlayerSuggestion[]>([]);
  const [busy, setBusy] = useState(false);

  // The league comes through here or not at all. The first ten rows are built
  // from season_leaderboard and carry it; every row after them comes through
  // this, which dropped it - so the badge column ended at rank ten and the
  // board stopped saying the one thing it ranks people by.
  const toRow = (e: {
    rank: number; name: string; avatar: string | null; score: number; avgOff: number;
    league?: League | null; isMe: boolean;
  }): Row => ({
    rank: e.rank, name: e.name, avatar: e.avatar,
    value: `${e.score}`, league: e.league ?? undefined, isMe: e.isMe,
  });

  // From the first keystroke. A friends list is short, so one letter narrows
  // it as usefully as two, and waiting for a second reads as a broken field.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 1) {
      setHints([]);
      return;
    }
    let alive = true;
    const id = setTimeout(() => {
      suggestPlayers(q, tab, friends)
        .then((p) => alive && setHints(p))
        .catch(() => alive && setHints([]));
    }, 180);
    return () => {
      alive = false;
      clearTimeout(id);
    };
  }, [query, tab, friends]);

  const resetBrowse = () => {
    setMore([]);
    setNextFrom(10);
    setEnded(false);
    setFound(null);
    setHints([]);
  };

  /** The next page under whatever is already shown. */
  const showMore = async () => {
    if (busy || ended) return;
    setBusy(true);
    try {
      const w = await loadBoardWindow(tab, friends, { offset: nextFrom, limit: 25 });
      const rows = w.entries.map(toRow);
      setMore((m) => [...m, ...rows]);
      setNextFrom(nextFrom + rows.length);
      if (rows.length === 0 || nextFrom + rows.length >= Math.min(w.totalPlayers, 500)) setEnded(true);
    } catch {
      setEnded(true);
    } finally {
      setBusy(false);
    }
  };

  /** Centre the list on somebody: you, or whoever was searched for. */
  const centerOn = async (id: string, name: string) => {
    setBusy(true);
    try {
      const w = await loadBoardWindow(tab, friends, { around: id, limit: 7 });
      setMore(w.entries.map(toRow));
      setNextFrom(w.from + w.entries.length - 1);
      setEnded(false);
      // The answer, not the mechanism. "Around sarah" described what the list
      // was doing; this is what you searched to find out, and the numbers are
      // already in the window that was just loaded.
      const them = w.entries.find((e) => e.rank !== undefined && e.name === name);
      setFound(
        them
          ? `${name} is ${ordinalRank(them.rank)} of ${w.totalPlayers.toLocaleString()} ${WHEN[tab]}`
          : `${name} ${WHEN[tab]}`,
      );
    } catch {
      setFound('Not on this board.');
    } finally {
      setBusy(false);
    }
  };

  const search = async () => {
    const name = query.trim();
    if (!name) return;
    playTap();
    setBusy(true);
    try {
      const r = await findPlayer(name, tab, friends);
      if (!r.found) setFound(`No player called ${name}.`);
      else if (r.onBoard === false || !r.userId) setFound(`${r.name} has not played this one.`);
      else {
        // Same as tapping a suggestion: the field has done its job and the
        // note below says whose window this is.
        setQuery('');
        setHints([]);
        await centerOn(r.userId, r.name!);
      }
    } catch {
      setFound('Could not search just now.');
    } finally {
      setBusy(false);
    }
  };
  // Today's board carries more than a list: where you came as a share of the
  // field, how many people are level with you, and the shape of the day.
  const [today, setToday] = useState<Leaderboard | null>(null);
  const [season, setSeason] = useState<SeasonLeaderboard | null>(null);

  /**
   * Whether the list already holds everybody.

   * Null when the total is not known yet, which reads as "maybe more" - the
   * button appearing for a moment is a smaller fault than a board that cannot
   * be paged because a count had not arrived.
   */
  const totalPlayers = tab === 'today' ? today?.totalPlayers : season?.totalPlayers;
  const shownAll =
    totalPlayers === undefined
      ? false
      : (rows[tab]?.length ?? 0) + more.length >= Math.min(totalPlayers, 500);


  const load = useCallback(
    async (which: Board) => {
      setError(null);
      try {
        if (which === 'today') {
          const b = await loadLeaderboard(friends);
          setToday(b);
          setRows((r) => ({
            ...r,
            today: b.entries.map((e) => ({
              rank: e.rank, name: e.name, avatar: e.avatar,
              value: `${e.score}`, isMe: e.isMe,
            })),
          }));
        } else if (which === 'season') {
          const b = await loadSeasonLeaderboard(friends);
          setSeason(b);
          setRows((r) => ({
            ...r,
            season: b.entries.map((e) => ({
              rank: e.rank, name: e.name, avatar: e.avatar,
              value: `${e.score}`, league: e.league, isMe: e.isMe,
            })),
          }));
        }
      } catch (err) {
        setError(messageFor(err instanceof ApiError ? err.code : 'network'));
      }
    },
    [friends],
  );

  useEffect(() => {
    if (!rows[tab]) load(tab);
  }, [tab, rows, load]);

  const list = rows[tab];

  return (
    <View style={[styles.wrap, { backgroundColor: colors.background }]}>
      {/* One control over three boards, in the title bar because it governs
          everything below it - including your own card, which would otherwise
          state a standing before the screen had said which field it was
          against. A Friends tab would have been a fourth timescale standing
          beside three real ones. */}
      <ScreenTitle
        // "Rank", not "Leaderboard": the tab that opens this screen has said
        // Rank since it stopped colliding with the guess board, so the screen
        // agreeing with it costs nothing - and eleven letters at 38pt left no
        // room on the line for anything else.
        title="Rank"
        action={
          <View style={[styles.filter, { backgroundColor: colors.surfaceAlt }]}>
            {([false, true] as const).map((f) => (
              <Pressable
                key={String(f)}
                onPress={() => {
                  if (f === friends) return;
                  playTap();
                  setFriends(f);
                  // Everything on screen belongs to the other field.
                  setRows({});
              resetBrowse();
                  setToday(null);
                  setSeason(null);
                }}
                style={[
                  styles.filterTab,
                  f === friends && { backgroundColor: colors.background },
                ]}
              >
                <Text
                  style={[
                    styles.filterText,
                    { color: f === friends ? colors.text : colors.textMuted },
                  ]}
                >
                  {f ? 'Friends' : 'Everyone'}
                </Text>
              </Pressable>
            ))}
          </View>
        }
      />
      <View style={styles.segments}>
        {TABS.map((t) => (
          <Pressable
            key={t.key}
            onPress={() => {
              playTap();
              setTab(t.key);
              resetBrowse();
            }}
            style={[
              styles.segment,
              t.key === tab
                ? { backgroundColor: colors.text }
                : { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: border.hairline },
            ]}
          >
            <Text
              style={[
                styles.segmentText,
                { color: t.key === tab ? colors.background : colors.textMuted },
              ]}
            >
              {t.label}
            </Text>
          </Pressable>
        ))}
      </View>


      {/* Your day, before the podium.
          A position is the wrong instrument once there are thousands of
          players - nobody is glad to be four-thousandth at something they did
          well - so this says how you did rather than what number you are, and
          states the tie instead of hiding it. */}
      {tab === 'season' && season && (
        <Pressable
          onPress={() => {
            playTap();
            setSheet({ kind: 'mine' });
          }}
          style={[styles.mine, { borderColor: colors.border }]}
        >
          <Text style={[styles.mineLead, { color: colors.textMuted }]}>
            {season.me
              ? `${standing(season.me, season.totalPlayers, 'THIS SEASON')} · POINTS`
              : 'NOT ON THIS SEASON YET'}
          </Text>
          {/* The unit moves up into the lead, so the figure holds its own
              line. "24 points" put a 46-point number on one baseline with a
              15-point word, which reads as a statistic with a caption rather
              than as the number the screen is about. */}
          <Text style={[styles.mineScore, { color: colors.text }]}>
            {(season.me?.score ?? 0).toLocaleString()}
          </Text>
          {/* The countdown is the whole reason a season is different from a
              running total: it is the thing that makes the last week matter. */}
        </Pressable>
      )}


      {tab === 'today' && today?.me && (
        // The score is the target. No hint under it: a card holding a rank and
        // a number is legible on its own, and a line explaining that it can be
        // tapped costs more room than the explanation was worth.
        <Pressable
          onPress={() => {
            playTap();
            setSheet({ kind: 'mine' });
          }}
          style={[styles.mine, { borderColor: colors.border }]}
        >
          {/* The unit rides in the lead rather than on the figure's baseline,
              the same as the season panel. Stacking it as its own line was the
              old problem - a third label in a card that already had two - and
              putting it beside the number was the other one. Above, in the
              line that already names the standing, it is neither. */}
          <Text style={[styles.mineLead, { color: colors.textMuted }]}>
            {standing(today.me, today.totalPlayers, 'TODAY')} · {today.me.score === 1 ? 'POINT' : 'POINTS'}
          </Text>
          <Text style={[styles.mineScore, { color: colors.text }]}>{today.me.score}</Text>
          {/* The explanation is unconditional. It used to ride along with the
              tie - "4 players on this score, the closer guesses rank higher" -
              so on any day you were alone on your score, nothing on the screen
              said what AVG OFF was for. The column was there every day and the
              reason for it only some days. */}
        </Pressable>
      )}

      {error ? (
        <StatusScreen message={error} onRetry={() => load(tab)} />
      ) : !list ? (
        <StatusScreen loading />
      ) : list.length === 0 ? (
        <Text style={[styles.empty, { color: colors.textMuted }]}>
          {friends
            ? 'None of your friends has finished this one. Add a few, or be the one they are chasing.'
            : 'Nobody is on this board yet. Be the first.'}
        </Text>
      ) : (
        <ScrollView contentContainerStyle={styles.list}>
          {/* The precision column is labelled. A bare 881 beside a score is a
              number nobody can read, and one that is better when smaller. */}
          {/* Search and Find me, above the names. Nobody wants to scroll to
              4,568 - they want to see 4,565 to 4,571 and know who is one good
              morning away. */}
          <View style={styles.tools}>
            <TextInput
              style={[
                styles.search,
                { color: colors.text, borderColor: colors.border },
                // The browser draws its own focus ring in the system accent,
                // which arrives amber on this machine and belongs to no palette
                // in the app. Same suppression NumberInput uses.
                Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : null,
              ]}
              value={query}
              onChangeText={setQuery}
              placeholder="Find a player"
              placeholderTextColor={colors.textMuted}
              onSubmitEditing={search}
              returnKeyType="search"
              autoCapitalize="none"
            />
            {/* Search, because a button beside a text field is read as that
                field's submit whatever it says on it. Find me does something
                else entirely and was sitting where the eye expected this. */}
            <Pressable
              onPress={search}
              disabled={busy}
              style={({ pressed }) => [
                styles.searchBtn,
                { borderColor: colors.border, opacity: pressed || busy ? 0.6 : 1 },
              ]}
            >
              <Text style={[styles.searchBtnText, { color: colors.text }]}>Search</Text>
            </Pressable>
          </View>

          {/* Your friends, as you type. Their place comes with the name, so a
              suggestion answers the question before it is tapped. */}
          {hints.length > 0 && (
            <View style={[styles.hints, { borderColor: colors.border, backgroundColor: colors.surface }]}>
              {hints.map((h) => (
                <Pressable
                  key={h.userId}
                  onPress={() => {
                    playTap();
                    // The field empties rather than filling with the name.
                    // Setting it re-fired the lookup, which matched that exact
                    // name and put the suggestion straight back - leaving the
                    // row you had just tapped sitting above the result it
                    // produced. "Around jpdw" already says who you are looking
                    // at, so the field has nothing left to hold.
                    setQuery('');
                    setHints([]);
                    if (h.rank === null) setFound(`${h.name} has not played this one.`);
                    else centerOn(h.userId, h.name);
                  }}
                  style={({ pressed }) => [styles.hintRow, { opacity: pressed ? 0.6 : 1 }]}
                >
                  <Avatar value={h.avatar} size={24} name={h.name} />
                  <Text style={[styles.hintName, { color: colors.text }]} numberOfLines={1}>
                    {h.name}
                  </Text>
                  <Text style={[styles.hintRank, { color: colors.textMuted }]}>
                    {h.rank === null ? 'not played' : `#${h.rank} · ${h.score}`}
                  </Text>
                </Pressable>
              ))}
            </View>
          )}

          {!!found && (
            <View style={styles.foundRow}>
              <Text style={[styles.foundNote, { color: colors.textMuted }]}>{found}</Text>
              <Pressable
                onPress={() => {
                  playTap();
                  setQuery('');
                  resetBrowse();
                }}
                hitSlop={8}
              >
                <Text style={[styles.foundClear, { color: colors.text }]}>
                  {friends ? 'Show all friends' : 'Show everyone'}
                </Text>
              </Pressable>
            </View>
          )}

          {/* Today and the season carry two columns; all time carries one.
              A lifetime average is a number that barely moves after a few
              weeks, so it separates nobody and reads as decoration - the
              points are the record, and that is the whole of it.

              The explanation lives behind the header rather than under the
              board. A footnote is read by nobody who is not already curious,
              and a full screen for one column is far too much room for one
              sentence. */}
          <View style={styles.head}>
            {/* The column that had no label. Two headings sat over the right
                edge and the names they belong to ran along under nothing, so
                the row read as a caption for the numbers rather than for the
                board. Same size, weight and ink as the other two - they are
                three headings on one line, not a title and two labels. */}
            <Text style={[styles.headBoard, { color: colors.textMuted }]}>LEADERBOARD</Text>
            <Text style={[styles.headValue, { color: colors.textMuted }]}>POINTS</Text>
            {tab === 'season' && (
              <Text style={[styles.headLeague, { color: colors.textMuted }]} numberOfLines={1}>
                LEAGUE
              </Text>
            )}
          </View>
          {!found && list.map((e) => (
            <Pressable
              key={`${e.rank}-${e.name}`}
              onPress={() => {
                playTap();
                setLooking(e.name);
              }}
              style={({ pressed }) => [
                styles.row,
                { borderBottomColor: colors.border },
                e.isMe && { backgroundColor: colors.surfaceAlt },
                { opacity: pressed ? 0.7 : 1 },
              ]}
            >
              {MEDALS[e.rank] ? (
                <View style={[styles.medal, { backgroundColor: MEDALS[e.rank].ring }]}>
                  <Text style={[styles.medalText, { color: MEDALS[e.rank].ink }]}>{e.rank}</Text>
                </View>
              ) : (
                <Text style={[styles.rank, { color: colors.textMuted }]}>{e.rank}</Text>
              )}

              <Avatar value={e.avatar} size={30} name={e.name} />

              <Text
                style={[styles.name, { color: colors.text }, e.isMe && styles.nameMe]}
                numberOfLines={1}
              >
                {e.name}
              </Text>

              {e.crown && <Text style={[styles.crown, { color: colors.accent }]}>CROWN</Text>}
              {!!e.unit && <Text style={[styles.unit, { color: colors.textMuted }]}>{e.unit}</Text>}
              {/* Points first, then the tiebreak, because that is the order
                  they are sorted in. The other way round you read what settles
                  a tie before you read the thing being tied. */}
              <Text style={[styles.value, { color: colors.text }]}>{e.value}</Text>
              {!!e.league && (
                <View style={styles.leagueCell}>
                  <LeagueBadge league={e.league} size={18} />
                </View>
              )}
              {!!e.sub && (
                <Text style={[styles.sub, { color: e.subInk ?? colors.textMuted }]}>{e.sub}</Text>
              )}
            </Pressable>
          ))}

          {/* The rest of the board, a page at a time, capped at five hundred
              because past that nobody is reading names. */}
          {more.map((e) => (
            <Pressable
              key={`w-${e.rank}-${e.name}`}
              onPress={() => {
                playTap();
                setLooking(e.name);
              }}
              style={[
                styles.row,
                { borderBottomColor: colors.border },
                e.isMe && { backgroundColor: colors.surfaceAlt },
              ]}
            >
              <Text style={[styles.rank, { color: colors.textMuted }]}>{e.rank}</Text>
              <Avatar value={e.avatar} size={30} name={e.name} />
              <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>
                {e.name}
              </Text>
              {/* Points then precision, the same way round as the podium. This
                  block was written separately and inherited the order the
                  podium had before it was swapped. */}
              <Text style={[styles.value, { color: colors.text }]}>{e.value}</Text>
              {!!e.league && (
                <View style={styles.leagueCell}>
                  <LeagueBadge league={e.league} size={18} />
                </View>
              )}
              {!!e.sub && (
                <Text style={[styles.sub, { color: e.subInk ?? colors.textMuted }]}>{e.sub}</Text>
              )}
            </Pressable>
          ))}

          {/* Only when there is more. The button used to show until a page
              came back empty, so a board with two players on it offered to
              fetch a third. */}
          {!ended && shownAll === false && (
            <Pressable
              onPress={() => { playTap(); showMore(); }}
              disabled={busy}
              style={({ pressed }) => [
                styles.showMore,
                { borderColor: colors.border, opacity: pressed || busy ? 0.6 : 1 },
              ]}
            >
              <Text style={[styles.showMoreText, { color: colors.textMuted }]}>
                {busy ? 'Loading…' : 'Show more'}
              </Text>
            </Pressable>
          )}
        </ScrollView>
      )}

      <PlayerCardModal
        username={looking}
        onClose={() => setLooking(null)}
        onOpenLeague={(l) => {
          setLooking(null);
          setLeagueRoster(l);
        }}
      />

      <LeagueRoster league={leagueRoster} onClose={() => setLeagueRoster(null)} />

      <Modal
        visible={sheet !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setSheet(null)}
      >
        <Pressable style={styles.scrim} onPress={() => setSheet(null)}>
          <Pressable
            style={[styles.sheet, { backgroundColor: colors.surface, borderColor: colors.border }]}
            onPress={() => {}}
          >
            {/* Your own figure and nothing else. The column header has the
                explanation; repeating it here answers a question that was not
                asked. */}
            {/* Explicit on both sides. A ternary falls into its else branch
                when sheet is null, which is exactly the state the modal is in
                while it fades - so closing the personal sheet rendered the
                column explanation on the way out. */}
            {sheet?.kind === 'mine' ? (
              <>
                {tab === 'today' && (
                  <>
                    <Text style={[styles.sheetLead, { color: colors.text }]}>
                      {today?.me
                      ? `${today.me.score} ${today.me.score === 1 ? 'point' : 'points'} today.`
                      : 'Finish the three rounds to reach the board.'}
                    </Text>
                    {/* Said out loud because the board only shows the score and
                        the average, and on a day where the top score is shared
                        the order comes from a number that is not on screen. */}
                    <Text style={[styles.sheetBody, { color: colors.textMuted }]}>
                      Same score, higher place: fewest guesses wins it, and if that ties too, it
                      goes to whoever landed closest.
                    </Text>
                  </>
                )}
                {tab === 'season' && !!season && (
                  <>
                    <Text style={[styles.sheetLead, { color: colors.text }]}>
                      {seasonName(season.season)} ends in {daysLeft(season.endsOn)}.
                    </Text>
                    <Text style={[styles.sheetBody, { color: colors.textMuted }]}>
                      {season.me
                        ? `${season.me.league} league · ${season.me.days} ${season.me.days === 1 ? 'day' : 'days'} played this month.`
                        : 'Play one and you are on it.'}
                    </Text>
                    <Text style={[styles.sheetBody, { color: colors.textMuted }]}>
                      It resets on the 1st, so a good month beats a long history — somebody who
                      started last week can win this one.
                    </Text>
                  </>
                )}
              </>
            ) : sheet?.kind === 'column' ? (
            <>
            <Text style={[styles.sheetTitle, { color: colors.text }]}>Average off</Text>
            <Text style={[styles.sheetBody, { color: colors.textMuted }]}>
              How far a typical guess landed from the answer, counting every guess you made.
            </Text>
            <Text style={[styles.sheetBody, { color: colors.textMuted }]}>
              Say one round's number was 342 and you guessed 500, then 400, then 350, then 342.
              Those guesses were 158, 58, 8 and 0 away — 224 altogether, across four guesses.
            </Text>
            <View style={[styles.sheetSum, { borderColor: colors.border }]}>
              <Text style={[styles.sheetSumText, { color: colors.text }]}>224 ÷ 4 = 56</Text>
            </View>
            <Text style={[styles.sheetBody, { color: colors.textMuted }]}>
              Every round adds in the same way — a day for today's board, a month for the season,
              everything you have played for all time.
            </Text>
            <Text style={[styles.sheetBody, { color: colors.textMuted }]}>
              Lower is better. When two players finish level on points, the closer guesses rank
              higher.
            </Text>
            </>
            ) : null}
            <Pressable onPress={() => { playTap(); setSheet(null); }} style={styles.sheetClose}>
              <Text style={[styles.sheetCloseText, { color: colors.text }]}>Got it</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  screenTitle: {
    fontSize: 26,
    fontFamily: fonts.extraBold,
    letterSpacing: -0.4,
    textAlign: 'center',
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 6,
  },
  segments: { flexDirection: 'row', gap: 6, paddingHorizontal: 14, paddingTop: 12 },
  segment: { flex: 1, borderRadius: 11, paddingVertical: 9, alignItems: 'center' },
  segmentText: { fontSize: 12, fontFamily: fonts.extraBold },
  // Your own day, set apart from the podium above it.
  mine: {
    borderWidth: border.hairline,
    borderRadius: radius.button,
    marginHorizontal: 20,
    // The line under the tabs used to hold this off them. With the line gone
    // the card sat against the tab row with nothing between the two.
    marginTop: 14,
    marginBottom: 12,
    paddingVertical: 14,
    alignItems: 'center',
    gap: 2,
  },
  mineLead: { fontSize: 10.5, fontFamily: fonts.bold, letterSpacing: 1.8 },
  mineScore: { ...numeral(46), fontFamily: fonts.extraBold },
  scrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center', padding: 26 },
  sheet: { borderWidth: border.hairline, borderRadius: radius.panel, padding: 22, gap: 10, maxWidth: 420, width: '100%' },
  sheetTitle: { fontSize: 21, fontFamily: fonts.extraBold, letterSpacing: -0.4 },
  sheetBody: { fontSize: 14, fontFamily: fonts.medium, lineHeight: 21 },
  sheetSum: { borderWidth: border.hairline, borderRadius: radius.tile, paddingVertical: 11, alignItems: 'center', marginVertical: 2 },
  sheetSumText: { fontSize: 15, fontFamily: fonts.extraBold },
  sheetClose: { alignSelf: 'flex-end', paddingTop: 6, paddingHorizontal: 4 },
  sheetCloseText: { fontSize: 14, fontFamily: fonts.extraBold },
  // Fixed widths, not minimums, and the same ones the number columns use: a
  // label sized to its own text - AVG OFF against DAYS - grew its cell and
  // shoved POINTS sideways, so the two tabs disagreed with each other.
  //
  // paddingRight is the row's 13 and only the row's 13. This header lives
  // inside the list, which already applies its own 14 to everything in it, so
  // adding the two together counted that padding twice and stood the labels a
  // clean 14 to the left of the numbers they name.
  // alignItems centre, and one lineHeight shared by both cells. The ⓘ is a
  // taller glyph than any letter beside it, so the cell containing it built a
  // taller line box - and with nothing saying how to align them vertically,
  // the two labels sat at different heights.
  filter: { flexShrink: 0, flexDirection: 'row', borderRadius: radius.pill, padding: 3 },
  filterTab: { borderRadius: radius.pill, paddingHorizontal: 11, paddingVertical: 6 },
  filterText: { fontSize: 11.5, fontFamily: fonts.extraBold },
  tools: { flexDirection: 'row', gap: 8, paddingBottom: 10 },
  search: {
    flex: 1,
    borderWidth: border.hairline,
    borderRadius: radius.tile,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13.5,
    fontFamily: fonts.semiBold,
  },
  searchBtn: { borderWidth: border.hairline, borderRadius: radius.tile, paddingHorizontal: 14, justifyContent: 'center' },
  searchBtnText: { fontSize: 13, fontFamily: fonts.extraBold },
  hints: { borderWidth: border.hairline, borderRadius: radius.tile, marginBottom: 10, overflow: 'hidden' },
  hintRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 9 },
  hintName: { flex: 1, fontSize: 13.5, fontFamily: fonts.bold },
  hintRank: { fontSize: 12, fontFamily: fonts.bold },
  foundRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 8 },
  foundClear: { fontSize: 12, fontFamily: fonts.extraBold, textDecorationLine: 'underline' },
  foundNote: { flex: 1, fontSize: 12, fontFamily: fonts.bold },
  showMore: { borderWidth: border.hairline, borderRadius: radius.tile, paddingVertical: 12, alignItems: 'center', marginTop: 4 },
  showMoreText: { fontSize: 13, fontFamily: fonts.extraBold },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 10,
    paddingLeft: 13,
    paddingRight: 13,
    paddingBottom: 5,
  },
  /** Takes the slack, so the other two stay pinned where the rows put them. */
  headBoard: {
    flex: 1,
    fontSize: 8.5,
    lineHeight: 14,
    fontFamily: fonts.bold,
    letterSpacing: 0.6,
  },
  headSub: { fontSize: 8.5, lineHeight: 14, fontFamily: fonts.bold, letterSpacing: 0.6, width: 56, textAlign: 'right' },
  /** The league column: a shape centred under its label rather than a number
      pushed against the right edge. */
  headLeague: { fontSize: 8.5, lineHeight: 14, fontFamily: fonts.bold, letterSpacing: 0.6, width: 52, textAlign: 'center' },
  leagueCell: { width: 52, alignItems: 'center' },
  headValue: { fontSize: 8.5, lineHeight: 14, fontFamily: fonts.bold, letterSpacing: 0.6, width: 46, textAlign: 'right' },
  sheetLead: { fontSize: 15, fontFamily: fonts.extraBold, lineHeight: 21 },
  mineNote: { fontSize: 11.5, fontFamily: fonts.medium, textAlign: 'center', paddingHorizontal: 16 },
  note: { fontSize: 11.5, fontFamily: fonts.medium, lineHeight: 16, paddingHorizontal: 16, paddingTop: 10 },
  // No gap. The rows are separated by their own hairline now, and 8 points
  // between them would leave each line floating in space instead of dividing
  // one row from the next.
  list: { padding: 14 },
  // A list, not nineteen boxes.
  //
  // Every row was a bordered, rounded, filled card - so a leaderboard of
  // nineteen people was nineteen identical pills stacked up, which is a lot of
  // furniture around what is really just names and numbers. One hairline
  // between rows carries the same separation and lets the type do the work.
  //
  // Your own row keeps a fill, because it is the one row somebody is scanning
  // for and a hairline cannot mark it.
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: border.hairline,
    paddingVertical: 13,
    paddingHorizontal: 13,
    gap: 10,
  },
  rank: { width: 20, fontSize: 13, fontFamily: fonts.extraBold },
  medal: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  medalText: { fontSize: 11, fontFamily: fonts.extraBold },
  name: { flex: 1, fontSize: 15, fontFamily: fonts.bold },
  nameMe: { fontFamily: fonts.extraBold },
  crown: { fontSize: 9, fontFamily: fonts.extraBold, letterSpacing: 1 },
  unit: { fontSize: 11, fontFamily: fonts.medium },
  sub: { fontSize: 11.5, fontFamily: fonts.bold, width: 56, textAlign: 'right' },
  // Fixed width so the column header above it lines up with the numbers.
  value: { fontSize: 16, fontFamily: fonts.extraBold, width: 46, textAlign: 'right' },
  empty: { fontSize: 13, fontFamily: fonts.medium, lineHeight: 19, padding: 18 },
});

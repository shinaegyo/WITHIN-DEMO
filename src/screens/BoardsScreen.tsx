import React, { useCallback, useEffect, useState } from 'react';
import { Modal, Platform, Pressable, TextInput, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '../components/AppText';
import { Avatar } from '../components/Avatar';
import { ScreenTitle } from '../components/ScreenTitle';
import { PlayerCardModal } from '../components/PlayerCard';
import { StatusScreen } from '../components/StatusScreen';
import {
  ApiError,
  loadAllTimeLeaderboard,
  loadLeaderboard,
  loadSeasonLeaderboard,
  loadBoardWindow,
  findPlayer,
  suggestPlayers,
  PlayerSuggestion,
  Leaderboard,
  SeasonLeaderboard,
  AllTimeLeaderboard,
  messageFor,
} from '../lib/api';
import { fonts } from '../theme/fonts';
import { useTrack } from '../utils/useTrack';
import { MEDALS } from '../theme/medals';
import { useTheme } from '../theme/ThemeContext';
import { playTap } from '../utils/sound';

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
 * that has nothing to do with the daily. Rush and Window already keep their
 * boards where they are played, which is the pattern; adding them here would
 * have made four tabs of which three were duplicates.
 *
 * So this tab means one thing: the daily, which is the only mode that scores
 * points, keeps a streak, or places anybody.
 */
type Board = 'today' | 'season' | 'alltime';


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
  /** Shown small beside the value: today's board uses it for precision. */
  sub?: string;
  isMe: boolean;
  crown?: boolean;
}

const TABS: { key: Board; label: string; note: string }[] = [
  // The columns are explained under the board rather than above it: nothing
  // should stand between opening this tab and seeing the standings, and the
  // question only occurs to somebody who has already looked at the rows.
  { key: 'today', label: 'Today', note: 'Points from today’s three rounds. Finished days only.' },
  {
    key: 'season',
    label: 'Season',
    note: 'Points from this month’s dailies. It resets on the 1st, so a good month beats a long history.',
  },
  { key: 'alltime', label: 'All time', note: 'Points from every daily challenge played.' },
];

export function BoardsScreen() {
  // Silent. Music belongs to playing, not to the rooms around it - and it has
  // to be asked for, because a screen that says nothing keeps whatever the
  // last one started, so this kept a mode's track playing over a list.
  useTrack(null);
  const { colors } = useTheme();
  const [tab, setTab] = useState<Board>('today');
  const [rows, setRows] = useState<Partial<Record<Board, Row[]>>>({});
  const [error, setError] = useState<string | null>(null);
  const [looking, setLooking] = useState<string | null>(null);
  const [explain, setExplain] = useState<Board | null>(null);
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

  const toRow = (e: {
    rank: number; name: string; avatar: string | null; score: number; avgOff: number; isMe: boolean;
  }): Row => ({
    rank: e.rank, name: e.name, avatar: e.avatar,
    value: `${e.score}`, sub: tab === 'alltime' ? undefined : `${e.avgOff}`, isMe: e.isMe,
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
  const centreOn = async (id: string, label: string | null) => {
    setBusy(true);
    try {
      const w = await loadBoardWindow(tab, friends, { around: id, limit: 7 });
      setMore(w.entries.map(toRow));
      setNextFrom(w.from + w.entries.length - 1);
      setEnded(false);
      setFound(label);
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
      else await centreOn(r.userId, `Around ${r.name}`);
    } catch {
      setFound('Could not search just now.');
    } finally {
      setBusy(false);
    }
  };
  // Today's board carries more than a list: where you came as a share of the
  // field, how many people are level with you, and the shape of the day.
  const [today, setToday] = useState<Leaderboard | null>(null);
  const [allTime, setAllTime] = useState<AllTimeLeaderboard | null>(null);
  const [season, setSeason] = useState<SeasonLeaderboard | null>(null);

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
              value: `${e.score}`, sub: `${e.avgOff}`, isMe: e.isMe,
            })),
          }));
        } else if (which === 'season') {
          const b = await loadSeasonLeaderboard(friends);
          setSeason(b);
          setRows((r) => ({
            ...r,
            season: b.entries.map((e) => ({
              rank: e.rank, name: e.name, avatar: e.avatar,
              value: `${e.score}`, sub: `${e.avgOff}`, isMe: e.isMe,
            })),
          }));
        } else if (which === 'alltime') {
          const b = await loadAllTimeLeaderboard(friends);
          setAllTime(b);
          setRows((r) => ({
            ...r,
            alltime: b.entries.map((e) => ({
              rank: e.rank, name: e.name, avatar: e.avatar,
              value: `${e.score}`, isMe: e.isMe, crown: e.hasBelt,
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
  const note = TABS.find((t) => t.key === tab)!.note;

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
                  setAllTime(null);
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
                : { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 },
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

      <Text style={[styles.note, { color: colors.textMuted }]}>{note}</Text>

      {/* Your day, before the podium.
          A position is the wrong instrument once there are thousands of
          players - nobody is glad to be four-thousandth at something they did
          well - so this says how you did rather than what number you are, and
          states the tie instead of hiding it. */}
      {tab === 'season' && season && (
        <View style={[styles.mine, { borderColor: colors.border }]}>
          <Text style={[styles.mineLead, { color: colors.textMuted }]}>
            {season.me ? standing(season.me, season.totalPlayers, 'THIS SEASON') : 'NOT ON THIS SEASON YET'}
          </Text>
          <View style={styles.mineLine}>
            <Text style={[styles.mineScore, { color: colors.text }]}>
              {(season.me?.score ?? 0).toLocaleString()}
            </Text>
            <Text style={[styles.mineUnit, { color: colors.textMuted }]}>points</Text>
          </View>
          {/* The countdown is the whole reason a season is different from a
              running total: it is the thing that makes the last week matter. */}
          <Text style={[styles.mineNote, { color: colors.textMuted }]}>
            {seasonName(season.season)} ends in {daysLeft(season.endsOn)}
            {season.me ? ` · ${season.me.days} played, ${season.me.avgOff} avg off` : ' · play one to join it'}
          </Text>
        </View>
      )}

      {tab === 'alltime' && allTime?.me && (
        <View style={[styles.mine, { borderColor: colors.border }]}>
          <Text style={[styles.mineLead, { color: colors.textMuted }]}>
            {standing(allTime.me, allTime.totalPlayers, 'ALL TIME')}
          </Text>
          <View style={styles.mineLine}>
            <Text style={[styles.mineScore, { color: colors.text }]}>
              {allTime.me.score.toLocaleString()}
            </Text>
            <Text style={[styles.mineUnit, { color: colors.textMuted }]}>points</Text>
          </View>
          <Text style={[styles.mineNote, { color: colors.textMuted }]}>
            {allTime.me.daysPlayed} {allTime.me.daysPlayed === 1 ? 'day' : 'days'} played, and your
            guesses landed {allTime.me.avgOff} away on average.
          </Text>
        </View>
      )}

      {tab === 'today' && today?.me && (
        <View style={[styles.mine, { borderColor: colors.border }]}>
          <Text style={[styles.mineLead, { color: colors.textMuted }]}>
            {standing(today.me, today.totalPlayers, 'TODAY')}
          </Text>
          {/* One line. Stacked, the unit read as a third label in a card that
              already had two, and put a line break between a number and the
              word that says what it is. */}
          <View style={styles.mineLine}>
            <Text style={[styles.mineScore, { color: colors.text }]}>{today.me.score}</Text>
            <Text style={[styles.mineUnit, { color: colors.textMuted }]}>
              {today.me.score === 1 ? 'point' : 'points'}
            </Text>
          </View>
          {/* The explanation is unconditional. It used to ride along with the
              tie - "4 players on this score, the closer guesses rank higher" -
              so on any day you were alone on your score, nothing on the screen
              said what AVG OFF was for. The column was there every day and the
              reason for it only some days. */}
          <Text style={[styles.mineNote, { color: colors.textMuted }]}>
            Your guesses landed {today.me.avgOff} away on average — closer guesses rank higher when
            scores are level.
            {today.me.playersOnScore > 1
              ? ` ${today.me.playersOnScore.toLocaleString()} players finished on ${today.me.score}.`
              : ''}
          </Text>

        </View>
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
                    setQuery(h.name);
                    setHints([]);
                    if (h.rank === null) setFound(`${h.name} has not played this one.`);
                    else centreOn(h.userId, `Around ${h.name}`);
                  }}
                  style={({ pressed }) => [styles.hintRow, { opacity: pressed ? 0.6 : 1 }]}
                >
                  <Avatar value={h.avatar} size={24} />
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
                <Text style={[styles.foundClear, { color: colors.text }]}>Back to the top</Text>
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
            <Text style={[styles.headValue, { color: colors.textMuted }]}>POINTS</Text>
            {tab !== 'alltime' && (
              <Pressable onPress={() => { playTap(); setExplain(tab); }} hitSlop={10}>
                <Text style={[styles.headSub, { color: colors.textMuted }]}>AVG OFF ⓘ</Text>
              </Pressable>
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
                e.isMe
                  ? { borderColor: colors.accent, borderWidth: 2, backgroundColor: colors.surfaceAlt }
                  : { borderColor: colors.border, borderWidth: 1, backgroundColor: colors.surface },
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

              <Avatar value={e.avatar} size={30} />

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
              {!!e.sub && <Text style={[styles.sub, { color: colors.textMuted }]}>{e.sub}</Text>}
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
                e.isMe
                  ? { borderColor: colors.accent, borderWidth: 2, backgroundColor: colors.surfaceAlt }
                  : { borderColor: colors.border, backgroundColor: colors.surface },
              ]}
            >
              <Text style={[styles.rank, { color: colors.textMuted }]}>{e.rank}</Text>
              <Avatar value={e.avatar} size={30} />
              <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>
                {e.name}
              </Text>
              {/* Points then precision, the same way round as the podium. This
                  block was written separately and inherited the order the
                  podium had before it was swapped. */}
              <Text style={[styles.value, { color: colors.text }]}>{e.value}</Text>
              {!!e.sub && <Text style={[styles.sub, { color: colors.textMuted }]}>{e.sub}</Text>}
            </Pressable>
          ))}

          {!ended && (
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

      <PlayerCardModal username={looking} onClose={() => setLooking(null)} />

      <Modal visible={explain !== null} transparent animationType="fade" onRequestClose={() => setExplain(null)}>
        <Pressable style={styles.scrim} onPress={() => setExplain(null)}>
          <Pressable
            style={[styles.sheet, { backgroundColor: colors.surface, borderColor: colors.border }]}
            onPress={() => {}}
          >
            {/* One sheet: today, the season and all time all break ties on
                the same measure, so there is one thing to explain. */}
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
            <Pressable onPress={() => { playTap(); setExplain(null); }} style={styles.sheetClose}>
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
    borderWidth: 1,
    borderRadius: 16,
    marginHorizontal: 20,
    marginBottom: 12,
    paddingVertical: 14,
    alignItems: 'center',
    gap: 2,
  },
  mineLead: { fontSize: 10.5, fontFamily: fonts.bold, letterSpacing: 1.8 },
  mineScore: { fontSize: 46, fontFamily: fonts.extraBold, letterSpacing: -2, lineHeight: 52 },
  mineLine: { flexDirection: 'row', alignItems: 'baseline', gap: 7 },
  mineUnit: { fontSize: 15, fontFamily: fonts.bold },
  scrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center', padding: 26 },
  sheet: { borderWidth: 1, borderRadius: 20, padding: 22, gap: 10, maxWidth: 420, width: '100%' },
  sheetTitle: { fontSize: 21, fontFamily: fonts.extraBold, letterSpacing: -0.4 },
  sheetBody: { fontSize: 14, fontFamily: fonts.medium, lineHeight: 21 },
  sheetSum: { borderWidth: 1, borderRadius: 12, paddingVertical: 11, alignItems: 'center', marginVertical: 2 },
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
  filter: { flexShrink: 0, flexDirection: 'row', borderRadius: 999, padding: 3 },
  filterTab: { borderRadius: 999, paddingHorizontal: 11, paddingVertical: 6 },
  filterText: { fontSize: 11.5, fontFamily: fonts.extraBold },
  tools: { flexDirection: 'row', gap: 8, paddingBottom: 10 },
  search: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13.5,
    fontFamily: fonts.semiBold,
  },
  searchBtn: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, justifyContent: 'center' },
  searchBtnText: { fontSize: 13, fontFamily: fonts.extraBold },
  hints: { borderWidth: 1, borderRadius: 12, marginBottom: 10, overflow: 'hidden' },
  hintRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 9 },
  hintName: { flex: 1, fontSize: 13.5, fontFamily: fonts.bold },
  hintRank: { fontSize: 12, fontFamily: fonts.bold },
  foundRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 8 },
  foundClear: { fontSize: 12, fontFamily: fonts.extraBold, textDecorationLine: 'underline' },
  foundNote: { flex: 1, fontSize: 12, fontFamily: fonts.bold },
  showMore: { borderWidth: 1, borderRadius: 12, paddingVertical: 12, alignItems: 'center', marginTop: 4 },
  showMoreText: { fontSize: 13, fontFamily: fonts.extraBold },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 10,
    paddingRight: 13,
    paddingBottom: 5,
  },
  headSub: { fontSize: 8.5, lineHeight: 14, fontFamily: fonts.bold, letterSpacing: 0.6, width: 56, textAlign: 'right' },
  headValue: { fontSize: 8.5, lineHeight: 14, fontFamily: fonts.bold, letterSpacing: 0.6, width: 46, textAlign: 'right' },
  mineNote: { fontSize: 11.5, fontFamily: fonts.medium, textAlign: 'center', paddingHorizontal: 16 },
  note: { fontSize: 11.5, fontFamily: fonts.medium, lineHeight: 16, paddingHorizontal: 16, paddingTop: 10 },
  list: { padding: 14, gap: 8 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    paddingVertical: 12,
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

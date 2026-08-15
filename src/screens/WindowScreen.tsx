import React, { useCallback, useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { Text } from '../components/AppText';
import { Avatar } from '../components/Avatar';
import { GuessBoard } from '../components/GuessBoard';
import { NumberInput } from '../components/NumberInput';
import { ScreenTitle } from '../components/ScreenTitle';
import { StatusScreen } from '../components/StatusScreen';
import {
  ApiError,
  WindowEntry,
  WindowState,
  loadWindow,
  loadWindowBoard,
  messageFor,
  windowProbe,
  windowSubmit,
} from '../lib/api';
import { feedbackColors } from '../theme/colors';
import { fonts } from '../theme/fonts';
import { MEDALS } from '../theme/medals';
import { useTheme } from '../theme/ThemeContext';
import { hapticForTier, hapticInvalid } from '../utils/haptics';
import { playForTier, playLose, playTap, playWin } from '../utils/sound';

/**
 * Window: three probes, then commit to a range.
 *
 * Every other mode asks for the number. This one asks how sure you are, and the
 * whole game is in one rule - score is 101 minus the width of the span you
 * commit to, and nothing at all if the number is outside it. Three probes leave
 * a range you know is safe; taking it is worth what it is worth, and halving it
 * is worth twice that with everything at stake.
 *
 * The probes are drawn on the same board as every other mode, because they are
 * the same thing: a guess, answered by how close it was. What changes is that
 * finding the number is not the point - saying how sure you are is.
 */
/** The spreads worth offering: one tap each, and every one a different bet. */
const SPREADS = [0, 3, 5, 10, 20, 35];

export function WindowScreen({ onExit }: { onExit: () => void }) {
  const { colors } = useTheme();
  const [state, setState] = useState<WindowState | null>(null);
  const [board, setBoard] = useState<WindowEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [rules, setRules] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [centre, setCentre] = useState('');
  const [spread, setSpread] = useState(5);
  const [result, setResult] = useState<
    { inside: boolean; width: number; score: number; answer: number } | null
  >(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setState(await loadWindow());
      loadWindowBoard().then(setBoard).catch(() => {});
    } catch (err) {
      setError(messageFor(err instanceof ApiError ? err.code : 'network'));
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const probe = useCallback(
    async (value: number) => {
      if (busy) return { ok: false as const, error: 'Not now.' };
      setBusy(true);
      try {
        const res = await windowProbe(value);
        hapticForTier(res.result.tier);
        playForTier(res.result.tier);
        await load();
        return { ok: true as const };
      } catch (err) {
        hapticInvalid();
        return { ok: false as const, error: messageFor(err instanceof ApiError ? err.code : 'network') };
      } finally {
        setBusy(false);
      }
    },
    [busy, load],
  );

  const commit = async () => {
    if (!span) {
      setNote('Enter the number you are aiming at.');
      return;
    }
    const a = span.lo;
    const b = span.hi;
    playTap();
    setBusy(true);
    try {
      const res = await windowSubmit(a, b);
      setResult(res);
      if (res.inside) playWin();
      else playLose();
      await load();
    } catch (err) {
      setNote(messageFor(err instanceof ApiError ? err.code : 'network'));
    } finally {
      setBusy(false);
    }
  };

  if (error) return <StatusScreen message={error} onRetry={load} />;
  if (!state) return <StatusScreen loading />;

  // A centre and a spread become the span the server wants. Clamped at the ends
  // of the range, which can only ever narrow it - and a narrower window scores
  // more, so the edge case pays rather than punishes.
  const span = (() => {
    const c = parseInt(centre, 10);
    if (!c || c < 1 || c > 1000) return null;
    const lo = Math.max(1, c - spread);
    const hi = Math.min(1000, c + spread);
    return { lo, hi, width: hi - lo + 1 };
  })();

  const standings = () =>
    board.length === 0 ? null : (
      <View style={styles.board}>
        <Text style={[styles.boardTitle, { color: colors.textMuted }]}>NARROWEST TODAY</Text>
        <View style={styles.row}>
          <Text style={[styles.rank, { color: 'transparent' }]}>0</Text>
          <View style={styles.spacer} />
          <Text style={[styles.colHead, { color: colors.textMuted }]}>WIDTH</Text>
          <Text style={[styles.colHeadRight, { color: colors.textMuted }]}>SCORE</Text>
        </View>
        {board.map((e, i) => (
          <View key={`${e.rank}-${e.name}-${i}`} style={styles.row}>
            {MEDALS[e.rank] ? (
              <View style={[styles.medal, { backgroundColor: MEDALS[e.rank].ring }]}>
                <Text style={[styles.medalText, { color: MEDALS[e.rank].ink }]}>{e.rank}</Text>
              </View>
            ) : (
              <Text style={[styles.rank, { color: colors.textMuted }]}>{e.rank}</Text>
            )}
            <Avatar value={e.avatar} size={24} />
            <Text
              style={[styles.name, { color: colors.text }, e.isMe && styles.me]}
              numberOfLines={1}
            >
              {e.name}
            </Text>
            <Text style={[styles.width, { color: colors.textMuted }]}>{e.width}</Text>
            <Text style={[styles.score, { color: colors.text }]}>{e.score}</Text>
          </View>
        ))}
      </View>
    );

  const done = state.submitted;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]} edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {!state.started || done ? (
          <>
            <ScreenTitle
              title="Window"
              subtitle="Three probes, then commit to a range the number is inside. The narrower it is, the more it scores."
              onBack={onExit}
            />
            <ScrollView contentContainerStyle={styles.intro} showsVerticalScrollIndicator={false}>
              {done && (
                <View style={[styles.card, { borderColor: colors.border }]}>
                  <Text style={[styles.bigScore, { color: colors.text }]}>{state.score}</Text>
                  <Text style={[styles.scoreLabel, { color: colors.textMuted }]}>
                    {state.score === 1 ? 'POINT' : 'POINTS'}
                  </Text>
                  <Text style={[styles.rule, { color: colors.textMuted }]}>
                    {state.score > 0
                      ? `It was ${state.answer}, inside your ${state.width}-wide window.`
                      : `It was ${state.answer}, outside your window of ${state.lo}–${state.hi}.`}
                  </Text>
                </View>
              )}

              {standings()}

              <Pressable
                onPress={() => {
                  playTap();
                  setRules((r) => !r);
                }}
                style={styles.rulesToggle}
              >
                <Text style={[styles.rulesLink, { color: colors.textMuted }]}>How it works</Text>
                <Svg width={14} height={14} viewBox="0 0 24 24" style={rules ? styles.up : undefined}>
                  <Path
                    d="M6 9.5 12 15.5l6-6"
                    stroke={colors.textMuted}
                    strokeWidth={2.4}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    fill="none"
                  />
                </Svg>
              </Pressable>

              {rules && (
                <>
                  <Text style={[styles.rule, { color: colors.textMuted }]}>
                    Three probe guesses, answered with the same colours as everywhere else: blue
                    means aim higher, red means lower, and the stronger the colour the closer you
                    are. They cost nothing and none of them ends the round.
                  </Text>
                  <Text style={[styles.rule, { color: colors.textMuted }]}>
                    Then you commit to a range — 525 to 560 — that the number has to be inside.
                    Your score is 101 minus the width of it. A window of 1 is 100 points, a window
                    of 40 is 61, and a window of 100 is 1. If the number is outside, it is nothing.
                  </Text>
                  <Text style={[styles.rule, { color: colors.textMuted }]}>
                    One a day, the same number for everyone, and every point is an XP toward your
                    level.
                  </Text>
                </>
              )}
            </ScrollView>

            {!done && (
              <View style={[styles.foot, { borderColor: colors.border }]}>
                <Text style={[styles.footNote, { color: colors.textMuted }]}>
                  One a day · three probes
                </Text>
                <Pressable
                  onPress={() => {
                    playTap();
                    setState({ ...state, started: true });
                  }}
                  style={({ pressed }) => [
                    styles.start,
                    { backgroundColor: colors.text, opacity: pressed ? 0.85 : 1 },
                  ]}
                >
                  <Text style={[styles.startText, { color: colors.background }]}>Start probing</Text>
                </Pressable>
              </View>
            )}
          </>
        ) : (
          <View style={styles.content}>
            <View style={styles.titleBleed}>
              <ScreenTitle title="Window" onBack={onExit} />
            </View>

            <Text style={[styles.probesLeft, { color: colors.text }]}>
              {state.probesLeft > 0
                ? `${state.probesLeft} ${state.probesLeft === 1 ? 'probe' : 'probes'} left`
                : 'Commit to a window'}
            </Text>

            {state.probesLeft > 0 && <NumberInput disabled={busy} onSubmit={probe} />}

            <View style={styles.boardWrap}>
              <GuessBoard guesses={state.probes} attemptsAllowed={3} showRemaining={false} />
            </View>

            {/* The commitment: a centre and a spread, not two ends.
                Nobody thinks "525 to 560" - they think "about 542, give or take
                18" - and asking for the ends made the player do the arithmetic
                the game is scoring. The spread is the whole decision, so it is
                a row of taps rather than a number to type. */}
            <View style={[styles.commit, { borderColor: colors.border }]}>
              <View style={styles.centreRow}>
                <TextInput
                  style={[styles.centreField, { color: colors.text, borderColor: colors.border }]}
                  value={centre}
                  onChangeText={(t) => setCentre(t.replace(/[^0-9]/g, '').slice(0, 4))}
                  placeholder="your number"
                  placeholderTextColor={colors.textMuted}
                  keyboardType="number-pad"
                  inputMode="numeric"
                />
              </View>

              <View style={styles.spreads}>
                {SPREADS.map((s2) => {
                  const on = spread === s2;
                  return (
                    <Pressable
                      key={s2}
                      onPress={() => {
                        playTap();
                        setSpread(s2);
                      }}
                      style={[
                        styles.spread,
                        on
                          ? { backgroundColor: colors.text }
                          : { borderColor: colors.border, borderWidth: 1 },
                      ]}
                    >
                      <Text
                        style={[
                          styles.spreadText,
                          { color: on ? colors.background : colors.textMuted },
                        ]}
                      >
                        {s2 === 0 ? 'exact' : `±${s2}`}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <Text style={[styles.worth, { color: span ? colors.text : colors.textMuted }]}>
                {span
                  ? `${span.lo}–${span.hi} · ${span.width} wide · worth ${101 - span.width}`
                  : 'A window of 1 is worth 100'}
              </Text>

              {note && <Text style={[styles.note, { color: feedbackColors.oneAway }]}>{note}</Text>}

              <Pressable
                onPress={commit}
                disabled={busy || !span}
                style={({ pressed }) => [
                  styles.start,
                  {
                    backgroundColor: span ? colors.text : colors.border,
                    opacity: pressed ? 0.85 : 1,
                  },
                ]}
              >
                <Text
                  style={[styles.startText, { color: span ? colors.background : colors.textMuted }]}
                >
                  Commit
                </Text>
              </Pressable>
            </View>
          </View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  flex: { flex: 1 },
  content: { flex: 1, paddingHorizontal: 18, gap: 10, alignSelf: 'stretch' },
  intro: { paddingHorizontal: 18, paddingBottom: 20, gap: 12 },
  card: { borderWidth: 1, borderRadius: 18, padding: 18, alignItems: 'center', gap: 4 },
  bigScore: { fontSize: 72, fontFamily: fonts.extraBold, letterSpacing: -3, lineHeight: 78 },
  scoreLabel: { fontSize: 10, fontFamily: fonts.bold, letterSpacing: 1.8 },
  rule: { fontSize: 13, fontFamily: fonts.medium, lineHeight: 19, textAlign: 'center' },
  rulesToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    paddingVertical: 8,
    marginTop: 12,
  },
  rulesLink: { fontSize: 12.5, fontFamily: fonts.bold },
  up: { transform: [{ rotate: '180deg' }] },
  foot: {
    borderTopWidth: 1,
    paddingTop: 12,
    paddingBottom: 8,
    paddingHorizontal: 18,
    gap: 8,
  },
  footNote: { fontSize: 11.5, fontFamily: fonts.medium, textAlign: 'center' },
  start: { borderRadius: 16, paddingVertical: 15, alignItems: 'center' },
  startText: { fontSize: 16, fontFamily: fonts.extraBold },
  titleBleed: { marginHorizontal: -18 },
  probesLeft: { fontSize: 14, fontFamily: fonts.extraBold, textAlign: 'center' },
  boardWrap: { flex: 1 },
  commit: { borderTopWidth: 1, paddingTop: 12, paddingBottom: 6, gap: 10 },
  centreRow: { alignSelf: 'stretch' },
  centreField: {
    alignSelf: 'stretch',
    minWidth: 0,
    borderWidth: 1.5,
    borderRadius: 14,
    paddingVertical: 13,
    textAlign: 'center',
    fontSize: 22,
    fontFamily: fonts.extraBold,
  },
  spreads: { flexDirection: 'row', gap: 6, alignSelf: 'stretch' },
  spread: { flex: 1, minWidth: 0, borderRadius: 10, paddingVertical: 9, alignItems: 'center' },
  spreadText: { fontSize: 12, fontFamily: fonts.extraBold },
  worth: { fontSize: 12.5, fontFamily: fonts.bold, textAlign: 'center' },
  note: { fontSize: 12, fontFamily: fonts.bold, textAlign: 'center' },
  board: { gap: 6, marginTop: 4 },
  boardTitle: { fontSize: 9.5, fontFamily: fonts.bold, letterSpacing: 1.4, textAlign: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  spacer: { flex: 1 },
  rank: { width: 20, fontSize: 12, fontFamily: fonts.extraBold, textAlign: 'center' },
  medal: { width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  medalText: { fontSize: 10, fontFamily: fonts.extraBold },
  name: { flex: 1, fontSize: 13.5, fontFamily: fonts.bold },
  me: { textDecorationLine: 'underline' },
  width: { fontSize: 12, fontFamily: fonts.bold, width: 46, textAlign: 'right' },
  score: { fontSize: 15, fontFamily: fonts.extraBold, width: 42, textAlign: 'right' },
  colHead: { fontSize: 8.5, fontFamily: fonts.bold, letterSpacing: 0.6, width: 46, textAlign: 'right' },
  colHeadRight: { fontSize: 8.5, fontFamily: fonts.bold, letterSpacing: 0.6, width: 42, textAlign: 'right' },
});

import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '../components/AppText';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AVATAR_COLORS, Avatar, CHARACTERS, COLOR_KEYS, parseAvatar } from '../components/Avatar';
import { setAvatar } from '../lib/api';
import { fonts } from '../theme/fonts';
import { useTrack } from '../utils/useTrack';
import { useTheme } from '../theme/ThemeContext';
import { playTap } from '../utils/sound';

/**
 * Pick a character and a colour.
 *
 * Thirty characters and six colours rather than an upload, so nothing has to be
 * stored, resized or moderated - and everybody stays legible at the size a
 * leaderboard row actually gives them.
 *
 * The preview sits at the top with the player's name beside it, because that is
 * the thing being chosen: not a picture, but how they appear to everyone else.
 */
export function AvatarScreen({
  username,
  current,
  onDone,
  onSkip,
  step,
  total,
}: {
  username: string;
  current?: string | null;
  step?: number;
  total?: number;
  onDone: (value: string) => void;
  /** Only offered during the tutorial, where the game has not started yet. */
  onSkip?: () => void;
}) {
  // Silent. Music belongs to playing, not to the rooms around it - and it has
  // to be asked for, because a screen that says nothing keeps whatever the
  // last one started, so this kept a mode's track playing over a list.
  useTrack(null);
  const { colors } = useTheme();
  const start = parseAvatar(current);
  const [character, setCharacter] = useState(start.character);
  const [color, setColor] = useState(start.color);
  const [busy, setBusy] = useState(false);

  const value = `${character}-${color}`;

  const save = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await setAvatar(value);
      onDone(value);
    } catch {
      // Worst case they keep the one they had; never strand them here.
      onDone(value);
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]} edges={['top', 'bottom']}>
      {!!step && (
        <Text style={[styles.step, { color: colors.textMuted }]}>
          STEP {step} OF {total}
        </Text>
      )}
      <View style={styles.head}>
        <Avatar value={value} size={78} />
        <View style={styles.headText}>
          <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>
            {username}
          </Text>
          <Text style={[styles.sub, { color: colors.textMuted }]}>
            This is how you appear on every board.
          </Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <Text style={[styles.label, { color: colors.textMuted }]}>COLOUR</Text>
        <View style={styles.colors}>
          {COLOR_KEYS.map((key) => (
            <Pressable
              key={key}
              onPress={() => {
                playTap();
                setColor(key);
              }}
              style={[
                styles.swatch,
                { backgroundColor: AVATAR_COLORS[key] },
                key === color && { borderColor: colors.text, borderWidth: 3 },
              ]}
            />
          ))}
        </View>

        <Text style={[styles.label, { color: colors.textMuted }]}>CHARACTER</Text>
        <View style={styles.grid}>
          {CHARACTERS.map((c) => (
            <Pressable
              key={c.key}
              onPress={() => {
                playTap();
                setCharacter(c.key);
              }}
              style={[
                styles.cell,
                { borderColor: c.key === character ? colors.accent : 'transparent' },
              ]}
            >
              <Avatar value={`${c.key}-${color}`} size={52} />
            </Pressable>
          ))}
        </View>
      </ScrollView>

      <View style={styles.foot}>
        <Pressable
          onPress={save}
          disabled={busy}
          style={({ pressed }) => [
            styles.button,
            { backgroundColor: colors.text, opacity: pressed || busy ? 0.85 : 1 },
          ]}
        >
          <Text style={[styles.buttonText, { color: colors.background }]}>
            {current ? 'Save' : "That's me"}
          </Text>
        </Pressable>
        {onSkip && (
          <Pressable onPress={onSkip} style={styles.skip}>
            <Text style={[styles.skipText, { color: colors.textMuted }]}>Choose later</Text>
          </Pressable>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  step: { fontSize: 9.5, fontFamily: fonts.bold, letterSpacing: 1.4, paddingHorizontal: 22, paddingBottom: 6 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 22, paddingTop: 10 },
  headText: { flex: 1, minWidth: 0 },
  name: { fontSize: 22, fontFamily: fonts.extraBold },
  sub: { fontSize: 12.5, fontFamily: fonts.medium, marginTop: 2, lineHeight: 17 },
  body: { paddingHorizontal: 18, paddingTop: 18, paddingBottom: 20 },
  label: { fontSize: 9.5, fontFamily: fonts.bold, letterSpacing: 1.4, marginBottom: 8 },
  colors: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 22 },
  swatch: { width: '18%', height: 32, borderRadius: 10, borderWidth: 3, borderColor: 'transparent' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  cell: {
    width: '18%',
    aspectRatio: 1,
    borderRadius: 14,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  foot: { paddingHorizontal: 20, paddingBottom: 10, gap: 4 },
  button: { borderRadius: 16, paddingVertical: 15, alignItems: 'center' },
  buttonText: { fontSize: 16, fontFamily: fonts.extraBold },
  skip: { alignSelf: 'center', paddingVertical: 10 },
  skipText: { fontSize: 13, fontFamily: fonts.bold },
});

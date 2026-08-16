import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '../components/AppText';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  AVATAR_COLORS,
  Avatar,
  COLOR_KEYS,
  HAIR,
  HAIR_COLORS,
  SKIN_TONES,
  parseAvatar,
} from '../components/Avatar';
import { setAvatar } from '../lib/api';
import { fonts } from '../theme/fonts';
import { useTrack } from '../utils/useTrack';
import { useTheme } from '../theme/ThemeContext';
import { playTap } from '../utils/sound';

/**
 * Build a person, or keep your initial.
 *
 * Four choices - skin, hair, hair colour, background - drawn rather than
 * uploaded, so nothing has to be stored, resized or moderated, and everybody
 * stays legible at the size a leaderboard row actually gives them.
 *
 * The preview sits at the top with the player's name beside it, because that is
 * the thing being chosen: not a picture, but how they appear to everyone else.
 * It is shown at 24px as well, which is where it will actually be seen and the
 * size that decided which hair shapes were worth offering.
 *
 * The monogram is a real option rather than only a default. Somebody who does
 * not want to be a face should be able to say so, and everybody arrives here
 * as one.
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
  const [color, setColor] = useState(start.color);
  // Null means the monogram. The defaults are only used once somebody turns
  // a person on, so arriving here changes nothing until they choose.
  const [skin, setSkin] = useState<string | null>(start.skin ?? null);
  const [hair, setHair] = useState(start.hair ?? 'crop');
  const [hairColor, setHairColor] = useState(start.hairColor ?? 'black');
  const [busy, setBusy] = useState(false);

  // Four parts for a person, the colour alone for a monogram - the two shapes
  // parseAvatar reads.
  const value = skin ? `${skin}-${hair}-${hairColor}-${color}` : color;

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
        <Avatar value={value} size={78} name={username} />
        <View style={styles.headText}>
          <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>
            {username}
          </Text>
          <View style={styles.subRow}>
            {/* The size it is actually seen at, beside the size it is chosen
                at. A face that only works at 78px is a face nobody sees. */}
            <Avatar value={value} size={24} name={username} />
            <Text style={[styles.sub, { color: colors.textMuted }]}>
              This is how you appear on every board.
            </Text>
          </View>
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

        <Text style={[styles.label, { color: colors.textMuted }]}>YOU</Text>
        <View style={styles.row}>
          {/* The monogram first, because it is where everybody starts and the
              way back for anybody who tries a face and would rather not. */}
          <Pressable
            onPress={() => { playTap(); setSkin(null); }}
            style={[styles.cell, { borderColor: skin === null ? colors.accent : 'transparent' }]}
          >
            <Avatar value={color} size={52} name={username} />
          </Pressable>
          {Object.keys(SKIN_TONES).map((key) => (
            <Pressable
              key={key}
              onPress={() => { playTap(); setSkin(key); }}
              style={[styles.cell, { borderColor: key === skin ? colors.accent : 'transparent' }]}
            >
              <Avatar value={`${key}-${hair}-${hairColor}-${color}`} size={52} />
            </Pressable>
          ))}
        </View>

        {skin && (
          <>
            <Text style={[styles.label, { color: colors.textMuted }]}>HAIR</Text>
            <View style={styles.row}>
              {HAIR.map((h) => (
                <Pressable
                  key={h.key}
                  onPress={() => { playTap(); setHair(h.key); }}
                  style={[styles.cell, { borderColor: h.key === hair ? colors.accent : 'transparent' }]}
                >
                  <Avatar value={`${skin}-${h.key}-${hairColor}-${color}`} size={52} />
                </Pressable>
              ))}
            </View>

            <Text style={[styles.label, { color: colors.textMuted }]}>HAIR COLOUR</Text>
            <View style={styles.colors}>
              {Object.keys(HAIR_COLORS).map((key) => (
                <Pressable
                  key={key}
                  onPress={() => { playTap(); setHairColor(key); }}
                  style={[
                    styles.swatch,
                    { backgroundColor: HAIR_COLORS[key] },
                    key === hairColor && { borderColor: colors.text, borderWidth: 3 },
                  ]}
                />
              ))}
            </View>
          </>
        )}
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
  subRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
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

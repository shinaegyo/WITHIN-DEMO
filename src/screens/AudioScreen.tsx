import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { feedbackColors } from '../theme/colors';
import { fonts } from '../theme/fonts';
import { useTheme } from '../theme/ThemeContext';
import { VolumeSlider } from '../components/VolumeSlider';
import { refreshMusic } from '../utils/music';
import { playTap } from '../utils/sound';
import {
  loadMusicSetting,
  loadSoundSetting,
  loadVolumes,
  musicEnabled,
  musicVolume,
  setMusicEnabled,
  setMusicVolume,
  setSfxVolume,
  setSoundEnabled,
  sfxVolume,
  soundEnabled,
} from '../utils/soundSettings';

/**
 * Two switches, because they are two different things.
 *
 * Effects are information - the tone tells you how close a guess was, before
 * you have read the tile. Music is decoration. Somebody on a train wants the
 * second one off and the first one on, and a single "sound" switch makes that
 * impossible.
 */
export function AudioScreen() {
  const { colors } = useTheme();
  const [sfx, setSfx] = useState(soundEnabled());
  const [music, setMusic] = useState(musicEnabled());
  const [sfxVol, setSfxVol] = useState(sfxVolume());
  const [musicVol, setMusicVol] = useState(musicVolume());

  useEffect(() => {
    loadSoundSetting().then(setSfx);
    loadMusicSetting().then(setMusic);
    loadVolumes().then((v) => {
      setSfxVol(v.sfx);
      setMusicVol(v.music);
    });
  }, []);

  const Row = ({
    label,
    detail,
    on,
    onToggle,
  }: {
    label: string;
    detail: string;
    on: boolean;
    onToggle: () => void;
  }) => (
    <Pressable
      onPress={() => {
        // Silent when this press is the one turning sound off, which would
        // otherwise answer "off" with a noise.
        if (!(label === 'Sound effects' && on)) playTap();
        onToggle();
      }}
      style={({ pressed }) => [
        styles.row,
        { borderColor: colors.border, backgroundColor: colors.surface, opacity: pressed ? 0.8 : 1 },
      ]}
    >
      <View style={styles.rowMain}>
        <Text style={[styles.rowLabel, { color: colors.text }]}>{label}</Text>
        <Text style={[styles.rowDetail, { color: colors.textMuted }]}>{detail}</Text>
      </View>
      {/* A word rather than a switch: it reads the same on every platform and
          says which way it currently is without being interpreted. */}
      <Text
        style={[styles.state, { color: on ? feedbackColors.correct : colors.textMuted }]}
      >
        {on ? 'ON' : 'OFF'}
      </Text>
    </Pressable>
  );

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={styles.page}
      showsVerticalScrollIndicator={false}
    >
      <Row
        label="Sound effects"
        detail="A tone for every guess, pitched by how close it was."
        on={sfx}
        onToggle={() => {
          const next = !sfx;
          setSfx(next);
          setSoundEnabled(next);
        }}
      />

      <VolumeSlider
        label="EFFECTS VOLUME"
        value={sfxVol}
        disabled={!sfx}
        onChange={(v) => {
          setSfxVol(v);
          setSfxVolume(v);
        }}
      />

      <Row
        label="Music"
        detail="A quiet loop behind the game. Off unless you want it."
        on={music}
        onToggle={() => {
          const next = !music;
          setMusic(next);
          setMusicEnabled(next);
          // Deferred by a frame. Creating a player decodes the whole loop, and
          // doing that inside the press handler meant the switch itself did not
          // repaint until the audio was ready - which read as a lag on a
          // control that had, in fact, already changed.
          setTimeout(() => refreshMusic(next ? 'home' : null), 0);
        }}
      />

      {/* Continuous, so the music follows the finger: a volume you can only
          judge after letting go is impossible to set by ear. */}
      <VolumeSlider
        label="MUSIC VOLUME"
        value={musicVol}
        disabled={!music}
        onChange={(v) => {
          setMusicVol(v);
          setMusicVolume(v);
        }}
      />

      <Text style={[styles.note, { color: colors.textMuted }]}>
        Both are remembered on this device rather than on your account, because they describe where
        you are playing rather than who you are.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { padding: 20, gap: 10 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: 12,
  },
  rowMain: { flex: 1, minWidth: 0 },
  rowLabel: { fontSize: 15.5, fontFamily: fonts.extraBold },
  rowDetail: { fontSize: 12, fontFamily: fonts.medium, marginTop: 2, lineHeight: 17 },
  state: { fontSize: 13, fontFamily: fonts.extraBold, letterSpacing: 1.2 },
  note: { fontSize: 12, fontFamily: fonts.medium, lineHeight: 18, marginTop: 8 },
});

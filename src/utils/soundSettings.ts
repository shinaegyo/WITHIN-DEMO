import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Whether feedback sounds play.
 *
 * Every guess makes a noise now, which is the point — but it is also the sort
 * of thing people want to switch off on a train. Stored on the device because
 * it describes this phone, not the account.
 */

const KEY = 'within.sound';

let enabled = true;
const listeners = new Set<(on: boolean) => void>();

export function soundEnabled(): boolean {
  return enabled;
}

export async function loadSoundSetting(): Promise<boolean> {
  try {
    enabled = (await AsyncStorage.getItem(KEY)) !== 'off';
  } catch {
    enabled = true;
  }
  listeners.forEach((l) => l(enabled));
  return enabled;
}

export function setSoundEnabled(on: boolean): void {
  enabled = on;
  listeners.forEach((l) => l(on));
  AsyncStorage.setItem(KEY, on ? 'on' : 'off').catch(() => {});
}

export function onSoundChange(listener: (on: boolean) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Whether background music plays.
 *
 * Separate from effects, and off until asked for. Effects are information —
 * they tell you how close a guess was — where music is decoration, and the
 * person who wants one rarely wants both.
 */

const MUSIC_KEY = 'within.music';

// On until somebody turns it off. It used to default off, on the grounds that
// music starting by itself is the shortest route to a muted tab - which is true
// of music that starts while you are already playing, and wrong for the first
// thirty seconds of an app you have never opened, where the sound is most of
// what makes it feel like a game rather than a form.
let music = true;

export function musicEnabled(): boolean {
  return music;
}

export async function loadMusicSetting(): Promise<boolean> {
  try {
    const stored = await AsyncStorage.getItem(MUSIC_KEY);
    // Only a stored 'off' silences it. A player who has never touched the
    // setting has not chosen silence, and anyone who has is remembered.
    music = stored === null ? true : stored === 'on';
  } catch {
    music = true;
  }
  return music;
}

export function setMusicEnabled(on: boolean): void {
  music = on;
  AsyncStorage.setItem(MUSIC_KEY, on ? 'on' : 'off').catch(() => {});
}

/**
 * How loud each of them is.
 *
 * Two numbers rather than one, for the same reason there are two switches: the
 * effects carry information and the music does not, so the useful setting is
 * usually "effects as they are, music quieter" rather than everything down.
 */

const SFX_VOL_KEY = 'within.sfxVolume';
const MUSIC_VOL_KEY = 'within.musicVolume';

let sfxVol = 0.9;
let musicVol = 0.4;
const volumeListeners = new Set<() => void>();

export function sfxVolume(): number {
  return sfxVol;
}

export function musicVolume(): number {
  return musicVol;
}

export async function loadVolumes(): Promise<{ sfx: number; music: number }> {
  try {
    const [a, b] = await Promise.all([
      AsyncStorage.getItem(SFX_VOL_KEY),
      AsyncStorage.getItem(MUSIC_VOL_KEY),
    ]);
    if (a !== null) sfxVol = Math.min(1, Math.max(0, Number(a)));
    if (b !== null) musicVol = Math.min(1, Math.max(0, Number(b)));
  } catch {
    /* the defaults are fine */
  }
  return { sfx: sfxVol, music: musicVol };
}

export function setSfxVolume(v: number): void {
  sfxVol = Math.min(1, Math.max(0, v));
  AsyncStorage.setItem(SFX_VOL_KEY, String(sfxVol)).catch(() => {});
  volumeListeners.forEach((l) => l());
}

export function setMusicVolume(v: number): void {
  musicVol = Math.min(1, Math.max(0, v));
  AsyncStorage.setItem(MUSIC_VOL_KEY, String(musicVol)).catch(() => {});
  volumeListeners.forEach((l) => l());
}

export function onVolumeChange(listener: () => void): () => void {
  volumeListeners.add(listener);
  return () => volumeListeners.delete(listener);
}

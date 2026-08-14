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

let music = false;

export function musicEnabled(): boolean {
  return music;
}

export async function loadMusicSetting(): Promise<boolean> {
  try {
    music = (await AsyncStorage.getItem(MUSIC_KEY)) === 'on';
  } catch {
    music = false;
  }
  return music;
}

export function setMusicEnabled(on: boolean): void {
  music = on;
  AsyncStorage.setItem(MUSIC_KEY, on ? 'on' : 'off').catch(() => {});
}

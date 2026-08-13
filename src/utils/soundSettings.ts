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

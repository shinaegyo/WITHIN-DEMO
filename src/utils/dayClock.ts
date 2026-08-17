import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * How long today took, counted from the first guess.
 *
 * Not from opening the app: a day left on the home screen while somebody makes
 * coffee is not two minutes of playing. The first guess is the moment the day
 * actually starts, which is also the moment the demo starts its clock.
 *
 * Kept per puzzle date and on the device. The server has no idea when somebody
 * looked at a number and thought about it, and a clock that resets because the
 * app was backgrounded would be worse than no clock - so the start is written
 * down once and read back.
 */

const KEY = (date: string) => `within.dayStart.${date}`;

export async function dayStart(date: string): Promise<number | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY(date));
    const n = raw ? Number(raw) : NaN;
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

/** A day with no guesses in it has not started, whoever left this behind. */
export async function clearDayStart(date: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(KEY(date));
  } catch {
    /* nothing to do about it */
  }
}

/** First guess of the day wins; later calls leave the original start alone. */
export async function markDayStart(date: string): Promise<number> {
  const already = await dayStart(date);
  if (already !== null) return already;
  const now = Date.now();
  try {
    await AsyncStorage.setItem(KEY(date), String(now));
  } catch {
    /* the clock is not worth failing a guess over */
  }
  return now;
}

/** m:ss, the way a stopwatch reads. */
export function clockText(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

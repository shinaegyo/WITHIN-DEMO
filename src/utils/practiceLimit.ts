import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Practice rounds are capped per day so practice stays a warm-up rather than
 * replacing the daily.
 *
 * Stored on the device rather than the server on purpose: practice awards no
 * points, streak or leaderboard place, so there is nothing to gain by getting
 * around the cap and no reason to spend a server round trip on it.
 */

export const PRACTICE_PER_DAY = 5;

const KEY = 'within.practice';

function today(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

async function read(): Promise<{ date: string; used: number }> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (parsed?.date === today()) return parsed;
  } catch {
    /* fall through to a fresh count */
  }
  return { date: today(), used: 0 };
}

export async function practiceRemaining(): Promise<number> {
  const { used } = await read();
  return Math.max(0, PRACTICE_PER_DAY - used);
}

/** Consumes one round. Returns how many are left afterwards, or null if none were available. */
export async function consumePracticeRound(): Promise<number | null> {
  const state = await read();
  if (state.used >= PRACTICE_PER_DAY) return null;

  const next = { date: state.date, used: state.used + 1 };
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* a failed write just means the cap is looser; not worth blocking play */
  }
  return PRACTICE_PER_DAY - next.used;
}

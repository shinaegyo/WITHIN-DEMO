import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * The deepest endless run this device has managed.
 *
 * Held locally, like the practice cap, because endless is unranked: no points,
 * no streak, no leaderboard. Nothing is gained by editing it, so nothing needs
 * defending.
 */

const KEY = 'within.endless.best';

export async function bestEndless(): Promise<number> {
  try {
    return Number((await AsyncStorage.getItem(KEY)) ?? 0) || 0;
  } catch {
    return 0;
  }
}

/** Records a cleared level, keeping the deepest. Returns the best after saving. */
export async function recordEndless(level: number): Promise<number> {
  const best = await bestEndless();
  if (level <= best) return best;
  try {
    await AsyncStorage.setItem(KEY, String(level));
  } catch {
    /* a lost best is not worth interrupting a run for */
  }
  return level;
}

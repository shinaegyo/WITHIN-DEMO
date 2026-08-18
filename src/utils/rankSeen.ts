import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * The season place this device last recorded, so a day can say what it moved.
 *
 * "24 points" tells you what you scored and nothing about what it did. Moving
 * from twelfth to ninth is the part worth knowing, and it is the one thing the
 * server cannot tell you on its own: a rank is a fact about now, and a change
 * needs a before.
 *
 * Kept per season, for the same reason the league flag is: a month ends and
 * everybody restarts, and without the season in the key the first day of
 * February would read as a fall of nineteen places.
 *
 * On the device rather than the account, like the level and league cards. It
 * records what this screen last showed, not a fact about the player - and a new
 * phone that says nothing on the first day is a better failure than one that
 * invents a jump.
 */

const KEY = 'within.seasonRank';

function keyFor(season: string): string {
  return `${KEY}.${season}`;
}

/** Null when this device has not recorded a place for this season yet. */
export async function lastSeenRank(season: string): Promise<number | null> {
  try {
    const raw = await AsyncStorage.getItem(keyFor(season));
    if (raw === null) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

export async function markRankSeen(season: string, rank: number): Promise<void> {
  try {
    await AsyncStorage.setItem(keyFor(season), String(rank));
  } catch {
    /* the card simply says nothing about movement next time */
  }
}

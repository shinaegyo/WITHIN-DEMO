import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * The last level this device has already congratulated the player for.
 *
 * XP arrives from five directions - the daily's trigger, a number cleared in
 * Impossible, a duel resolving, a Rush run, a Window commit - so there is no
 * single moment to hang a celebration on. Instead the level is compared against
 * what was last acknowledged, wherever the player next lands.
 *
 * Stored per device rather than on the account: it is a record of what has been
 * shown on this screen, not a fact about the player. A new phone showing one
 * extra card is a better failure than a card that never appears because another
 * device saw it.
 *
 * A null return means nothing has ever been recorded - a fresh install, or a
 * player who existed before this shipped. Those get the level written down
 * without a card, because a celebration for a level earned last week is a
 * celebration for nothing.
 */

const KEY = 'within.level.seen';

export async function lastSeenLevel(): Promise<number | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (raw === null) return null;
    const n = parseInt(raw, 10);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

export async function markLevelSeen(level: number): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, String(level));
  } catch {
    /* the card shows again next time, which is the harmless direction */
  }
}

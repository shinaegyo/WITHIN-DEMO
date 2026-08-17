import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Whether this device has already been told what the daily unlocks.
 *
 * Shown once, to somebody who has just finished their first day. A player who
 * has been here a fortnight already knows there are four other games - the
 * whole point of the card is that a new player does not, because the Games tab
 * is locked until the daily is done and a locked tab teaches nobody anything.
 *
 * Per device rather than per account, the same way the level card is. A second
 * phone showing it once more is a better failure than a first-time player never
 * seeing it because a tablet did.
 */

const KEY = 'within.games.intro.seen';

export async function gamesIntroSeen(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(KEY)) === '1';
  } catch {
    // Unreadable storage means show it: the cost is a repeat, and the cost of
    // the other guess is a player who never learns the modes exist.
    return false;
  }
}

export async function markGamesIntroSeen(): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, '1');
  } catch {
    /* it shows again next time, which is the harmless direction */
  }
}

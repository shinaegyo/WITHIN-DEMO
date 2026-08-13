import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Whether this device has been walked through the game.
 *
 * Held on the device rather than the server because it describes the app's
 * behaviour, not the player's record. The gate that matters is checked
 * alongside it: someone with days already played is never shown the tutorial,
 * so signing in on a second phone does not restart it.
 */

const KEY = 'within.intro';

export async function hasSeenIntro(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(KEY)) === 'done';
  } catch {
    // Storage being unavailable should not trap someone in a tutorial loop.
    return true;
  }
}

export async function markIntroSeen(): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, 'done');
  } catch {
    /* nothing to do; worst case they see it once more */
  }
}

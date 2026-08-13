import AsyncStorage from '@react-native-async-storage/async-storage';
import { hasOnboarded, markOnboarded } from '../lib/api';

/**
 * Whether this player has been walked through the game.
 *
 * The account is the answer, because being taught is a fact about the person:
 * it follows them to a new phone, and it does not depend on guessing from how
 * much they have played. The device flag is only a fallback for when the server
 * cannot be reached, where showing the tutorial twice beats hiding it from
 * someone who has never seen it.
 */

const KEY = 'within.intro';

export async function hasSeenIntro(): Promise<boolean> {
  try {
    const onboarded = await hasOnboarded();
    if (onboarded) AsyncStorage.setItem(KEY, 'done').catch(() => {});
    return onboarded;
  } catch {
    // Server unreachable: fall back to whatever this device remembers.
    try {
      return (await AsyncStorage.getItem(KEY)) === 'done';
    } catch {
      return true;
    }
  }
}

export async function markIntroSeen(): Promise<void> {
  AsyncStorage.setItem(KEY, 'done').catch(() => {});
  try {
    await markOnboarded();
  } catch {
    /* the device flag still covers this session */
  }
}

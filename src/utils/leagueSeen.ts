import AsyncStorage from '@react-native-async-storage/async-storage';
import { League } from '../lib/api';

/**
 * The league this device has already congratulated the player for.
 *
 * Kept per season. A month ends and everybody drops to Bronze with nothing
 * played, and without the season in the key that drop would look like a
 * demotion followed by five promotions - the same card five times for climbing
 * back to where they already were.
 *
 * Stored on the device rather than the account, like the level card: it records
 * what has been shown on this screen, not a fact about the player. A new phone
 * showing one extra card is a better failure than a card that never appears
 * because another device saw it first.
 *
 * A null return means nothing has been recorded for this season yet. That gets
 * written down silently - a promotion earned before the app was opened is not
 * a moment, and celebrating it on arrival would fire on every fresh install.
 */

const KEY = (season: string) => `within.league.seen.${season}`;

export async function lastSeenLeague(season: string): Promise<League | null> {
  try {
    return ((await AsyncStorage.getItem(KEY(season))) as League) ?? null;
  } catch {
    return null;
  }
}

export async function markLeagueSeen(season: string, league: League): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY(season), league);
  } catch {
    /* the card shows again next time, which is the harmless direction */
  }
}

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import 'react-native-url-polyfill/auto';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_KEY;

if (!url || !key) {
  throw new Error(
    'Missing EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_KEY. Copy .env.example to .env.',
  );
}

export const supabase = createClient(url, key, {
  auth: {
    // Keeps the anonymous session across launches, so a player's streak
    // survives closing the app.
    storage: AsyncStorage,
    persistSession: true,
    autoRefreshToken: true,
    // No deep-link callbacks in a native app.
    detectSessionInUrl: false,
  },
});

/**
 * Every player gets an account immediately, with no signup wall — anonymous
 * at first, upgradeable to a real login later without losing history.
 * Returns the user id.
 */
/**
 * Set once the stored session has been confirmed against the server, so the
 * check costs one request per launch rather than one per call.
 */
let sessionVerified = false;

/**
 * Forget that the stored session was confirmed, so the next ensureSignedIn
 * checks it against the server again. For use when a call has just failed in a
 * way that suggests the token died after we last looked.
 */
export function invalidateSession(): void {
  sessionVerified = false;
}

export async function ensureSignedIn(): Promise<string> {
  const { data } = await supabase.auth.getSession();

  if (data.session?.user) {
    if (sessionVerified) return data.session.user.id;

    // A stored token still looks valid locally after the account behind it has
    // gone — deleted by hand, or removed in a data reset. Every call then fails
    // server-side while the app believes it is signed in, which surfaces as an
    // unexplained "something went wrong" on whatever the player tried first.
    // Confirming with the server once per launch turns that into a clean
    // recovery.
    const { data: live, error } = await supabase.auth.getUser();
    if (!error && live.user) {
      sessionVerified = true;
      return live.user.id;
    }

    try {
      await supabase.auth.signOut();
    } catch {
      /* already unusable; clearing it locally is what matters */
    }
  }

  // Falls through to a new anonymous player. Someone whose email session died
  // this way lands on onboarding, which offers "Already have an account?" so
  // they can sign back into the original rather than being stranded on a new
  // one.
  const { data: created, error } = await supabase.auth.signInAnonymously();
  if (error) throw error;
  if (!created.user) throw new Error('anonymous sign-in returned no user');
  sessionVerified = true;
  return created.user.id;
}

/**
 * Dev only. Drops the current anonymous session so the next call to
 * ensureSignedIn creates a new player with a fresh daily game.
 *
 * Testing works this way on purpose: there is no server-side "replay today"
 * function, because shipping one would hand every player a way around the
 * once-per-day rule.
 */
export async function signOutForTesting(): Promise<void> {
  sessionVerified = false;
  await supabase.auth.signOut();
}

/**
 * The device's IANA timezone, e.g. "America/Los_Angeles".
 * Sent once at sign-up and stored on the profile; from then on the server
 * uses the stored value to decide which puzzle the player is on, so changing
 * the device clock can't pull tomorrow's number forward.
 */
export function deviceTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

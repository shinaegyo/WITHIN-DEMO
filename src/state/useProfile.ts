import { useCallback, useEffect, useRef, useState } from 'react';
import { currentAccount, currentProfile } from '../lib/auth';
import { ensureSignedIn } from '../lib/supabase';

/**
 * Whether this player has finished onboarding. A username is the gate: it's
 * the thing shown on the leaderboard, and unlike an email it can be claimed
 * without waiting on a delivered code.
 */
export interface Profile {
  loading: boolean;
  /**
   * The profile could not be read, which is not the same as having no name.
   * Without this the two were indistinguishable, and the cheaper reading won:
   * every failed read looked like a new player and opened onboarding in front
   * of somebody who had been playing for months.
   */
  failed: boolean;
  username: string | null;
  email: string | null;
  /** Null means never chosen, which is what opens the picker. */
  avatar: string | null;
  refresh: () => Promise<void>;
}

export function useProfile(): Profile {
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [username, setName] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [avatar, setAvatar] = useState<string | null>(null);

  // refresh is built once and never rebuilt, so reading the username state
  // from inside it would report whatever was true at mount - null, always,
  // which is the one value the log needs to be able to rule out.
  const lastKnownName = useRef<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      // Every player gets a session immediately, signed in or not, so the
      // profile row exists before onboarding finishes.
      await ensureSignedIn();
      const [profile, account] = await Promise.all([currentProfile(), currentAccount()]);
      setName(profile?.username ?? null);
      setAvatar(profile?.avatar ?? null);
      setEmail(account?.email ?? null);
      lastKnownName.current = profile?.username ?? null;
      setFailed(false);
    } catch (err) {
      // The retry screen says "check your connection" because that is all a
      // player can act on. This is the same moment described for whoever has
      // to explain it afterwards, since the screen deliberately does not name
      // a Postgres code at somebody trying to play a number game.
      console.error('[within] profile unavailable, showing retry:', {
        knownUsername: lastKnownName.current,
        message: err instanceof Error ? err.message : String(err),
      });
      // Deliberately leaves the last known name in place rather than clearing
      // it. Nothing was learned here, so nothing should be forgotten.
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { loading, failed, username, email, avatar, refresh };
}

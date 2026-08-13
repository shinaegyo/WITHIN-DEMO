import { useCallback, useEffect, useState } from 'react';
import { currentAccount, currentUsername } from '../lib/auth';
import { ensureSignedIn } from '../lib/supabase';

/**
 * Whether this player has finished onboarding. A username is the gate: it's
 * the thing shown on the leaderboard, and unlike an email it can be claimed
 * without waiting on a delivered code.
 */
export interface Profile {
  loading: boolean;
  username: string | null;
  email: string | null;
  refresh: () => Promise<void>;
}

export function useProfile(): Profile {
  const [loading, setLoading] = useState(true);
  const [username, setName] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      // Every player gets a session immediately, signed in or not, so the
      // profile row exists before onboarding finishes.
      await ensureSignedIn();
      const [name, account] = await Promise.all([currentUsername(), currentAccount()]);
      setName(name);
      setEmail(account?.email ?? null);
    } catch {
      setName(null);
      setEmail(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { loading, username, email, refresh };
}

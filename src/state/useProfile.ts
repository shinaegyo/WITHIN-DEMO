import { useCallback, useEffect, useState } from 'react';
import { currentAccount, currentProfile } from '../lib/auth';
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
  /** Null means never chosen, which is what opens the picker. */
  avatar: string | null;
  refresh: () => Promise<void>;
}

export function useProfile(): Profile {
  const [loading, setLoading] = useState(true);
  const [username, setName] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [avatar, setAvatar] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      // Every player gets a session immediately, signed in or not, so the
      // profile row exists before onboarding finishes.
      await ensureSignedIn();
      const [profile, account] = await Promise.all([currentProfile(), currentAccount()]);
      setName(profile?.username ?? null);
      setAvatar(profile?.avatar ?? null);
      setEmail(account?.email ?? null);
    } catch {
      setName(null);
      setAvatar(null);
      setEmail(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { loading, username, email, avatar, refresh };
}

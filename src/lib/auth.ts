import { ensureSignedIn, invalidateSession, supabase } from './supabase';

/**
 * Optional email accounts, built around one rule: signing in must attach an
 * email to the player's EXISTING anonymous user, never create a second one.
 * A new user would mean a fresh id, and the streak, points and history all
 * hang off that id — so getting this wrong silently wipes progress.
 *
 * Codes rather than magic links: a link has to bounce back into the app
 * through a deep link, which is fragile on native. A six digit code the player
 * types is simpler and works identically everywhere.
 */

export type AuthStep = 'idle' | 'code_sent';

export interface AccountInfo {
  userId: string;
  email: string | null;
  isAnonymous: boolean;
}

export async function currentAccount(): Promise<AccountInfo | null> {
  const { data } = await supabase.auth.getUser();
  const user = data.user;
  if (!user) return null;
  return {
    userId: user.id,
    email: user.email ?? null,
    // Supabase marks anonymous sessions; fall back to "no email" if absent.
    isAnonymous: (user as any).is_anonymous ?? !user.email,
  };
}

/**
 * Attaches an email to the signed-in anonymous user. Supabase sends a
 * confirmation code and keeps the same user id, so progress carries over.
 */
export async function startLinkEmail(email: string): Promise<void> {
  const { error } = await supabase.auth.updateUser({ email: email.trim() });
  if (error) throw new Error(error.message);
}

export async function confirmLinkEmail(email: string, code: string): Promise<void> {
  const { error } = await supabase.auth.verifyOtp({
    email: email.trim(),
    token: code.trim(),
    type: 'email_change',
  });
  if (error) throw new Error(error.message);
}

/** Signing back in on another device. Refuses to create a new account. */
export async function startSignIn(email: string): Promise<void> {
  const { error } = await supabase.auth.signInWithOtp({
    email: email.trim(),
    options: { shouldCreateUser: false },
  });
  if (error) throw new Error(error.message);
}

export async function confirmSignIn(email: string, code: string): Promise<void> {
  const { error } = await supabase.auth.verifyOtp({
    email: email.trim(),
    token: code.trim(),
    type: 'email',
  });
  if (error) throw new Error(error.message);
}

export async function signOut(): Promise<void> {
  await supabase.auth.signOut();
}

export async function setUsername(
  name: string,
): Promise<{ ok: true } | { ok: false; error: string; existing?: string }> {
  // Every other call in the app establishes a session first; this one did not,
  // and it is the very first thing a new player does. If the session was
  // missing, expired, or belonged to a deleted account, the request went up
  // unauthenticated and came back as a bare transport error — which the player
  // saw as "Something went wrong" while typing a perfectly good name.
  try {
    await ensureSignedIn();
  } catch {
    return { ok: false, error: 'Could not reach the server. Check your connection and try again.' };
  }

  let { data, error } = await supabase.rpc('set_username', { p_username: name });

  // A token can die between being checked and being used. One retry on a fresh
  // session separates that from a genuine problem.
  if (error) {
    invalidateSession();
    try {
      await ensureSignedIn();
    } catch {
      return { ok: false, error: 'Could not reach the server. Check your connection and try again.' };
    }
    ({ data, error } = await supabase.rpc('set_username', { p_username: name }));
  }

  if (error) {
    return { ok: false, error: 'Could not save that name. Check your connection and try again.' };
  }
  if (data?.error) {
    // A locked name comes back with the name the account actually has. Saying
    // it is the difference between a refusal and an answer: the caller only
    // asked because it thought there was no name, and now it knows better.
    if (data.error === 'name_locked' && data.username) {
      return {
        ok: false,
        existing: data.username,
        error: `You're already playing as ${data.username}. A name can only be changed once a year, and yours is set for now.`,
      };
    }

    const messages: Record<string, string> = {
      bad_length: 'Use between 3 and 16 characters.',
      bad_characters: 'Letters, numbers and underscores only.',
      taken: 'That name is already taken.',
      name_locked: 'A name can only be changed once a year, and yours is set for now.',
      name_not_allowed: 'Pick a different name — that one is not allowed.',
      name_needs_letters: 'Names need at least one letter.',
      not_authenticated: 'You need to be signed in.',
    };
    return { ok: false, error: messages[data.error] ?? 'That name cannot be used.' };
  }
  return { ok: true };
}

export async function currentUsername(): Promise<string | null> {
  return (await currentProfile())?.username ?? null;
}

/**
 * Name and avatar in one read, since every caller wants both.
 *
 * Throws when the read fails, and that distinction is the whole point. The
 * error used to be discarded, so a dropped request returned a null username -
 * identical to a player who has genuinely never chosen one. The navigator
 * reads exactly that field to decide who needs onboarding, so a blip on the
 * wire sent established players to "Choose a username", where the server then
 * refused every name they typed because their account already had one.
 */
export async function currentProfile(): Promise<{ username: string | null; avatar: string | null } | null> {
  const { data, error: authError } = await supabase.auth.getUser();

  // Asking who this is can fail on its own, and the answer used to be thrown
  // away with the question: a failed getUser left data.user undefined, which
  // read as "nobody is signed in" and returned a null profile — the same null
  // that means "new player". The distinction is the entire bug, so it has to
  // hold here too, not just on the row read below.
  if (authError) {
    console.error('[within] profile read failed (auth):', {
      status: (authError as any).status,
      name: authError.name,
      message: authError.message,
    });
    throw new Error(authError.message);
  }
  if (!data.user) return null;

  const { data: rows, error } = await supabase
    .from('profiles')
    .select('username, avatar')
    .eq('id', data.user.id)
    .maybeSingle();

  // The line that would have identified this the first time round. Whether
  // this read succeeds decides between showing someone their game and showing
  // them the name picker, so the reason for a failure is worth more than the
  // fact of one - and it has to be readable without reconstructing the session
  // from a screenshot days later.
  if (error) {
    console.error('[within] profile read failed:', {
      userId: data.user.id,
      code: error.code,
      details: error.details,
      hint: error.hint,
      message: error.message,
    });
    throw new Error(error.message);
  }

  return { username: rows?.username ?? null, avatar: rows?.avatar ?? null };
}

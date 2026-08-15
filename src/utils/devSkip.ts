import { Platform } from 'react-native';
import { markOnboarded } from '../lib/api';
import { setUsername } from '../lib/auth';

/**
 * Straight to the home screen, for development only.
 *
 * Every look at a screen behind the tutorial - the boards, the tabs, Impossible
 * - costs a name, an avatar, the rules and a practice round first, and a
 * throwaway account has to do all of it again. This takes a fresh anonymous
 * player, gives them a name and marks them taught, so localhost opens on the
 * home screen.
 *
 * Gated twice: __DEV__ is false in any exported build, and it still does
 * nothing without ?dev in the URL - otherwise working on the tutorial itself
 * would mean never being able to see it.
 */
export function wantsDevSkip(): boolean {
  if (!__DEV__ || Platform.OS !== 'web') return false;
  try {
    // eslint-disable-next-line no-undef
    return new URLSearchParams(window.location.search).has('dev');
  } catch {
    return false;
  }
}

/** Names the current anonymous player and marks the tutorial done. */
export async function devSkipOnboarding(): Promise<void> {
  const name = `dev${Math.floor(Math.random() * 100000)}`;
  try {
    await setUsername(name);
  } catch {
    /* already named, which is just as good */
  }
  try {
    await markOnboarded();
  } catch {
    /* the navigator's own flag still carries this session */
  }
}

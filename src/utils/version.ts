import { Platform } from 'react-native';

/**
 * Which build this is, and whether it is still the current one.
 *
 * A web app keeps the JavaScript it booted with until the document reloads, so
 * a player who leaves the tab open - or keeps it on their home screen, where
 * pull-to-refresh often does nothing - can be days behind and have no way to
 * tell. Every fix shipped today was invisible to somebody for exactly that
 * reason, and "force-quit and reopen" is not an instruction real players will
 * follow, or should have to.
 *
 * So the build stamps itself into the bundle and into a file beside it. When
 * the app comes back to the foreground it compares the two and reloads itself
 * if they differ, which is the only moment a reload is not interrupting
 * anything.
 */
export const BUILD: string = process.env.EXPO_PUBLIC_BUILD ?? 'dev';

let checking = false;

export async function reloadIfStale(): Promise<void> {
  if (Platform.OS !== 'web' || BUILD === 'dev' || checking) return;
  checking = true;
  try {
    // no-store, or the check itself is answered from the cache it is meant to
    // see past.
    const res = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) return;
    const { build } = await res.json();
    if (build && build !== BUILD) {
      // eslint-disable-next-line no-undef
      window.location.reload();
    }
  } catch {
    /* offline, or the file is not there yet; the running build is fine */
  } finally {
    checking = false;
  }
}

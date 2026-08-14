import * as Haptics from 'expo-haptics';

// Standing in for the "optional subtle sound" called for in the spec — no
// audio assets exist yet, so haptic feedback carries that role for now.
// Swap/add real sound playback here later without touching call sites.

export function hapticWithin10() {
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
}

export function hapticOneAway() {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
}

export function hapticCorrect() {
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
}

/**
 * A tap for an ordinary guess, weighted by how close it landed. Without this
 * the phone stayed still for most of a round and only woke up near the answer.
 *
 * Note this does nothing on the web build — expo-haptics has no browser
 * implementation — so it only reaches players on a native build.
 */
export function hapticForTier(tier: string) {
  if (tier === 'vast' || tier === 'distant' || tier === 'light') {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  } else if (tier === 'medium') {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  } else if (tier === 'dark') {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
  }
}

/**
 * The light tick as a wheel passes a digit, the same feel the clock app uses
 * for its pickers. Fires per digit, so it must stay the cheapest one available.
 *
 * No-op on the web build, like the rest of this file — expo-haptics has no
 * browser implementation, so this only reaches a native build.
 */
export function hapticTick() {
  Haptics.selectionAsync().catch(() => {});
}

export function hapticInvalid() {
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
}

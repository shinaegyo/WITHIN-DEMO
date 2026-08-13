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

export function hapticInvalid() {
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
}

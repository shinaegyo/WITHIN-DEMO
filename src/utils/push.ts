import { Platform } from 'react-native';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { registerPushToken } from '../lib/api';

/**
 * Getting permission to send the daily nudge, and telling the server where.
 *
 * A daily game lives or dies on the reminder: everything else here is built for
 * the player who already opened the app, and this is the only thing that
 * reaches the one who forgot.
 *
 * Nothing happens on its own. Asking for permission the moment the app opens is
 * how an app gets a No it can never come back from - iOS only ever shows the
 * system prompt once, and a No is permanent from inside the app. So the prompt
 * is behind a switch somebody chose to turn on, by which point they have
 * already agreed in their head.
 */

/** Banner and sound while the app is open — a reminder that arrives mid-game. */
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

export type PushResult =
  | { ok: true }
  /** They said no, or said no previously: only Settings can undo it. */
  | { ok: false; reason: 'denied' }
  /** Simulators and the web have no push token to give. */
  | { ok: false; reason: 'unsupported' }
  | { ok: false; reason: 'error'; detail: string };

/**
 * Asks, registers, and returns what happened.
 *
 * Android needs its channel created before anything is delivered; iOS does not,
 * and creating one there is harmless.
 */
export async function enablePush(): Promise<PushResult> {
  if (Platform.OS === 'web') return { ok: false, reason: 'unsupported' };
  // A simulator can hold a permission but never receives a push, and asking
  // Expo for a token on one throws rather than returning null.
  if (!Device.isDevice) return { ok: false, reason: 'unsupported' };

  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('daily', {
        name: 'Daily numbers',
        importance: Notifications.AndroidImportance.DEFAULT,
        sound: 'default',
      });
    }

    const existing = await Notifications.getPermissionsAsync();
    let granted = existing.granted;

    // Only ask when it can still be asked. Calling request on a denied
    // permission returns immediately without showing anything, which would
    // leave the switch flicking on and off for no visible reason.
    if (!granted && existing.canAskAgain) {
      const asked = await Notifications.requestPermissionsAsync();
      granted = asked.granted;
    }

    if (!granted) return { ok: false, reason: 'denied' };

    const token = await Notifications.getExpoPushTokenAsync();
    await registerPushToken(token.data, Platform.OS === 'ios' ? 'ios' : 'android');
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: 'error', detail: err instanceof Error ? err.message : 'unknown' };
  }
}

/** Whether this device has already agreed, without asking for anything. */
export async function pushAllowed(): Promise<boolean> {
  if (Platform.OS === 'web' || !Device.isDevice) return false;
  try {
    return (await Notifications.getPermissionsAsync()).granted;
  } catch {
    return false;
  }
}

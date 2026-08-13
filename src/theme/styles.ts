import type { ViewStyle } from 'react-native';

/**
 * Purely decorative layers use this so they never swallow taps.
 * `style.pointerEvents` is the current API — the `pointerEvents` prop is
 * deprecated.
 */
export const noHit: ViewStyle = { pointerEvents: 'none' };

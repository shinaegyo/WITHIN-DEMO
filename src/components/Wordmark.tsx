import React from 'react';
import { Platform, StyleProp, StyleSheet, TextStyle } from 'react-native';
import { Text } from './AppText';
import { fonts } from '../theme/fonts';

interface Props {
  size: number;
  /** Defaults to the theme ink the screen passes in. */
  color?: string;
  style?: StyleProp<TextStyle>;
}

/**
 * The WITHIN wordmark, set flat.
 *
 * It used to carry the blue-to-red gradient, which was the game's own scale -
 * blue means go higher, red means lower - poured into the logo as decoration.
 * A colour that carries meaning stops carrying it the moment it is also used
 * because it looks nice, and through the middle the interpolation landed on
 * mauve, which is the muddiest part of that ramp.
 *
 * The two colours belong to the mark and the tiles now. The name is set in one
 * ink and holds its own.
 */
export function Wordmark({ size, color = '#F7F8FA', style }: Props) {
  return (
    <Text
      style={[
        styles.text,
        { fontSize: size, letterSpacing: -size * 0.035, color },
        style,
      ]}
    >
      WITHIN
    </Text>
  );
}

const styles = StyleSheet.create({
  text: {
    fontFamily: fonts.logo,
    ...Platform.select({ android: { includeFontPadding: false }, default: {} }),
  },
});

import MaskedView from '@react-native-masked-view/masked-view';
import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { Platform, StyleProp, StyleSheet, TextStyle, View } from 'react-native';
import { Text } from './AppText';
import { wordmarkGradient } from '../theme/colors';
import { fonts } from '../theme/fonts';

interface Props {
  size: number;
  style?: StyleProp<TextStyle>;
}

/**
 * The WITHIN wordmark. Every place the name appears renders this, so the
 * treatment is defined once rather than being repeated per screen.
 *
 * React Native's Text can't take a gradient fill, so the gradient is drawn
 * behind a mask cut to the letterforms. The mask needs a real size to work
 * against, hence the invisible copy of the text inside it.
 */
export function Wordmark({ size, style }: Props) {
  const textStyle: StyleProp<TextStyle> = [
    styles.text,
    { fontSize: size, letterSpacing: -size * 0.031 },
    style,
  ];

  const label = <Text style={textStyle}>WITHIN</Text>;

  // react-native-web doesn't implement MaskedView — it renders the mask itself,
  // which came out as flat black. CSS does gradient text natively, so the web
  // build takes that route instead.
  if (Platform.OS === 'web') {
    return (
      <Text
        style={[
          textStyle,
          {
            backgroundImage: `linear-gradient(90deg, ${wordmarkGradient[0]}, ${wordmarkGradient[1]})`,
            backgroundClip: 'text',
            WebkitBackgroundClip: 'text',
            color: 'transparent',
          } as unknown as TextStyle,
        ]}
      >
        WITHIN
      </Text>
    );
  }

  return (
    <MaskedView style={styles.wrap} maskElement={<View style={styles.maskWrap}>{label}</View>}>
      <LinearGradient
        colors={wordmarkGradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
      >
        {/* Sizes the gradient to the text without being visible itself. */}
        <Text style={[textStyle, styles.spacer]}>WITHIN</Text>
      </LinearGradient>
    </MaskedView>
  );
}

const styles = StyleSheet.create({
  wrap: {
    // Masked content has no intrinsic size on some platforms until laid out.
    flexDirection: 'row',
  },
  maskWrap: {
    backgroundColor: 'transparent',
  },
  text: {
    fontFamily: fonts.logo,
    // Colour is irrelevant — the mask only cares about opacity — but web needs
    // an opaque fill for the mask to register.
    color: '#000000',
    ...Platform.select({ android: { includeFontPadding: false }, default: {} }),
  },
  spacer: {
    opacity: 0,
  },
});

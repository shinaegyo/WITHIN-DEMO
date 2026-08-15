import React from 'react';
import { Pressable, StyleSheet } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { playTap } from '../utils/sound';

/**
 * The way back, as an arrow.
 *
 * "‹ HOME" set in bold caps is a label doing an icon's job: it takes the top
 * left corner of every mode screen, competes with the title beside it, and has
 * to be read in a language before it means anything. An arrow is understood
 * everywhere and disappears until it is wanted.
 *
 * The tap target stays the size the words were - forty-odd points - because the
 * thing that made the text version work was being easy to hit without looking.
 */
export function BackButton({ color, onPress }: { color: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={() => {
        playTap();
        onPress();
      }}
      hitSlop={12}
      accessibilityRole="button"
      accessibilityLabel="Back"
      style={({ pressed }) => [styles.hit, { opacity: pressed ? 0.5 : 1 }]}
    >
      <Svg width={26} height={26} viewBox="0 0 24 24">
        <Path
          d="M15 5 8 12l7 7"
          stroke={color}
          strokeWidth={2.2}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      </Svg>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  hit: { width: 40, height: 40, alignItems: 'flex-start', justifyContent: 'center' },
});

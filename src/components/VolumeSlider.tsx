import React, { useRef, useState } from 'react';
import { LayoutChangeEvent, PanResponder, StyleSheet, Text, View } from 'react-native';
import { fonts } from '../theme/fonts';
import { useTheme } from '../theme/ThemeContext';

/**
 * A line you drag.
 *
 * React Native ships no slider, and the community one is a native dependency
 * for a control that is a filled bar and a dot. This is that: press anywhere on
 * the track to jump there, drag to fine-tune.
 *
 * The value is reported continuously so the sound follows the finger - a volume
 * control that only takes effect on release is impossible to set by ear.
 */
export function VolumeSlider({
  label,
  value,
  onChange,
  disabled = false,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  disabled?: boolean;
}) {
  const { colors } = useTheme();
  const [width, setWidth] = useState(0);
  const widthRef = useRef(0);
  const latest = useRef(value);
  latest.current = value;

  const set = (x: number) => {
    if (disabled || widthRef.current <= 0) return;
    onChange(Math.min(1, Math.max(0, x / widthRef.current)));
  };

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => set(e.nativeEvent.locationX),
      onPanResponderMove: (e) => set(e.nativeEvent.locationX),
    }),
  ).current;

  const onLayout = (e: LayoutChangeEvent) => {
    widthRef.current = e.nativeEvent.layout.width;
    setWidth(e.nativeEvent.layout.width);
  };

  const pct = Math.round(value * 100);

  return (
    <View style={[styles.wrap, disabled && styles.disabled]}>
      <View style={styles.head}>
        <Text style={[styles.label, { color: colors.textMuted }]}>{label}</Text>
        <Text style={[styles.value, { color: colors.textMuted }]}>{pct}%</Text>
      </View>

      <View style={styles.trackArea} onLayout={onLayout} {...pan.panHandlers}>
        <View style={[styles.track, { backgroundColor: colors.border }]}>
          <View style={[styles.fill, { backgroundColor: colors.text, width: `${pct}%` }]} />
        </View>
        <View
          style={[
            styles.knob,
            {
              backgroundColor: colors.text,
              borderColor: colors.background,
              left: Math.max(0, Math.min(width - 18, value * width - 9)),
            },
          ]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 14 },
  disabled: { opacity: 0.4 },
  head: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  label: { fontSize: 11, fontFamily: fonts.bold, letterSpacing: 1.1 },
  value: { fontSize: 11, fontFamily: fonts.bold },
  // Taller than the line it draws, so the thing you press is bigger than the
  // thing you see.
  trackArea: { height: 30, justifyContent: 'center' },
  track: { height: 5, borderRadius: 3, overflow: 'hidden' },
  fill: { height: 5, borderRadius: 3 },
  knob: {
    position: 'absolute',
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
  },
});

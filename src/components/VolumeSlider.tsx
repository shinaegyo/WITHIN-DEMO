import React, { useRef, useState } from 'react';
import { PanResponder, StyleSheet, View } from 'react-native';
import { Text } from './AppText';
import { fonts } from '../theme/fonts';
import { useTheme } from '../theme/ThemeContext';

/**
 * A line you drag.
 *
 * React Native ships no slider and the community one is a native dependency for
 * what is a filled bar and a dot. Press anywhere on the track to jump there,
 * drag to fine-tune.
 *
 * Positions come from the page coordinate minus the track's measured position,
 * rather than from locationX: on the web that is relative to whichever element
 * the browser decided the event hit, which for a knob sitting on a track is
 * sometimes the knob - so the first version moved by the width of the dot and
 * then stopped.
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

  const track = useRef<View>(null);
  const bounds = useRef({ x: 0, width: 0 });
  const enabled = useRef(!disabled);
  enabled.current = !disabled;

  const measure = () => {
    track.current?.measureInWindow((x, _y, w) => {
      bounds.current = { x, width: w };
      setWidth(w);
    });
  };

  const setFromPage = (pageX: number) => {
    const { x, width: w } = bounds.current;
    if (!enabled.current || w <= 0) return;
    onChange(Math.min(1, Math.max(0, (pageX - x) / w)));
  };

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      // Claim the gesture before a parent scroll view can take it, or dragging
      // sideways on a phone scrolls the page instead of moving the value.
      onStartShouldSetPanResponderCapture: () => true,
      onMoveShouldSetPanResponderCapture: () => true,
      onPanResponderGrant: (_e, gs) => setFromPage(gs.x0),
      onPanResponderMove: (_e, gs) => setFromPage(gs.moveX),
    }),
  ).current;

  const pct = Math.round(value * 100);

  return (
    <View style={[styles.wrap, disabled && styles.disabled]}>
      <View style={styles.head}>
        <Text style={[styles.label, { color: colors.textMuted }]}>{label}</Text>
        <Text style={[styles.value, { color: colors.text }]}>{pct}%</Text>
      </View>

      {/* The hit area is taller than the line it draws, so the thing you press
          is bigger than the thing you see. */}
      <View style={styles.hit} {...pan.panHandlers}>
        <View ref={track} onLayout={measure} style={styles.trackArea} collapsable={false}>
          <View style={[styles.track, { backgroundColor: colors.border }]}>
            <View style={[styles.fill, { backgroundColor: colors.text, width: `${pct}%` }]} />
          </View>
          <View
            pointerEvents="none"
            style={[
              styles.knob,
              {
                backgroundColor: colors.text,
                borderColor: colors.background,
                left: Math.max(0, Math.min(Math.max(0, width - 20), value * width - 10)),
              },
            ]}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: 16, paddingTop: 2, paddingBottom: 12 },
  disabled: { opacity: 0.4 },
  head: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  label: { fontSize: 11, fontFamily: fonts.bold, letterSpacing: 1.1 },
  value: { fontSize: 12, fontFamily: fonts.extraBold },
  hit: { paddingVertical: 12 },
  trackArea: { height: 20, justifyContent: 'center' },
  track: { height: 6, borderRadius: 3, overflow: 'hidden' },
  fill: { height: 6, borderRadius: 3 },
  knob: { position: 'absolute', width: 20, height: 20, borderRadius: 10, borderWidth: 2 },
});

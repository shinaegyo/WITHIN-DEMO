import React, { useCallback, useRef, useState } from 'react';
import {
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { fonts } from '../theme/fonts';
import { hapticTick } from '../utils/haptics';
import { useTheme } from '../theme/ThemeContext';

type SubmitOutcome = { ok: true } | { ok: false; error: string };

interface Props {
  disabled: boolean;
  onSubmit: (value: number) => Promise<SubmitOutcome>;
}

/**
 * Three scrolling columns of digits, the way a clock app sets a time.
 *
 * No keyboard: the device one was the least considered thing on the screen and
 * covered half a phone. Spinning to a number also suits a game about closing in
 * on one better than typing it does.
 *
 * The hundreds column runs to ten so 1000 stays reachable. Choosing it parks
 * the other two at zero, because 10-5-0 is not a number here and offering it
 * only to reject it would be worse than not offering it.
 */
const ITEM_H = 40;
const VISIBLE = 5;
const PAD = (ITEM_H * VISIBLE - ITEM_H) / 2;

const HUNDREDS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const DIGITS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

function Wheel({
  items,
  value,
  onChange,
  disabled,
  dimmed,
}: {
  items: number[];
  value: number;
  onChange: (n: number) => void;
  disabled: boolean;
  dimmed?: boolean;
}) {
  const { colors } = useTheme();
  const ref = useRef<ScrollView>(null);
  // What the wheel last reported, so a tick fires once per digit crossed
  // rather than on every scroll frame.
  const lastIndex = useRef(items.indexOf(value));

  const handleScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const index = Math.round(e.nativeEvent.contentOffset.y / ITEM_H);
      const clamped = Math.max(0, Math.min(items.length - 1, index));
      if (clamped !== lastIndex.current) {
        lastIndex.current = clamped;
        hapticTick();
        onChange(items[clamped]);
      }
    },
    [items, onChange],
  );

  // Settle exactly on a digit. Done by hand rather than with snapToInterval
  // because snapping is inconsistent across browsers, and this has to feel the
  // same on a phone browser as in a native build.
  const settle = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const index = Math.round(e.nativeEvent.contentOffset.y / ITEM_H);
      const clamped = Math.max(0, Math.min(items.length - 1, index));
      ref.current?.scrollTo({ y: clamped * ITEM_H, animated: true });
      onChange(items[clamped]);
    },
    [items, onChange],
  );

  return (
    <View style={[styles.wheel, dimmed && styles.dimmed]}>
      {/* The band the chosen digit sits in, so the wheel has a clear reading
          position rather than leaving the player to guess which is selected. */}
      <View
        pointerEvents="none"
        style={[styles.band, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}
      />
      <ScrollView
        ref={ref}
        scrollEnabled={!disabled && !dimmed}
        showsVerticalScrollIndicator={false}
        onScroll={handleScroll}
        onMomentumScrollEnd={settle}
        onScrollEndDrag={settle}
        scrollEventThrottle={16}
        contentContainerStyle={{ paddingVertical: PAD }}
      >
        {items.map((n) => (
          <Pressable
            key={n}
            disabled={disabled || dimmed}
            onPress={() => {
              ref.current?.scrollTo({ y: items.indexOf(n) * ITEM_H, animated: true });
              onChange(n);
            }}
            style={styles.item}
          >
            <Text
              style={[
                styles.itemText,
                { color: n === value ? colors.text : colors.textMuted },
                n === value && styles.itemTextOn,
              ]}
            >
              {n}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

export function NumberWheels({ disabled, onSubmit }: Props) {
  const { colors } = useTheme();
  const [h, setH] = useState(0);
  const [t, setT] = useState(0);
  const [u, setU] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const thousand = h === 10;
  const value = thousand ? 1000 : h * 100 + t * 10 + u;
  const ready = !disabled && value >= 1;

  const submit = async () => {
    if (!ready) return;
    const res = await onSubmit(value);
    if (res.ok) setError(null);
    else setError(res.error);
  };

  return (
    <View style={styles.wrap}>
      {error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}

      <View style={styles.columns}>
        <Wheel
          items={HUNDREDS}
          value={h}
          disabled={disabled}
          onChange={(n) => {
            setH(n);
            if (error) setError(null);
          }}
        />
        <Wheel
          items={DIGITS}
          value={thousand ? 0 : t}
          disabled={disabled}
          dimmed={thousand}
          onChange={(n) => {
            setT(n);
            if (error) setError(null);
          }}
        />
        <Wheel
          items={DIGITS}
          value={thousand ? 0 : u}
          disabled={disabled}
          dimmed={thousand}
          onChange={(n) => {
            setU(n);
            if (error) setError(null);
          }}
        />
      </View>

      <Pressable
        onPress={submit}
        disabled={!ready}
        style={({ pressed }) => [
          styles.go,
          { backgroundColor: ready ? colors.text : colors.border, opacity: pressed ? 0.85 : 1 },
        ]}
      >
        <Text style={[styles.goText, { color: ready ? colors.background : colors.textMuted }]}>
          {value >= 1 ? `Guess ${value}` : 'Pick a number'}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: '100%' },
  columns: { flexDirection: 'row', gap: 10 },
  wheel: { flex: 1, height: ITEM_H * VISIBLE, justifyContent: 'center' },
  dimmed: { opacity: 0.35 },
  band: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: PAD,
    height: ITEM_H,
    borderRadius: 10,
    borderWidth: 1,
  },
  item: { height: ITEM_H, alignItems: 'center', justifyContent: 'center' },
  itemText: { fontSize: 22, fontFamily: fonts.bold },
  itemTextOn: { fontSize: 26, fontFamily: fonts.extraBold },
  go: {
    marginTop: 12,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  goText: { fontSize: 16, fontFamily: fonts.extraBold },
  error: { fontSize: 13, fontFamily: fonts.semiBold, marginBottom: 8, textAlign: 'center' },
});

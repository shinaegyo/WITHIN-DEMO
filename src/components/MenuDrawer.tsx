import React, { useEffect, useRef, useState } from 'react';
import { Animated, Dimensions, Easing, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { fonts } from '../theme/fonts';
import { useTheme } from '../theme/ThemeContext';

export interface MenuItem {
  label: string;
  onPress?: () => void;
  /** Shown greyed out with a note — for things not built yet. */
  soon?: boolean;
}

const WIDTH = Math.min(320, Dimensions.get('window').width * 0.82);

export function MenuDrawer({
  visible,
  onClose,
  items,
}: {
  visible: boolean;
  onClose: () => void;
  items: MenuItem[];
}) {
  const { colors } = useTheme();
  const slide = useRef(new Animated.Value(0)).current;
  // Kept mounted through the closing animation, then unmounted.
  const [mounted, setMounted] = useState(visible);

  useEffect(() => {
    if (visible) setMounted(true);

    Animated.timing(slide, {
      toValue: visible ? 1 : 0,
      duration: visible ? 260 : 200,
      easing: visible ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished && !visible) setMounted(false);
    });
  }, [visible, slide]);

  if (!mounted) return null;

  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose}>
      <View style={styles.fill}>
        <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, { opacity: slide }]}>
          <Pressable style={styles.fill} onPress={onClose} />
        </Animated.View>

        <Animated.View
          style={[
            styles.panel,
            {
              backgroundColor: colors.surface,
              width: WIDTH,
              transform: [
                { translateX: slide.interpolate({ inputRange: [0, 1], outputRange: [-WIDTH, 0] }) },
              ],
            },
          ]}
        >
          <Text style={[styles.brand, { color: colors.text }]}>WITHIN</Text>

          {items.map((item) => (
            <Pressable
              key={item.label}
              disabled={item.soon}
              onPress={() => {
                onClose();
                item.onPress?.();
              }}
              style={({ pressed }) => [
                styles.item,
                { backgroundColor: pressed && !item.soon ? colors.surfaceAlt : 'transparent' },
              ]}
            >
              <Text style={[styles.itemLabel, { color: colors.text }, item.soon && styles.dim]}>
                {item.label}
              </Text>
              {item.soon && <Text style={[styles.soon, { color: colors.textMuted }]}>SOON</Text>}
            </Pressable>
          ))}
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  backdrop: { backgroundColor: 'rgba(0,0,0,0.5)' },
  panel: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    paddingTop: 68,
    paddingHorizontal: 12,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 20,
    shadowOffset: { width: 4, height: 0 },
    elevation: 16,
  },
  brand: {
    fontSize: 22,
    fontFamily: fonts.logo,
    letterSpacing: -0.5,
    paddingHorizontal: 14,
    marginBottom: 18,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 15,
    paddingHorizontal: 14,
    borderRadius: 14,
  },
  itemLabel: { flex: 1, fontSize: 16, fontFamily: fonts.semiBold },
  soon: { fontSize: 10, fontFamily: fonts.bold, letterSpacing: 0.8 },
  dim: { opacity: 0.4 },
});

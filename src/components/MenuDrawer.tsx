import React, { useEffect, useRef, useState } from 'react';
import { Animated, Dimensions, Easing, Modal, Pressable, StyleSheet, View } from 'react-native';
import { Text } from './AppText';
import { Wordmark } from './Wordmark';
import { Mark } from './Mark';
import { fonts } from '../theme/fonts';
import { useTheme } from '../theme/ThemeContext';
import { playTap } from '../utils/sound';

export interface MenuItem {
  label: string;
  onPress?: () => void;
  /** Shown greyed out with a note — for things not built yet. */
  soon?: boolean;
  /** Dims the item and shows this label, for things not available right now. */
  badge?: string;
  /** A count needing attention. Unlike badge, the item stays usable. */
  count?: number;
  /** A word beside the label — NEW and the like. Also leaves the item usable. */
  tag?: string;
  /** Opens a new group: play, people, your setup, reference. Space rather than
   *  a heading, because four headings on nine items is heavier than the
   *  problem they would be solving. */
  startsGroup?: boolean;
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
          <View style={styles.brand}>
            <Mark size={26} ink={colors.text} />
            <Wordmark size={32} color={colors.text} />
          </View>

          {items.map((item) => (
            <Pressable
              key={item.label}
              disabled={item.soon || !!item.badge}
              onPress={() => {
                playTap();
                onClose();
                item.onPress?.();
              }}
              style={({ pressed }) => [
                item.startsGroup && styles.grouped,
                styles.item,
                {
                  backgroundColor:
                    pressed && !item.soon && !item.badge ? colors.surfaceAlt : 'transparent',
                },
              ]}
            >
              <Text
                style={[styles.itemLabel, { color: colors.text }, (item.soon || item.badge) && styles.dim]}
              >
                {item.label}
              </Text>
              {!!item.tag && (
                <Text style={[styles.tag, { color: colors.accent }]}>{item.tag}</Text>
              )}
              {!!item.count && item.count > 0 && (
                <View style={[styles.count, { backgroundColor: colors.accent }]}>
                  <Text style={styles.countText}>{item.count}</Text>
                </View>
              )}
              {(item.soon || item.badge) && (
                <Text style={[styles.soon, { color: colors.textMuted }]}>
                  {item.badge ?? 'SOON'}
                </Text>
              )}
            </Pressable>
          ))}
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  grouped: { marginTop: 18 },
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
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
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
  tag: { fontSize: 9.5, fontFamily: fonts.extraBold, letterSpacing: 1.1, marginRight: 8 },
  count: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countText: { color: '#FFFFFF', fontSize: 11, fontFamily: fonts.extraBold },
  soon: { fontSize: 10, fontFamily: fonts.bold, letterSpacing: 0.8 },
  dim: { opacity: 0.4 },
});

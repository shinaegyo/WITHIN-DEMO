import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { fonts } from '../theme/fonts';
import { useTheme } from '../theme/ThemeContext';

export interface MenuItem {
  icon: string;
  label: string;
  onPress?: () => void;
  /** Shown greyed out with a note — for things not built yet. */
  soon?: boolean;
}

export function MenuSheet({
  visible,
  onClose,
  items,
}: {
  visible: boolean;
  onClose: () => void;
  items: MenuItem[];
}) {
  const { colors } = useTheme();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        {/* Stops a tap inside the sheet from closing it. */}
        <Pressable style={[styles.sheet, { backgroundColor: colors.surface }]} onPress={() => {}}>
          <View style={[styles.grabber, { backgroundColor: colors.border }]} />
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
              <Text style={[styles.itemIcon, item.soon && styles.dim]}>{item.icon}</Text>
              <Text style={[styles.itemLabel, { color: colors.text }, item.soon && styles.dim]}>
                {item.label}
              </Text>
              {item.soon && <Text style={[styles.soon, { color: colors.textMuted }]}>SOON</Text>}
            </Pressable>
          ))}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 10,
    paddingBottom: 34,
    paddingHorizontal: 12,
  },
  grabber: {
    width: 40,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 12,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 15,
    paddingHorizontal: 14,
    borderRadius: 14,
  },
  itemIcon: { fontSize: 19, width: 26, textAlign: 'center' },
  itemLabel: { flex: 1, fontSize: 16, fontFamily: fonts.semiBold },
  soon: { fontSize: 10, fontFamily: fonts.bold, letterSpacing: 0.8 },
  dim: { opacity: 0.4 },
});

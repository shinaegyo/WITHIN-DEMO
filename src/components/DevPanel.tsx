import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { MAX_NUMBER, MIN_NUMBER } from '../game/constants';
import { fonts } from '../theme/fonts';
import { useTheme } from '../theme/ThemeContext';

interface Props {
  currentAnswer: number;
  onSetAnswer: (answer: number) => void;
  onReset: () => void;
}

export function DevPanel({ currentAnswer, onSetAnswer, onReset }: Props) {
  const { colors } = useTheme();
  const [expanded, setExpanded] = useState(false);
  const [value, setValue] = useState('');

  if (!__DEV__) return null;

  const apply = () => {
    const parsed = Number(value);
    if (Number.isInteger(parsed) && parsed >= MIN_NUMBER && parsed <= MAX_NUMBER) {
      onSetAnswer(parsed);
      setValue('');
    }
  };

  return (
    <View style={[styles.wrap, { borderColor: colors.border }]}>
      <Pressable onPress={() => setExpanded((e) => !e)} style={styles.toggleRow}>
        <Text style={[styles.toggleText, { color: colors.textMuted }]}>
          Dev Tools {expanded ? '▾' : '▸'} (today's answer: {currentAnswer})
        </Text>
      </Pressable>
      {expanded && (
        <View style={styles.controls}>
          <TextInput
            style={[styles.input, { borderColor: colors.border, color: colors.text, backgroundColor: colors.surface }]}
            value={value}
            onChangeText={(t) => setValue(t.replace(/[^0-9]/g, ''))}
            placeholder="Set answer 1-1000"
            placeholderTextColor={colors.textMuted}
            keyboardType="number-pad"
            maxLength={4}
          />
          <Pressable style={[styles.applyButton, { backgroundColor: colors.accent }]} onPress={apply}>
            <Text style={styles.applyText}>Set & Restart</Text>
          </Pressable>
          <Pressable style={[styles.applyButton, { backgroundColor: colors.surfaceAlt }]} onPress={onReset}>
            <Text style={[styles.applyText, { color: colors.text }]}>Reset</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderTopWidth: 1,
    paddingTop: 10,
    marginTop: 4,
  },
  toggleRow: {
    paddingVertical: 4,
  },
  toggleText: {
    fontSize: 12,
    fontFamily: fonts.semiBold,
  },
  controls: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
  },
  applyButton: {
    borderRadius: 10,
    paddingHorizontal: 14,
    justifyContent: 'center',
  },
  applyText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontFamily: fonts.bold,
  },
});

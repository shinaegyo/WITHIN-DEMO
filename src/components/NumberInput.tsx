import React, { useRef, useState } from 'react';
import { Animated, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { fonts } from '../theme/fonts';
import { useTheme } from '../theme/ThemeContext';

type SubmitOutcome = { ok: true } | { ok: false; error: string };

interface Props {
  disabled: boolean;
  /** Async now that guesses are validated by the server. */
  onSubmit: (value: number) => Promise<SubmitOutcome>;
}

export function NumberInput({ disabled, onSubmit }: Props) {
  const { colors } = useTheme();
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const focus = useRef(new Animated.Value(0)).current;

  // Colour interpolation can't run on the native driver, but this is one small
  // element so the JS-driven animation is not a concern.
  const animateFocus = (to: number) =>
    Animated.timing(focus, {
      toValue: to,
      duration: 160,
      useNativeDriver: false,
    }).start();

  const handleSubmit = async () => {
    if (disabled || !value) return;
    const parsed = Number(value);
    const result = await onSubmit(parsed);
    if (result.ok) {
      setValue('');
      setError(null);
    } else {
      setError(result.error);
    }
  };

  const borderColor = error
    ? colors.danger
    : focus.interpolate({ inputRange: [0, 1], outputRange: [colors.border, colors.accent] });

  // Deepens on focus the way a pressed button does, rather than outlining it.
  const backgroundColor = focus.interpolate({
    inputRange: [0, 1],
    outputRange: [colors.surface, colors.surfaceAlt],
  });

  return (
    <View style={styles.wrap}>
      {error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}
      <View style={styles.row}>
        <Animated.View style={[styles.field, { borderColor, backgroundColor }]}>
          <TextInput
            style={[
              styles.input,
              { color: colors.text },
              // Suppresses the browser's own focus ring, which is drawn in the
              // system accent colour and clashes with the board.
              Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : null,
            ]}
            value={value}
            onChangeText={(text) => {
              setValue(text.replace(/[^0-9]/g, ''));
              if (error) setError(null);
            }}
            onFocus={() => animateFocus(1)}
            onBlur={() => animateFocus(0)}
            placeholder="Enter number"
            placeholderTextColor={colors.textMuted}
            keyboardType="number-pad"
            maxLength={4}
            editable={!disabled}
            onSubmitEditing={handleSubmit}
            returnKeyType="go"
          />
        </Animated.View>

        <Pressable
          style={({ pressed }) => [
            styles.button,
            { backgroundColor: disabled || !value ? colors.border : colors.accent, opacity: pressed ? 0.85 : 1 },
          ]}
          onPress={handleSubmit}
          disabled={disabled || !value}
        >
          <Text style={styles.buttonText}>Guess</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  field: {
    flex: 1,
    minWidth: 0,
    borderWidth: 1.5,
    borderRadius: 14,
  },
  input: {
    paddingHorizontal: 18,
    paddingVertical: 14,
    fontSize: 22,
    fontFamily: fonts.bold,
  },
  button: {
    borderRadius: 14,
    paddingHorizontal: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontFamily: fonts.bold,
  },
  error: {
    fontSize: 13,
    fontFamily: fonts.semiBold,
    marginBottom: 8,
  },
});

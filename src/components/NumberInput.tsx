import React, { useEffect, useRef, useState } from 'react';
import { Animated, Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Text } from './AppText';
import { fonts } from '../theme/fonts';
import { useTheme } from '../theme/ThemeContext';
import { playTap } from '../utils/sound';

type SubmitOutcome = { ok: true } | { ok: false; error: string };

interface Props {
  disabled: boolean;
  /** Async now that guesses are validated by the server. */
  onSubmit: (value: number) => Promise<SubmitOutcome>;
  /** "Guess" everywhere except setting a duel number, which is not one. */
  submitLabel?: string;
  placeholder?: string;
}

export function NumberInput({ disabled, onSubmit, submitLabel = 'Guess', placeholder = 'Enter number' }: Props) {
  const { colors } = useTheme();
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const focus = useRef(new Animated.Value(0)).current;
  const inputRef = useRef<TextInput>(null);

  // Guessing is a rapid back-and-forth: read the feedback, type the next
  // number. Losing the caret on every submit meant tapping back into the field
  // between guesses, which on a phone also closed and reopened the keyboard.
  // The field keeps focus while the round is live and lets go when it ends.
  useEffect(() => {
    if (disabled) inputRef.current?.blur();
  }, [disabled]);

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
      inputRef.current?.focus();
    } else {
      setError(result.error);
    }
  };

  // Focus resolves to the foreground colour rather than the accent. The board
  // spends blue, red and green on meaning, and an indigo ring here read as a
  // fourth signal competing with them.
  const borderColor = error
    ? colors.danger
    : focus.interpolate({ inputRange: [0, 1], outputRange: [colors.border, colors.text] });

  // Deepens on focus the way a pressed button does, rather than outlining it.
  const backgroundColor = focus.interpolate({
    inputRange: [0, 1],
    outputRange: [colors.surface, colors.surfaceAlt],
  });

  const ready = !disabled && !!value;

  return (
    <View style={styles.wrap}>
      {error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}

      {/* One shell around both halves: the field and its button are a single
          instrument, so they share an outline instead of each carrying one. */}
      <Animated.View style={[styles.shell, { borderColor, backgroundColor }]}>
        <View style={styles.fieldWrap}>
          <TextInput
            ref={inputRef}
            // Without this the keyboard dismisses itself on submit, undoing
            // the refocus above.
            blurOnSubmit={false}
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
            // Drawn separately below so it can be quieter than the number the
            // player types — a real placeholder inherits the input's own type.
            placeholder=""
            keyboardType="number-pad"
            maxLength={4}
            editable={!disabled}
            onSubmitEditing={handleSubmit}
            returnKeyType="go"
          />

          {!value && (
            <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.placeholderWrap]}>
              <Text style={[styles.placeholder, { color: colors.textMuted }]}>{placeholder}</Text>
            </View>
          )}
        </View>

        <Pressable
          style={({ pressed }) => [
            styles.button,
            {
              backgroundColor: ready ? colors.text : colors.border,
              opacity: pressed ? 0.85 : 1,
            },
          ]}
          onPress={() => {
            playTap();
            handleSubmit();
          }}
          disabled={!ready}
        >
          <Text style={[styles.buttonText, { color: ready ? colors.background : colors.textMuted }]}>
            {submitLabel}
          </Text>
        </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
  },
  shell: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderRadius: 16,
    padding: 5,
  },
  fieldWrap: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
  },
  input: {
    paddingHorizontal: 13,
    paddingVertical: 11,
    fontSize: 22,
    fontFamily: fonts.bold,
  },
  placeholderWrap: {
    justifyContent: 'center',
    paddingHorizontal: 13,
  },
  placeholder: {
    fontSize: 16,
    fontFamily: fonts.semiBold,
  },
  button: {
    alignSelf: 'stretch',
    borderRadius: 12,
    paddingHorizontal: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  buttonText: {
    fontSize: 16,
    fontFamily: fonts.extraBold,
  },
  error: {
    fontSize: 13,
    fontFamily: fonts.semiBold,
    marginBottom: 8,
  },
});

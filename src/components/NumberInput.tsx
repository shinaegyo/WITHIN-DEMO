import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { MAX_NUMBER, MIN_NUMBER } from '../game/constants';
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

  return (
    <View style={styles.wrap}>
      {error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}
      <View style={styles.row}>
        <TextInput
          style={[
            styles.input,
            {
              backgroundColor: colors.surface,
              borderColor: error ? colors.danger : colors.border,
              color: colors.text,
            },
          ]}
          value={value}
          onChangeText={(text) => {
            setValue(text.replace(/[^0-9]/g, ''));
            if (error) setError(null);
          }}
          placeholder={`${MIN_NUMBER}-${MAX_NUMBER}`}
          placeholderTextColor={colors.textMuted}
          keyboardType="number-pad"
          maxLength={4}
          editable={!disabled}
          onSubmitEditing={handleSubmit}
          returnKeyType="go"
        />
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
  input: {
    flex: 1,
    minWidth: 0,
    borderWidth: 1.5,
    borderRadius: 14,
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

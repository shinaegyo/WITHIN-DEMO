import React, { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { GameStatus } from '../game/types';
import { feedbackColors } from '../theme/colors';
import { fonts } from '../theme/fonts';
import { noHit } from '../theme/styles';
import { useTheme } from '../theme/ThemeContext';
import { Confetti } from './Confetti';
import { Rings } from './effects/Rings';

interface Props {
  status: GameStatus;
  answer: number;
  attemptsUsed: number;
  maxAttempts: number;
  onReset: () => void;
}

export function ResultOverlay({ status, answer, attemptsUsed, maxAttempts, onReset }: Props) {
  const { colors } = useTheme();
  const scale = useRef(new Animated.Value(0.7)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (status === 'playing') return;
    scale.setValue(0.7);
    opacity.setValue(0);
    Animated.parallel([
      Animated.spring(scale, { toValue: 1, useNativeDriver: true, friction: 6, tension: 80 }),
      Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
    ]).start();
  }, [status, scale, opacity]);

  if (status === 'playing') return null;

  const isWin = status === 'won';

  return (
    <View style={[StyleSheet.absoluteFill, styles.backdrop]}>
      {isWin && (
        <>
          <Confetti />
          <View style={[StyleSheet.absoluteFill, styles.rings, noHit]}>
            <Rings color={feedbackColors.correct} count={3} size={180} maxScale={3.4} duration={1100} />
          </View>
        </>
      )}
      <Animated.View
        style={[styles.card, { backgroundColor: colors.surface, opacity, transform: [{ scale }] }]}
      >
        <Text style={styles.emoji}>{isWin ? '🎉' : '💔'}</Text>
        <Text
          style={[styles.title, { color: colors.text }]}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.7}
        >
          {isWin ? 'CORRECT!' : 'OUT OF ATTEMPTS'}
        </Text>
        <Text style={[styles.subtitle, { color: colors.textMuted }]}>
          {isWin
            ? `You found it in ${attemptsUsed} of ${maxAttempts} attempts.`
            : `The number was ${answer}.`}
        </Text>
        <Pressable
          style={({ pressed }) => [styles.button, { backgroundColor: colors.accent, opacity: pressed ? 0.85 : 1 }]}
          onPress={onReset}
        >
          <Text style={styles.buttonText}>Play Again (Dev)</Text>
        </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 30,
  },
  rings: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    width: '88%',
    borderRadius: 24,
    paddingVertical: 32,
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  emoji: {
    fontSize: 48,
    marginBottom: 8,
  },
  title: {
    // Archivo Black is wide; "OUT OF ATTEMPTS" needs the smaller size plus
    // adjustsFontSizeToFit to stay on one line on narrow phones.
    fontSize: 25,
    fontFamily: fonts.logo,
    letterSpacing: -0.4,
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 15,
    fontFamily: fonts.medium,
    textAlign: 'center',
    marginBottom: 24,
  },
  button: {
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 28,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontFamily: fonts.bold,
  },
});

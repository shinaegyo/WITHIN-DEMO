import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text } from 'react-native';
import { feedbackColors } from '../theme/colors';

export type FeedbackTrigger = { type: 'within10' | 'oneAway'; key: number } | null;

interface Props {
  trigger: FeedbackTrigger;
}

export function FeedbackBanner({ trigger }: Props) {
  const scale = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const shake = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!trigger) return;

    scale.setValue(0);
    opacity.setValue(0);
    shake.setValue(0);

    const isOneAway = trigger.type === 'oneAway';

    const entrance = Animated.parallel([
      Animated.spring(scale, {
        toValue: 1,
        useNativeDriver: true,
        friction: 5,
        tension: isOneAway ? 120 : 90,
      }),
      Animated.timing(opacity, {
        toValue: 1,
        duration: 150,
        useNativeDriver: true,
      }),
    ]);

    const glowPulse = Animated.loop(
      Animated.sequence([
        Animated.timing(scale, { toValue: 1.06, duration: 260, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(scale, { toValue: 1, duration: 260, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
      { iterations: isOneAway ? 3 : 2 },
    );

    const shakeSeq = isOneAway
      ? Animated.sequence([
          Animated.timing(shake, { toValue: 6, duration: 45, useNativeDriver: true }),
          Animated.timing(shake, { toValue: -6, duration: 45, useNativeDriver: true }),
          Animated.timing(shake, { toValue: 4, duration: 45, useNativeDriver: true }),
          Animated.timing(shake, { toValue: 0, duration: 45, useNativeDriver: true }),
        ])
      : Animated.timing(shake, { toValue: 0, duration: 0, useNativeDriver: true });

    const exit = Animated.timing(opacity, {
      toValue: 0,
      duration: 220,
      useNativeDriver: true,
    });

    Animated.sequence([entrance, Animated.parallel([glowPulse, shakeSeq]), Animated.delay(120), exit]).start();
  }, [trigger, scale, opacity, shake]);

  if (!trigger) return null;

  const isOneAway = trigger.type === 'oneAway';
  const backgroundColor = isOneAway ? feedbackColors.oneAway : feedbackColors.within10;
  const label = isOneAway ? '😳 ONE AWAY!' : '🔥 WITHIN 10!';

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.wrap,
        {
          backgroundColor,
          opacity,
          transform: [{ scale }, { translateX: shake }],
        },
      ]}
    >
      <Text style={[styles.text, isOneAway && styles.textLarge]}>{label}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    top: '38%',
    alignSelf: 'center',
    paddingVertical: 16,
    paddingHorizontal: 28,
    borderRadius: 20,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
    zIndex: 20,
  },
  text: {
    color: '#FFFFFF',
    fontSize: 26,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  textLarge: {
    fontSize: 32,
  },
});

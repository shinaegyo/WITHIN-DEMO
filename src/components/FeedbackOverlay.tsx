import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { Text } from './AppText';
import { feedbackColors } from '../theme/colors';
import { fonts } from '../theme/fonts';
import { noHit } from '../theme/styles';
import { Rings } from './effects/Rings';
import { Sparks } from './effects/Sparks';

export type FeedbackKind = 'within10' | 'oneAway';
export type FeedbackTrigger = { type: FeedbackKind; key: number } | null;

interface Props {
  trigger: FeedbackTrigger;
  onDone: () => void;
}

export function FeedbackOverlay({ trigger, onDone }: Props) {
  if (!trigger) return null;
  // Keying on the trigger remounts the burst so every guess replays it cleanly.
  return <FeedbackBurst key={trigger.key} kind={trigger.type} onDone={onDone} />;
}

function FeedbackBurst({ kind, onDone }: { kind: FeedbackKind; onDone: () => void }) {
  const isOneAway = kind === 'oneAway';
  const accent = isOneAway ? feedbackColors.oneAway : feedbackColors.within10;

  const glow = useRef(new Animated.Value(0)).current;
  const flash = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const shake = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const pulse = (to: number, duration: number) =>
      Animated.timing(scale, { toValue: to, duration, useNativeDriver: true });

    const shakeTo = (to: number) =>
      Animated.timing(shake, { toValue: to, duration: 45, useNativeDriver: true });

    const entrance = Animated.parallel([
      Animated.spring(scale, {
        toValue: 1,
        useNativeDriver: true,
        friction: isOneAway ? 4 : 5,
        tension: isOneAway ? 150 : 90,
      }),
      Animated.timing(opacity, { toValue: 1, duration: 120, useNativeDriver: true }),
      // Kept low on purpose: a heavy full-screen wash turned the whole board
      // tan/muddy. The rings, emoji and label carry the moment instead.
      Animated.timing(glow, {
        toValue: isOneAway ? 0.26 : 0.15,
        duration: 140,
        useNativeDriver: true,
      }),
      ...(isOneAway
        ? [
            Animated.sequence([
              Animated.timing(flash, { toValue: 0.85, duration: 60, useNativeDriver: true }),
              Animated.timing(flash, { toValue: 0, duration: 240, useNativeDriver: true }),
            ]),
          ]
        : []),
    ]);

    const emphasis = isOneAway
      ? Animated.parallel([
          Animated.sequence([shakeTo(9), shakeTo(-9), shakeTo(7), shakeTo(-7), shakeTo(4), shakeTo(0)]),
          Animated.sequence([pulse(1.12, 150), pulse(1, 150), pulse(1.08, 150), pulse(1, 150)]),
        ])
      : Animated.sequence([pulse(1.07, 230), pulse(1, 230), pulse(1.05, 210), pulse(1, 210)]);

    const exit = Animated.parallel([
      Animated.timing(opacity, { toValue: 0, duration: 260, useNativeDriver: true }),
      Animated.timing(glow, { toValue: 0, duration: 300, useNativeDriver: true }),
    ]);

    const sequence = Animated.sequence([entrance, emphasis, Animated.delay(90), exit]);
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      onDone();
    };

    sequence.start(({ finished }) => {
      if (finished) finish();
    });

    // Animation callbacks stop firing if the app is backgrounded mid-burst,
    // which would otherwise strand the overlay on screen. Clear it regardless
    // once the burst has had more than enough time to play.
    const failsafe = setTimeout(finish, 3000);

    return () => {
      clearTimeout(failsafe);
      sequence.stop();
    };
  }, [isOneAway, glow, flash, scale, opacity, shake, onDone]);

  return (
    <View style={[StyleSheet.absoluteFill, styles.wrap, noHit]}>
      <Animated.View
        style={[StyleSheet.absoluteFill, { backgroundColor: accent, opacity: glow }]}
      />
      {isOneAway && (
        <Animated.View style={[StyleSheet.absoluteFill, styles.flash, { opacity: flash }]} />
      )}

      <View style={[StyleSheet.absoluteFill, styles.center, noHit]}>
        <Rings
          color={accent}
          count={isOneAway ? 3 : 2}
          size={isOneAway ? 170 : 150}
          maxScale={isOneAway ? 3.2 : 2.4}
          duration={isOneAway ? 1000 : 850}
        />
        {isOneAway && <Sparks colors={[accent, '#FFD166', '#FFFFFF']} count={16} />}

        <Animated.View
          style={{
            alignItems: 'center',
            opacity,
            transform: [{ scale }, { translateX: shake }],
          }}
        >
          {/* Typography carries the moment now — the rings, flash and shake
              already provide the energy the emoji used to. */}
          <Text style={[styles.kicker, isOneAway && styles.kickerLarge]}>
            {isOneAway ? 'SO' : 'YOU\u2019RE'}
          </Text>
          <Text style={[styles.label, isOneAway && styles.labelLarge]}>
            {isOneAway ? 'ONE AWAY' : 'WITHIN 10'}
          </Text>
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    zIndex: 20,
  },
  flash: {
    backgroundColor: '#FFFFFF',
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  kicker: {
    color: '#FFFFFF',
    fontSize: 17,
    fontFamily: fonts.bold,
    letterSpacing: 5,
    opacity: 0.85,
    marginBottom: 2,
    textShadowColor: 'rgba(0,0,0,0.4)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
  },
  kickerLarge: {
    fontSize: 20,
    letterSpacing: 7,
  },
  label: {
    color: '#FFFFFF',
    fontSize: 40,
    fontFamily: fonts.logo,
    letterSpacing: 0.5,
    textShadowColor: 'rgba(0,0,0,0.45)',
    textShadowOffset: { width: 0, height: 3 },
    textShadowRadius: 10,
  },
  labelLarge: {
    fontSize: 52,
  },
});

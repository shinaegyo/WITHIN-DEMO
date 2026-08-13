import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet } from 'react-native';

interface Props {
  color: string;
  count?: number;
  size?: number;
  maxScale?: number;
  duration?: number;
}

/** Concentric rings that expand outward and fade — a shockwave. */
export function Rings({ color, count = 2, size = 150, maxScale = 2.6, duration = 900 }: Props) {
  return (
    <>
      {Array.from({ length: count }).map((_, index) => (
        <Ring
          key={index}
          color={color}
          size={size}
          maxScale={maxScale}
          duration={duration}
          delay={index * 180}
        />
      ))}
    </>
  );
}

function Ring({
  color,
  size,
  maxScale,
  duration,
  delay,
}: Required<Omit<Props, 'count'>> & { delay: number }) {
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const anim = Animated.timing(progress, {
      toValue: 1,
      duration,
      delay,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    anim.start();
    return () => anim.stop();
  }, [progress, duration, delay]);

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.ring,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          borderColor: color,
          opacity: progress.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0, 0.75, 0] }),
          transform: [{ scale: progress.interpolate({ inputRange: [0, 1], outputRange: [0.3, maxScale] }) }],
        },
      ]}
    />
  );
}

const styles = StyleSheet.create({
  ring: {
    position: 'absolute',
    borderWidth: 3,
  },
});

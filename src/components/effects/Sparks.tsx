import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, StyleSheet } from 'react-native';

interface Props {
  colors: string[];
  count?: number;
  distance?: number;
  duration?: number;
}

/** Particles that shoot outward from the centre point. */
export function Sparks({ colors, count = 14, distance = 170, duration = 800 }: Props) {
  const particles = useMemo(
    () =>
      Array.from({ length: count }).map((_, index) => {
        const angle = (index / count) * Math.PI * 2;
        return {
          dx: Math.cos(angle) * distance * (0.7 + Math.random() * 0.5),
          dy: Math.sin(angle) * distance * (0.7 + Math.random() * 0.5),
          color: colors[index % colors.length],
          size: 7 + Math.random() * 6,
        };
      }),
    [count, distance, colors],
  );

  return (
    <>
      {particles.map((particle, index) => (
        <Spark key={index} {...particle} duration={duration} />
      ))}
    </>
  );
}

function Spark({
  dx,
  dy,
  color,
  size,
  duration,
}: {
  dx: number;
  dy: number;
  color: string;
  size: number;
  duration: number;
}) {
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const anim = Animated.timing(progress, {
      toValue: 1,
      duration,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    });
    anim.start();
    return () => anim.stop();
  }, [progress, duration]);

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.spark,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: color,
          opacity: progress.interpolate({ inputRange: [0, 0.7, 1], outputRange: [1, 0.7, 0] }),
          transform: [
            { translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [0, dx] }) },
            { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [0, dy] }) },
            { scale: progress.interpolate({ inputRange: [0, 1], outputRange: [1, 0.4] }) },
          ],
        },
      ]}
    />
  );
}

const styles = StyleSheet.create({
  spark: {
    position: 'absolute',
  },
});

import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, Dimensions, Easing, StyleSheet, View } from 'react-native';
import { noHit } from '../theme/styles';

const COLORS = ['#22A559', '#F5A524', '#4F46E5', '#E8452C', '#22D3EE', '#F472B6'];
const PIECE_COUNT = 24;
const { width } = Dimensions.get('window');

interface Piece {
  left: number;
  color: string;
  size: number;
  delay: number;
  duration: number;
  rotationDeg: number;
}

export function Confetti() {
  const pieces = useMemo<Piece[]>(
    () =>
      Array.from({ length: PIECE_COUNT }).map(() => ({
        left: Math.random() * width,
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
        size: 6 + Math.random() * 6,
        delay: Math.random() * 250,
        duration: 1400 + Math.random() * 900,
        rotationDeg: Math.random() * 360,
      })),
    [],
  );

  return (
    <View style={[StyleSheet.absoluteFill, styles.wrap, noHit]}>
      {pieces.map((piece, index) => (
        <ConfettiPiece key={index} piece={piece} />
      ))}
    </View>
  );
}

function ConfettiPiece({ piece }: { piece: Piece }) {
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(progress, {
      toValue: 1,
      duration: piece.duration,
      delay: piece.delay,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, [progress, piece.delay, piece.duration]);

  const translateY = progress.interpolate({ inputRange: [0, 1], outputRange: [-20, 640] });
  const opacity = progress.interpolate({ inputRange: [0, 0.85, 1], outputRange: [1, 1, 0] });
  const rotate = progress.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${piece.rotationDeg}deg`] });

  return (
    <Animated.View
      style={{
        position: 'absolute',
        left: piece.left,
        width: piece.size,
        height: piece.size * 1.6,
        backgroundColor: piece.color,
        borderRadius: 2,
        opacity,
        transform: [{ translateY }, { rotate }],
      }}
    />
  );
}

const styles = StyleSheet.create({
  wrap: {
    overflow: 'hidden',
  },
});

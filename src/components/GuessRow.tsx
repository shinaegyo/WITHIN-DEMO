import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { GuessResult } from '../game/types';
import { getTileColor } from '../theme/colors';

interface Props {
  result: GuessResult;
  attemptNumber: number;
}

export function GuessRow({ result, attemptNumber }: Props) {
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(anim, {
      toValue: 1,
      useNativeDriver: true,
      friction: 7,
      tension: 60,
    }).start();
  }, [anim]);

  const backgroundColor = getTileColor(result.direction, result.tier);

  const arrow = result.direction === 'correct' ? '✓' : result.direction === 'below' ? '▲' : '▼';
  const arrowLabel =
    result.direction === 'correct' ? 'Correct' : result.direction === 'below' ? 'Guess too low' : 'Guess too high';

  return (
    <Animated.View
      style={[
        styles.row,
        {
          backgroundColor,
          opacity: anim,
          transform: [
            { translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) },
            { scale: anim.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1] }) },
          ],
        },
      ]}
    >
      <Text style={styles.attemptLabel}>#{attemptNumber}</Text>
      <Text style={styles.guessText}>{result.guess}</Text>
      <Text style={styles.arrow} accessibilityLabel={arrowLabel}>
        {arrow}
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 18,
    marginBottom: 10,
  },
  attemptLabel: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 13,
    fontWeight: '600',
    width: 28,
  },
  guessText: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  arrow: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '900',
  },
});

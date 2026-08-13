import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { fonts } from '../theme/fonts';
import { useTheme } from '../theme/ThemeContext';

interface Props {
  clue1: string;
  clue2: string;
  clue2Unlocked: boolean;
}

export function ClueCard({ clue1, clue2, clue2Unlocked }: Props) {
  const { colors } = useTheme();
  const reveal = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!clue2Unlocked) {
      reveal.setValue(0);
      return;
    }
    Animated.spring(reveal, { toValue: 1, useNativeDriver: true, friction: 7, tension: 60 }).start();
  }, [clue2Unlocked, reveal]);

  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Text style={[styles.label, { color: colors.textMuted }]}>CLUE</Text>
      <Text style={[styles.clueText, { color: colors.text }]}>{clue1}</Text>

      {clue2Unlocked && (
        <Animated.View
          style={[
            styles.bonusWrap,
            {
              opacity: reveal,
              transform: [{ translateY: reveal.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }],
            },
          ]}
        >
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          <Text style={[styles.label, { color: colors.accent }]}>BONUS CLUE</Text>
          <Text style={[styles.clueText, { color: colors.text }]}>{clue2}</Text>
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  label: {
    fontSize: 11,
    fontFamily: fonts.bold,
    letterSpacing: 0.8,
    textAlign: 'center',
    marginBottom: 3,
  },
  clueText: {
    fontSize: 16,
    fontFamily: fonts.semiBold,
    textAlign: 'center',
  },
  bonusWrap: {
    alignSelf: 'stretch',
    alignItems: 'center',
  },
  divider: {
    height: 1,
    alignSelf: 'stretch',
    marginVertical: 10,
  },
});

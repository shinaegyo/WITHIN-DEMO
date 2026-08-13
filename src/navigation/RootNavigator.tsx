import {
  createNavigationContainerRef,
  DarkTheme,
  DefaultTheme,
  NavigationContainer,
} from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React, { useState } from 'react';
import { MenuDrawer } from '../components/MenuDrawer';
import { GameScreen } from '../screens/GameScreen';
import { HomeScreen } from '../screens/HomeScreen';
import { HowToPlayScreen } from '../screens/HowToPlayScreen';
import { DailyGameProvider, useDailyGameContext } from '../state/DailyGameContext';
import { fonts } from '../theme/fonts';
import { useTheme } from '../theme/ThemeContext';

export type RootStackParamList = {
  Home: undefined;
  Game: undefined;
  HowToPlay: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

// The menu lives outside the navigator, so it needs a ref rather than the
// navigation prop. Capturing it via state meant setting state during another
// component's render, which React rightly complains about.
const navRef = createNavigationContainerRef<RootStackParamList>();

function Screens() {
  const { colors, mode } = useTheme();
  const { startFreshTestPlayer } = useDailyGameContext();
  const [menuOpen, setMenuOpen] = useState(false);

  const navTheme = {
    ...(mode === 'dark' ? DarkTheme : DefaultTheme),
    colors: {
      ...(mode === 'dark' ? DarkTheme : DefaultTheme).colors,
      background: colors.background,
      card: colors.background,
      text: colors.text,
      border: colors.border,
      primary: colors.accent,
    },
  };

  return (
    <NavigationContainer theme={navTheme} ref={navRef}>
      <Stack.Navigator
        screenOptions={{
          headerTitleStyle: { fontFamily: fonts.extraBold },
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        <Stack.Screen name="Home" options={{ headerShown: false }}>
          {({ navigation }) => (
            <HomeScreen onPlay={() => navigation.navigate('Game')} onOpenMenu={() => setMenuOpen(true)} />
          )}
        </Stack.Screen>

        <Stack.Screen name="Game" options={{ headerShown: false }}>
          {({ navigation }) => <GameScreen onExit={() => navigation.navigate('Home')} />}
        </Stack.Screen>

        <Stack.Screen
          name="HowToPlay"
          component={HowToPlayScreen}
          options={{ title: 'How to Play', headerBackTitle: 'Back' }}
        />
      </Stack.Navigator>

      <MenuDrawer
        visible={menuOpen}
        onClose={() => setMenuOpen(false)}
        items={[
          { label: 'How to Play', onPress: () => navRef.isReady() && navRef.navigate('HowToPlay') },
          { label: 'Leaderboard', soon: true },
          { label: 'Sign In', soon: true },
          { label: 'Share', soon: true },
          { label: 'Settings', soon: true },
          ...(__DEV__
            ? [{ label: 'New test player (dev)', onPress: startFreshTestPlayer }]
            : []),
        ]}
      />
    </NavigationContainer>
  );
}

export function RootNavigator() {
  return (
    <DailyGameProvider>
      <Screens />
    </DailyGameProvider>
  );
}

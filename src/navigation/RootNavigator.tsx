import {
  createNavigationContainerRef,
  DarkTheme,
  DefaultTheme,
  NavigationContainer,
} from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React, { useEffect, useState } from 'react';
import { MenuDrawer } from '../components/MenuDrawer';
import { GameScreen } from '../screens/GameScreen';
import { HomeScreen } from '../screens/HomeScreen';
import { HowToPlayScreen } from '../screens/HowToPlayScreen';
import { AccountScreen } from '../screens/AccountScreen';
import { LeaderboardScreen } from '../screens/LeaderboardScreen';
import { FriendsScreen } from '../screens/FriendsScreen';
import { DuelsScreen } from '../screens/DuelsScreen';
import { DuelGameScreen } from '../screens/DuelGameScreen';
import { RankedScreen } from '../screens/RankedScreen';
import { EndlessScreen } from '../screens/EndlessScreen';
import { OnboardingScreen } from '../screens/OnboardingScreen';
import { PracticeScreen } from '../screens/PracticeScreen';
import { DailyGameProvider, useDailyGameContext } from '../state/DailyGameContext';
import { useProfile } from '../state/useProfile';
import { loadFriends, touchPresence } from '../lib/api';
import { fonts } from '../theme/fonts';
import { consumePracticeRound } from '../utils/practiceLimit';
import { hasSeenIntro, markIntroSeen } from '../utils/intro';
import { loadSoundSetting, setSoundEnabled, soundEnabled } from '../utils/soundSettings';
import { IntroScreen } from '../screens/IntroScreen';
import { DailyFirstScreen } from '../screens/DailyFirstScreen';
import { PrivacyScreen } from '../screens/PrivacyScreen';
import { useTheme } from '../theme/ThemeContext';

export type RootStackParamList = {
  Home: undefined;
  Game: undefined;
  Practice: { remainingAfterThis: number };
  Leaderboard: undefined;
  Friends: undefined;
  Duels: undefined;
  Ranked: undefined;
  Privacy: undefined;
  Endless: undefined;
  DuelGame: { duelId: string };
  Account: undefined;
  HowToPlay: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

// The menu lives outside the navigator, so it needs a ref rather than the
// navigation prop. Capturing it via state meant setting state during another
// component's render, which React rightly complains about.
const navRef = createNavigationContainerRef<RootStackParamList>();

function Screens({ username, onProfileChanged }: { username: string; onProfileChanged: () => void }) {
  const { colors, mode } = useTheme();
  const { startFreshTestPlayer, resetToday, reload, game, phase } = useDailyGameContext();
  const [menuOpen, setMenuOpen] = useState(false);
  const [sound, setSound] = useState(true);
  // Nobody is going to open a Friends screen on the off chance. A waiting
  // request has to announce itself, or it sits there until the sender gives up.
  const [pending, setPending] = useState(0);
  const [friendsEpoch, setFriendsEpoch] = useState(0);

  // Checks in while the app is open, so friends see a live dot rather than a
  // stale one. Stops as soon as the screen goes away.
  useEffect(() => {
    touchPresence();
    const id = setInterval(touchPresence, 60_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    loadFriends()
      .then((f) => setPending(f.incoming.length))
      .catch(() => {
        /* a badge is not worth disturbing the screen for */
      });
  }, [friendsEpoch]);

  useEffect(() => {
    loadSoundSetting().then(setSound);
  }, []);
  // Nudged whenever a round is consumed so Home refetches how many are left.
  const [practiceEpoch, setPracticeEpoch] = useState(0);

  const startPractice = async () => {
    const left = await consumePracticeRound();
    setPracticeEpoch((n) => n + 1);
    if (left === null) return; // cap already reached
    if (navRef.isReady()) navRef.navigate('Practice', { remainingAfterThis: left });
  };


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
            <HomeScreen
              onPlay={() => navigation.navigate('Game')}
              onEndless={() => navigation.navigate('Endless')}
              onOpenMenu={() => setMenuOpen(true)}
              menuAlert={pending > 0}
              onOpenLeaderboard={() => navigation.navigate('Leaderboard')}
              onOpenFriends={() => navigation.navigate('Friends')}
              onOpenDuels={() => navigation.navigate('Duels')}
              onOpenRanked={() => navigation.navigate('Ranked')}
              practiceEpoch={practiceEpoch}
              username={username}
            />
          )}
        </Stack.Screen>

        <Stack.Screen
          name="Game"
          options={{
            headerShown: false,
            // Swiping back would otherwise bypass the in-app rule above.
            gestureEnabled: !game || (game.currentRound === 1 && game.round.attemptsUsed === 0),
          }}
        >
          {({ navigation }) => <GameScreen onExit={() => navigation.navigate('Home')} />}
        </Stack.Screen>

        <Stack.Screen name="Practice" options={{ headerShown: false }}>
          {({ navigation, route }) => (
            <PracticeScreen
              // Remounts for a fresh number each round.
              key={route.params.remainingAfterThis}
              remainingAfterThis={route.params.remainingAfterThis}
              onExit={() => navigation.navigate('Home')}
              onPlayAnother={startPractice}
            />
          )}
        </Stack.Screen>

        <Stack.Screen name="Account" options={{ title: 'Profile', headerBackTitle: 'Back' }}>
          {() => <AccountScreen onChanged={() => { reload(); onProfileChanged(); }} />}
        </Stack.Screen>

        <Stack.Screen name="Endless" options={{ headerShown: false }}>
          {({ navigation }) => <EndlessScreen onExit={() => navigation.navigate('Home')} />}
        </Stack.Screen>

        <Stack.Screen name="Duels" options={{ title: 'Duels', headerBackTitle: 'Back' }}>
          {({ navigation }) => (
            <DuelsScreen onPlay={(duelId) => navigation.navigate('DuelGame', { duelId })} />
          )}
        </Stack.Screen>

        <Stack.Screen
          name="Privacy"
          options={{ title: 'Privacy', headerBackTitle: 'Back' }}
          component={PrivacyScreen}
        />

        <Stack.Screen name="Ranked" options={{ title: 'Ranked', headerBackTitle: 'Back' }}>
          {({ navigation }) => (
            <RankedScreen onPlay={(duelId) => navigation.navigate('DuelGame', { duelId })} />
          )}
        </Stack.Screen>

        <Stack.Screen name="DuelGame" options={{ headerShown: false }}>
          {({ navigation, route }) => (
            <DuelGameScreen
              duelId={route.params.duelId}
              onExit={() => navigation.goBack()}
              onLeave={() => navigation.navigate('Home')}
            />
          )}
        </Stack.Screen>

        <Stack.Screen name="Friends" options={{ title: 'Friends', headerBackTitle: 'Back' }}>
          {({ navigation }) => (
            <FriendsScreen
              username={username}
              onChanged={() => setFriendsEpoch((n) => n + 1)}
              onPlay={(duelId) => navigation.navigate('DuelGame', { duelId })}
            />
          )}
        </Stack.Screen>

        <Stack.Screen
          name="Leaderboard"
          component={LeaderboardScreen}
          options={{ title: 'All time', headerBackTitle: 'Back' }}
        />

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
          { label: 'Ranked', onPress: () => navRef.isReady() && navRef.navigate('Ranked') },
          { label: 'Duels', onPress: () => navRef.isReady() && navRef.navigate('Duels') },
          { label: 'Practice', onPress: startPractice },
          {
            label: 'Friends',
            count: pending,
            onPress: () => navRef.isReady() && navRef.navigate('Friends'),
          },
          { label: 'Leaderboard', onPress: () => navRef.isReady() && navRef.navigate('Leaderboard') },
          { label: 'Profile & Sign In', onPress: () => navRef.isReady() && navRef.navigate('Account') },
          { label: 'Privacy', onPress: () => navRef.isReady() && navRef.navigate('Privacy') },
          // Sharing lives on the home screen, where the result it shares is
          // already in front of you. A second entry here spent most of the day
          // greyed out, explaining that it was not available yet.
          {
            label: sound ? 'Sound on' : 'Sound off',
            onPress: () => {
              const next = !soundEnabled();
              setSoundEnabled(next);
              setSound(next);
            },
          },
          ...(__DEV__
            ? [
                { label: 'Replay today (dev)', onPress: resetToday },
                { label: 'New test player (dev)', onPress: startFreshTestPlayer },
              ]
            : []),
        ]}
      />

    </NavigationContainer>
  );
}

export function RootNavigator() {
  const profile = useProfile();
  // null until the flag has been read, so the tutorial never flashes up in
  // front of someone who has already done it.
  const [introSeen, setIntroSeen] = useState<boolean | null>(null);
  const [introStep, setIntroStep] = useState<'rules' | 'practice' | 'daily'>('rules');

  useEffect(() => {
    hasSeenIntro().then(setIntroSeen);
  }, []);

  const finishIntro = () => {
    markIntroSeen();
    setIntroSeen(true);
  };

  if (profile.loading || introSeen === null) return null;

  // Name first, then the tutorial. The rules land better once the app knows who
  // it is talking to, and a stranger who has been through sign-in has already
  // decided to be here.
  if (!profile.username) {
    return <OnboardingScreen onDone={profile.refresh} />;
  }

  if (!introSeen) {
    if (introStep === 'rules') {
      return <IntroScreen username={profile.username} onNext={() => setIntroStep('practice')} />;
    }
    if (introStep === 'practice') {
      return (
        <PracticeScreen
          introMode
          remainingAfterThis={0}
          onExit={() => setIntroStep('daily')}
          onPlayAnother={() => setIntroStep('daily')}
        />
      );
    }
    return <DailyFirstScreen onStart={finishIntro} />;
  }

  return (
    <DailyGameProvider>
      <Screens username={profile.username} onProfileChanged={profile.refresh} />
    </DailyGameProvider>
  );
}

import {
  createNavigationContainerRef,
  DarkTheme,
  DefaultTheme,
  NavigationContainer,
} from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { GameScreen } from '../screens/GameScreen';
import { HomeScreen } from '../screens/HomeScreen';
import { HowToPlayScreen } from '../screens/HowToPlayScreen';
import { AccountScreen } from '../screens/AccountScreen';
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
import { playTap, warmSounds } from '../utils/sound';
import { fonts } from '../theme/fonts';
import { practiceRemaining, consumePracticeRound } from '../utils/practiceLimit';
import { devSkipOnboarding, wantsDevSkip } from '../utils/devSkip';
import { hasSeenIntro, markIntroSeen } from '../utils/intro';
import { loadSoundSetting, loadVolumes, setSoundEnabled, soundEnabled } from '../utils/soundSettings';
import { IntroScreen } from '../screens/IntroScreen';
import { createMaterialTopTabNavigator } from '@react-navigation/material-top-tabs';
import { Avatar } from '../components/Avatar';
import { TabIcon, TabName } from '../components/TabIcon';
import { GamesScreen } from '../screens/GamesScreen';
import { ProfileScreen } from '../screens/ProfileScreen';
import { ImpossibleBoardScreen } from '../screens/ImpossibleBoardScreen';
import { BoardsScreen } from '../screens/BoardsScreen';
import { DailyFirstScreen } from '../screens/DailyFirstScreen';
import { PrivacyScreen } from '../screens/PrivacyScreen';
import { AudioScreen } from '../screens/AudioScreen';
import { AvatarScreen } from '../screens/AvatarScreen';
import { useTheme } from '../theme/ThemeContext';

export type RootStackParamList = {
  Home: undefined;
  Game: undefined;
  Practice: { remainingAfterThis: number };
  Leaderboard: undefined;
  Friends: undefined;
  Duels: undefined;
  Ranked: undefined;
  ImpossibleBoard: undefined;
  Privacy: undefined;
  Audio: undefined;
  Avatar: undefined;
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
const Tabs = createMaterialTopTabNavigator();

/**
 * Route name to icon, written out rather than derived.
 *
 * Lower-casing the route name to find an icon looked tidy and silently drew
 * nothing the moment a tab was called Board and the icon was called
 * leaderboard - a missing tab with no error anywhere.
 */
const ICONS: Record<string, TabName> = {
  Games: 'games',
  Friends: 'friends',
  Home: 'home',
  Board: 'leaderboard',
};

/**
 * Five tabs, swipeable and tappable.
 *
 * Drawn rather than configured, because the profile tab is the player's own
 * avatar rather than an icon - which is the point of having thirty of them, and
 * something a stock tab bar cannot express.
 */
function TabBar({ state, navigation, avatar, pending, colors }: any) {
  return (
    <View style={[styles.tabBar, { backgroundColor: colors.background, borderColor: colors.border }]}>
      {state.routes.map((route: any, index: number) => {
        const focused = state.index === index;
        const tint = focused ? colors.text : colors.textMuted;
        return (
          <Pressable
            key={route.key}
            style={styles.tab}
            onPress={() => {
              playTap();
              if (!focused) navigation.navigate(route.name);
            }}
          >
            {route.name === 'You' ? (
              <View style={[styles.tabAvatar, focused && { borderColor: colors.text }]}>
                <Avatar value={avatar} size={24} />
              </View>
            ) : (
              <TabIcon name={ICONS[route.name]} color={tint} active={focused} />
            )}

            {/* A waiting request is the one thing worth showing without being
                opened, which is the only real advantage a bar has over a menu. */}
            {route.name === 'Friends' && pending > 0 && (
              <View style={[styles.tabDot, { backgroundColor: colors.accent }]}>
                <Text style={styles.tabDotText}>{pending}</Text>
              </View>
            )}

            {focused && <Text style={[styles.tabLabel, { color: colors.text }]}>{route.name}</Text>}
          </Pressable>
        );
      })}
    </View>
  );
}

function Screens({
  username,
  avatar,
  onProfileChanged,
}: {
  username: string;
  avatar: string | null;
  onProfileChanged: () => void;
}) {
  const { colors, mode } = useTheme();
  const { startFreshTestPlayer, resetToday, reload, game, phase } = useDailyGameContext();
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

  // A request arrives from somebody else's phone, so the badge has to look for
  // it. Without this it appeared only after a reload, which is exactly when
  // nobody is looking for a reason to open Friends.
  useEffect(() => {
    let stopped = false;
    const read = () =>
      loadFriends()
        .then((f) => {
          if (!stopped) setPending(f.incoming.length);
        })
        .catch(() => {
          /* a badge is not worth disturbing the screen for */
        });

    read();
    const id = setInterval(read, 30_000);
    return () => {
      stopped = true;
      clearInterval(id);
    };
  }, [friendsEpoch]);

  useEffect(() => {
    loadSoundSetting().then(setSound);
    loadVolumes();
    warmSounds();
  }, []);
  // Nudged whenever a round is consumed so Home refetches how many are left.
  const [practiceEpoch, setPracticeEpoch] = useState(0);
  const [practiceLeft, setPracticeLeft] = useState<number | null>(null);

  useEffect(() => {
    practiceRemaining().then(setPracticeLeft);
  }, [practiceEpoch]);

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
            <Tabs.Navigator
              tabBarPosition="bottom"
              initialRouteName="Home"
              // Swipe or tap, and no top bar: the bar at the bottom is drawn by
              // hand because one of its five is the player's own avatar.
              tabBar={(props) => (
                <TabBar {...props} avatar={avatar} pending={pending} colors={colors} />
              )}
              screenOptions={{ swipeEnabled: true, lazy: true }}
            >
              <Tabs.Screen name="Games">
                {() => (
                  <GamesScreen
                    onDuels={() => navigation.navigate('Duels')}
                    onImpossible={() => navigation.navigate('ImpossibleBoard')}
                    onPractice={startPractice}
                    practiceLeft={practiceLeft}
                  />
                )}
              </Tabs.Screen>

              <Tabs.Screen name="Friends">
                {() => (
                  <FriendsScreen
                    username={username}
                    onChanged={() => setFriendsEpoch((n) => n + 1)}
                    onPlay={(duelId) => navigation.navigate('DuelGame', { duelId })}
                  />
                )}
              </Tabs.Screen>

              <Tabs.Screen name="Home">
                {/* The tab screen's own navigation, not the stack's: only this
                    one can move between tabs, and navigate('You') on the stack
                    matched no route and did nothing at all. */}
                {(tab) => (
                  <HomeScreen
                    onPlay={() => navigation.navigate('Game')}
                    onEndless={() => navigation.navigate('Endless')}
                    onOpenLeaderboard={() => navigation.navigate('Leaderboard')}
                    onOpenFriends={() => navigation.navigate('Friends')}
                    onOpenDuels={() => navigation.navigate('Duels')}
                    onOpenRanked={() => navigation.navigate('Ranked')}
                    onOpenProfile={() => tab.navigation.navigate('You')}
                    practiceEpoch={practiceEpoch}
                    username={username}
                  />
                )}
              </Tabs.Screen>

              <Tabs.Screen name="Board" component={BoardsScreen} />

              <Tabs.Screen name="You">
                {() => (
                  <ProfileScreen
                    username={username}
                    avatar={avatar}
                    onAvatar={() => navigation.navigate('Avatar')}
                    onAccount={() => navigation.navigate('Account')}
                    onAudio={() => navigation.navigate('Audio')}
                    onHowToPlay={() => navigation.navigate('HowToPlay')}
                    onPrivacy={() => navigation.navigate('Privacy')}
                  />
                )}
              </Tabs.Screen>
            </Tabs.Navigator>
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
          {({ navigation }) => (
            <EndlessScreen onExit={() => navigation.navigate('Home')} />
          )}
        </Stack.Screen>

        <Stack.Screen
          name="ImpossibleBoard"
          options={{ title: 'Impossible · this week', headerBackTitle: 'Back' }}
        >
          {({ navigation }) => (
            <ImpossibleBoardScreen onPlay={() => navigation.replace('Endless')} />
          )}
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

        <Stack.Screen name="Avatar" options={{ title: 'Avatar', headerBackTitle: 'Back' }}>
          {({ navigation }) => (
            <AvatarScreen
              username={username}
              current={avatar}
              onDone={() => {
                onProfileChanged();
                navigation.goBack();
              }}
            />
          )}
        </Stack.Screen>

        <Stack.Screen
          name="Audio"
          options={{ title: 'Audio', headerBackTitle: 'Back' }}
          component={AudioScreen}
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
          component={BoardsScreen}
          options={{ title: 'Boards', headerBackTitle: 'Back' }}
        />

        <Stack.Screen
          name="HowToPlay"
          component={HowToPlayScreen}
          options={{ title: 'How to Play', headerBackTitle: 'Back' }}
        />
      </Stack.Navigator>


    </NavigationContainer>
  );
}

export function RootNavigator() {
  const profile = useProfile();
  // null until the flag has been read, so the tutorial never flashes up in
  // front of someone who has already done it.
  const [introSeen, setIntroSeen] = useState<boolean | null>(null);
  const [introStep, setIntroStep] = useState<'avatar' | 'rules' | 'practice' | 'account' | 'daily'>('avatar');

  useEffect(() => {
    // localhost?dev lands on the home screen: name the anonymous player, mark
    // them taught, and carry on as though the tutorial had been done.
    if (wantsDevSkip()) {
      devSkipOnboarding()
        .then(() => profile.refresh())
        .finally(() => setIntroSeen(true));
      return;
    }
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
  // 1 name · 2 avatar · 3 the game itself · 4 an email, once there is something
  // to protect. The email used to be first, which guarded everything behind the
  // least appealing thing in the app.
  if (!profile.username) {
    return <OnboardingScreen mode="name" step={1} total={4} onDone={profile.refresh} />;
  }

  if (!introSeen) {
    if (introStep === 'avatar') {
      return (
        <AvatarScreen
          username={profile.username}
          step={2}
          total={4}
          onDone={() => {
            profile.refresh();
            setIntroStep('rules');
          }}
          onSkip={() => setIntroStep('rules')}
        />
      );
    }
    if (introStep === 'rules') {
      return <IntroScreen username={profile.username} onNext={() => setIntroStep('practice')} />;
    }
    if (introStep === 'practice') {
      return (
        <PracticeScreen
          introMode
          remainingAfterThis={0}
          onExit={() => setIntroStep('account')}
          onPlayAnother={() => setIntroStep('account')}
        />
      );
    }
    if (introStep === 'account') {
      return (
        <OnboardingScreen
          mode="account"
          step={4}
          total={4}
          onDone={async () => {
            await profile.refresh();
            setIntroStep('daily');
          }}
          onSkip={() => setIntroStep('daily')}
        />
      );
    }
    return (
      <DailyFirstScreen
        onStart={finishIntro}
        username={profile.username}
        avatar={profile.avatar}
      />
    );
  }

  return (
    <DailyGameProvider>
      <Screens
        username={profile.username}
        avatar={profile.avatar}
        onProfileChanged={profile.refresh}
      />
    </DailyGameProvider>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    flexDirection: 'row',
    borderTopWidth: 1,
    paddingTop: 8,
    paddingBottom: 10,
  },
  tab: { flex: 1, alignItems: 'center', gap: 2, paddingVertical: 2 },
  tabLabel: { fontSize: 8.5, fontFamily: fonts.bold, letterSpacing: 0.9 },
  tabAvatar: { width: 26, height: 26, borderRadius: 13, borderWidth: 2, borderColor: 'transparent', alignItems: 'center', justifyContent: 'center' },
  tabDot: {
    position: 'absolute',
    top: -2,
    right: '24%',
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  tabDotText: { color: '#FFFFFF', fontSize: 10, fontFamily: fonts.extraBold },
});

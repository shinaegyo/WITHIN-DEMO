import {
  createNavigationContainerRef,
  DarkTheme,
  DefaultTheme,
  NavigationContainer,
} from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React, { useEffect, useState } from 'react';
import { AppState, Pressable, StyleSheet, Text, View } from 'react-native';
import { GameScreen } from '../screens/GameScreen';
import { HomeScreen } from '../screens/HomeScreen';
import { HowToPlayScreen } from '../screens/HowToPlayScreen';
import { RushScreen } from '../screens/RushScreen';
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
import { clearPresence, loadFriends, touchPresence } from '../lib/api';
import { reloadIfStale } from '../utils/version';
import { playTap, warmSounds } from '../utils/sound';
import { fonts } from '../theme/fonts';
import { practiceRemaining, consumePracticeRound } from '../utils/practiceLimit';
import { devSkipOnboarding, wantsDevSkip } from '../utils/devSkip';
import { hasSeenIntro, markIntroSeen } from '../utils/intro';
import { loadSoundSetting, loadVolumes, setSoundEnabled, soundEnabled } from '../utils/soundSettings';
import { IntroScreen } from '../screens/IntroScreen';
import { createMaterialTopTabNavigator } from '@react-navigation/material-top-tabs';
import { Avatar } from '../components/Avatar';
import { BackButton } from '../components/BackButton';
import { TabIcon, TabName } from '../components/TabIcon';
import { StatusScreen } from '../components/StatusScreen';
import { GamesScreen } from '../screens/GamesScreen';
import { ProfileScreen } from '../screens/ProfileScreen';
import { ImpossibleBoardScreen } from '../screens/ImpossibleBoardScreen';
import { BoardsScreen } from '../screens/BoardsScreen';
import { DailyFirstScreen } from '../screens/DailyFirstScreen';
import { PrivacyScreen } from '../screens/PrivacyScreen';
import { AudioScreen } from '../screens/AudioScreen';
import { RemindersScreen } from '../screens/RemindersScreen';
import { AvatarScreen } from '../screens/AvatarScreen';
import { useTheme } from '../theme/ThemeContext';

export type RootStackParamList = {
  Home: undefined;
  Game: undefined;
  Practice: { remainingAfterThis: number };
  Friends: undefined;
  Duels: undefined;
  Ranked: undefined;
  ImpossibleBoard: undefined;
  Privacy: undefined;
  Audio: undefined;
  Reminders: undefined;
  Avatar: undefined;
  Endless: undefined;
  Rush: undefined;
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
 * nothing the moment a tab was called Rank and the icon was called
 * leaderboard - a missing tab with no error anywhere.
 */
const ICONS: Record<string, TabName> = {
  Games: 'games',
  Friends: 'friends',
  Home: 'home',
  Rank: 'leaderboard',
};

/**
 * Five tabs, swipeable and tappable.
 *
 * Drawn rather than configured, because the profile tab is the player's own
 * avatar rather than an icon - which is the point of having thirty of them, and
 * something a stock tab bar cannot express.
 */
function TabBar({ state, navigation, avatar, username, pending, colors }: any) {
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
                <Avatar value={avatar} size={24} name={username} />
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
  straightToGame = false,
}: {
  username: string;
  avatar: string | null;
  onProfileChanged: () => void;
  /** The tutorial's last button says "Play today's numbers" and should. */
  straightToGame?: boolean;
}) {
  const { colors, mode } = useTheme();
  const { startFreshTestPlayer, resetToday, reload, game, phase } = useDailyGameContext();
  const [sound, setSound] = useState(true);
  // Nobody is going to open a Friends screen on the off chance. A waiting
  // request has to announce itself, or it sits there until the sender gives up.
  const [pending, setPending] = useState(0);
  const [friendsEpoch, setFriendsEpoch] = useState(0);

  // Checks in while the app is in front of the player, and stands down the
  // moment it is not.
  //
  // Beating for as long as the app was merely loaded meant a backgrounded tab
  // reported somebody as present, so the dot said a copy of the app existed
  // rather than that anyone was there. Foreground only, and leaving is
  // announced rather than waited out - the window is two minutes, and a duel
  // round is three.
  useEffect(() => {
    let beat: ReturnType<typeof setInterval> | null = null;

    const start = () => {
      touchPresence();
      if (beat) clearInterval(beat);
      beat = setInterval(touchPresence, 45_000);
    };
    const stop = () => {
      if (beat) clearInterval(beat);
      beat = null;
      clearPresence();
    };

    start();
    // Coming back is also the moment to find out whether this is still the
    // current build. reloadIfStale has existed since the version stamp went in
    // and was never called from anywhere, so every fix shipped since then has
    // waited for players to refresh a tab they had no reason to refresh.
    reloadIfStale();
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') {
        start();
        reloadIfStale();
      } else {
        stop();
      }
    });

    return () => {
      sub.remove();
      if (beat) clearInterval(beat);
    };
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

  // Opening a practice round costs nothing; playing one costs a round. Spending
  // it on the way in charged people for a screen they had only looked at, which
  // is the same mistake Impossible made with its sessions.
  const startPractice = async () => {
    const left = await practiceRemaining();
    setPracticeEpoch((n) => n + 1);
    // Nothing to say: the button is disabled once there is nothing to spend.
    if (left <= 0) return;
    if (navRef.isReady()) navRef.navigate('Practice', { remainingAfterThis: left - 1 });
  };

  /** Charged by the round itself, on the first guess. */
  const spendPractice = async () => {
    await consumePracticeRound();
    setPracticeEpoch((n) => n + 1);
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
        // Somebody who has just pressed "Play today's numbers" is asking for
        // the numbers, not for the home screen with a Play button on it.
        initialRouteName={straightToGame ? 'Game' : undefined}
        // One back button everywhere. The stack drew the platform's own arrow
        // in its header while the mode screens drew ours, so the way back
        // changed shape depending on which screen you were leaving.
        screenOptions={({ navigation }) => ({
          headerTitleStyle: { fontFamily: fonts.extraBold },
          contentStyle: { backgroundColor: colors.background },
          headerBackVisible: false,
          headerLeft: () =>
            navigation.canGoBack() ? (
              <BackButton color={colors.text} onPress={() => navigation.goBack()} />
            ) : null,
        })}
      >
        <Stack.Screen name="Home" options={{ headerShown: false }}>
          {({ navigation }) => (
            <Tabs.Navigator
              tabBarPosition="bottom"
              initialRouteName="Home"
              // Swipe or tap, and no top bar: the bar at the bottom is drawn by
              // hand because one of its five is the player's own avatar.
              tabBar={(props) => (
                <TabBar {...props} avatar={avatar} username={username} pending={pending} colors={colors} />
              )}
              screenOptions={{ swipeEnabled: true, lazy: true }}
            >
              <Tabs.Screen name="Games">
                {() => (
                  <GamesScreen
                    onDuels={() => navigation.navigate('Duels')}
                    onImpossible={() => navigation.navigate('ImpossibleBoard')}
                    onRush={() => navigation.navigate('Rush')}
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
                    onEndless={() => navigation.navigate('ImpossibleBoard')}
                    onOpenLeaderboard={() => tab.navigation.navigate('Rank')}
                    onOpenFriends={() => navigation.navigate('Friends')}
                    onOpenDuels={() => navigation.navigate('Duels')}
                    onOpenRanked={() => navigation.navigate('Ranked')}
                    onRush={() => navigation.navigate('Rush')}
                    onOpenProfile={() => tab.navigation.navigate('You')}
                    practiceEpoch={practiceEpoch}
                    username={username}
                  />
                )}
              </Tabs.Screen>

              <Tabs.Screen name="Rank" component={BoardsScreen} />

              <Tabs.Screen name="You">
                {() => (
                  <ProfileScreen
                    username={username}
                    avatar={avatar}
                    onAvatar={() => navigation.navigate('Avatar')}
                    onAccount={() => navigation.navigate('Account')}
                    onAudio={() => navigation.navigate('Audio')}
                    onReminders={() => navigation.navigate('Reminders')}
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
              onSpend={spendPractice}
              onExit={() => (navigation.canGoBack() ? navigation.goBack() : navigation.navigate('Home'))}
              onPlayAnother={startPractice}
            />
          )}
        </Stack.Screen>

        <Stack.Screen name="Account" options={{ title: 'Profile', headerBackTitle: 'Back' }}>
          {() => <AccountScreen onChanged={() => { reload(); onProfileChanged(); }} />}
        </Stack.Screen>

        <Stack.Screen name="Endless" options={{ headerShown: false }}>
          {({ navigation }) => (
            <EndlessScreen
              onExit={() => (navigation.canGoBack() ? navigation.goBack() : navigation.navigate('Home'))}
            />
          )}
        </Stack.Screen>

        <Stack.Screen name="Rush" options={{ headerShown: false }}>
          {({ navigation }) => (
            <RushScreen
              onExit={() => (navigation.canGoBack() ? navigation.goBack() : navigation.navigate('Home'))}
            />
          )}
        </Stack.Screen>

        <Stack.Screen
          name="ImpossibleBoard"
          options={{ headerShown: false }}
        >
          {({ navigation }) => (
            <ImpossibleBoardScreen
              onPlay={() => navigation.replace('Endless')}
              onBack={() => (navigation.canGoBack() ? navigation.goBack() : navigation.navigate('Home'))}
            />
          )}
        </Stack.Screen>

        <Stack.Screen name="Duels" options={{ headerShown: false }}>
          {({ navigation }) => (
            <DuelsScreen
              onPlay={(duelId) => navigation.navigate('DuelGame', { duelId })}
              onBack={() => (navigation.canGoBack() ? navigation.goBack() : navigation.navigate('Home'))}
            />
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

        <Stack.Screen
          name="Reminders"
          options={{ title: 'Reminders', headerBackTitle: 'Back' }}
          component={RemindersScreen}
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
          name="HowToPlay"
          component={HowToPlayScreen}
          options={{ title: 'How to Play', headerBackTitle: 'Back' }}
        />
      </Stack.Navigator>


    </NavigationContainer>
  );
}

/**
 * Shown when the profile could not be read at all. StatusScreen draws no
 * background of its own — it has always sat inside a screen that had one — so
 * it gets one here rather than inheriting whatever is behind the root.
 */
function ProfileUnreachable({ onRetry }: { onRetry: () => void }) {
  const { colors } = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <StatusScreen
        message="Couldn't load your profile. Check your connection — your name and streak are safe."
        onRetry={onRetry}
      />
    </View>
  );
}

export function RootNavigator() {
  const profile = useProfile();
  // null until the flag has been read, so the tutorial never flashes up in
  // front of someone who has already done it.
  const [introSeen, setIntroSeen] = useState<boolean | null>(null);
  const [introStep, setIntroStep] = useState<'avatar' | 'rules' | 'practice' | 'account' | 'daily'>('avatar');
  // Going back to step one once a name exists, which the gate below would
  // otherwise never show again. Held separately from introStep because the
  // name is not part of the tutorial - it is the thing the tutorial is
  // addressed to, and it can be reached before the tutorial has started.
  const [renaming, setRenaming] = useState(false);

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

  // Only for a run that finished the tutorial just now - reopening the app
  // tomorrow starts at home like everybody else.
  const [justFinishedIntro, setJustFinishedIntro] = useState(false);

  const finishIntro = () => {
    markIntroSeen();
    setIntroSeen(true);
    setJustFinishedIntro(true);
  };

  if (profile.loading || introSeen === null) return null;

  // A read that failed says nothing about who this is, so it must not be
  // allowed to answer the question below. Sending an established player to
  // "Choose a username" on a dropped request was a trap with no way out: the
  // screen has one button, and the server refuses every name it can send
  // because the account already has one.
  if (profile.failed && !profile.username) {
    return <ProfileUnreachable onRetry={profile.refresh} />;
  }

  // Name first, then the tutorial. The rules land better once the app knows who
  // it is talking to, and a stranger who has been through sign-in has already
  // decided to be here.
  // 1 name · 2 avatar · 3 the game itself · 4 an email, once there is something
  // to protect. The email used to be first, which guarded everything behind the
  // least appealing thing in the app.
  if (!profile.username || renaming) {
    return (
      <OnboardingScreen
        mode="name"
        step={1}
        total={4}
        // Only when they came back to it deliberately. Somebody arriving here
        // for the first time has nothing behind them.
        initialName={renaming ? profile.username ?? '' : ''}
        // No arrow at all, in either direction. Nothing precedes step one, and
        // the way on from it is saving the name - which is what the button
        // does. An arrow next to it would either repeat the button or skip the
        // one thing this step exists to do.
        onDone={async () => {
          await profile.refresh();
          setRenaming(false);
        }}
      />
    );
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
          onBack={() => setRenaming(true)}
        />
      );
    }
    if (introStep === 'rules') {
      return (
        <IntroScreen
          username={profile.username}
          onNext={() => setIntroStep('practice')}
          onBack={() => setIntroStep('avatar')}
        />
      );
    }
    if (introStep === 'practice') {
      return (
        <PracticeScreen
          introMode
          remainingAfterThis={0}
          onExit={() => setIntroStep('account')}
          onPlayAnother={() => setIntroStep('account')}
          onBack={() => setIntroStep('rules')}
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
          // No way back from here. Behind this step is the practice round, and
          // returning to it means playing a second one - the tutorial gives
          // everybody exactly one. Both ways on are already here: add an email,
          // or skip it.
        />
      );
    }
    return (
      <DailyFirstScreen
        onStart={finishIntro}
        // Forwards only from step four on, for the same reason step four is:
        // everything behind this has been done once and is meant to stay done.
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
        straightToGame={justFinishedIntro}
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

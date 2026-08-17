import React from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '../components/AppText';
import { fonts } from '../theme/fonts';
import { useTrack } from '../utils/useTrack';
import { useTheme } from '../theme/ThemeContext';

const UPDATED = '15 August 2026';

/**
 * What the game keeps, in the words a player would use.
 *
 * Written as the actual behaviour rather than as a legal template, because a
 * policy describing data collection that does not happen is worse than none -
 * it teaches people the page is boilerplate and not worth reading.
 *
 * It has to be accurate the day advertising starts, not the day after, so the
 * advertising paragraph says plainly that there is none yet.
 */
export function PrivacyBody() {
  // The calm track. Outside the games the app is not silent any more - it has
  // its own room rather than the game's.
  useTrack('home');
  const { colors } = useTheme();

  const P = ({ children }: { children: React.ReactNode }) => (
    <Text style={[styles.body, { color: colors.textMuted }]}>{children}</Text>
  );
  const H = ({ children }: { children: React.ReactNode }) => (
    <Text style={[styles.h2, { color: colors.text }]}>{children}</Text>
  );

  return (
    <View style={styles.wrap}>
      <Text style={[styles.updated, { color: colors.textMuted }]}>Last updated {UPDATED}</Text>

      <P>
        WITHIN is a daily number game. This page says what it stores, why, and what you can ask us
        to remove.
      </P>

      <H>An account you did not ask for</H>
      <P>
        Opening the game creates an anonymous account automatically — a random identifier with no
        name, email or device details attached. It exists so your streak and scores survive closing
        the tab.
      </P>

      <H>An email, only if you give one</H>
      <P>
        You can add an email so your progress follows you to another phone. It is used to send
        sign-in codes and nothing else: no newsletters, and it is never sold, shared or used to
        find you elsewhere. Skipping it costs you nothing but the ability to recover an account.
      </P>

      <H>What playing records</H>
      <P>
        Your guesses, scores, streak, username, friends, duels and ranked results. Your username,
        scores, streak and ranked rating appear on leaderboards other players can see — that is the
        point of a leaderboard. Your guesses and your email are never shown to anyone else.
      </P>

      <H>On your device</H>
      <P>
        The game stores your sign-in session, your sound and theme settings, and how many practice
        rounds you have used today. There are no tracking or advertising cookies, and nothing is
        shared with other sites.
      </P>

      <H>Advertising</H>
      <P>
        There is no advertising in WITHIN today, and nothing here is used to profile you for it. If
        that changes, this page will say so before the first advert appears, and anyone in a region
        that requires consent will be asked before an advertising cookie is set.
      </P>

      <H>Who else can see it</H>
      <P>
        The game runs on Supabase, which hosts the database and handles sign-in, and Vercel, which
        serves the site. They process this data to run the game and for no purpose of their own.
        Nobody else receives it.
      </P>

      <H>Removing your data</H>
      <P>
        In the app: Profile, then Delete account. Everything tied to you goes with it — account,
        scores, streak, friends and duel history — and it happens immediately rather than on
        request. Deletion is permanent; there is no way to restore a streak afterwards.
      </P>

      <H>Children</H>
      <P>
        The game is not aimed at children under 13 and asks for no personal details beyond an
        optional email. An account made by a child can be removed the same way, from Profile.
      </P>
    </View>
  );
}

export function PrivacyScreen() {
  const { colors } = useTheme();
  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={styles.page}
      showsVerticalScrollIndicator={false}
    >
      <PrivacyBody />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 2 },
  page: { padding: 22, paddingBottom: 48 },
  updated: { fontSize: 11.5, fontFamily: fonts.medium, marginBottom: 14 },
  h2: { fontSize: 16, fontFamily: fonts.extraBold, marginTop: 22, marginBottom: 5 },
  body: { fontSize: 14.5, fontFamily: fonts.medium, lineHeight: 21 },
});

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { Text } from '../components/AppText';
import {
  AccountInfo,
  confirmLinkEmail,
  confirmSignIn,
  currentAccount,
  currentUsername,
  setUsername,
  signOut,
  startLinkEmail,
  startSignIn,
} from '../lib/auth';
import { feedbackColors } from '../theme/colors';
import { useTrack } from '../utils/useTrack';
import { fonts } from '../theme/fonts';
import { useTheme } from '../theme/ThemeContext';

/**
 * Signing in is optional. An anonymous player already owns a streak and a
 * leaderboard place; an account only exists so those survive losing the phone.
 */

/** Which path sent the code — resending and confirming differ between them. */
type Flow = 'link' | 'signin';

const RESEND_COOLDOWN = 30;

export function AccountScreen({
  onChanged,
  username,
}: {
  onChanged: () => void;
  /** Already known by the app, so the field is filled before any request. */
  username?: string | null;
}) {
  // The calm track. Outside the games the app is not silent any more - it has
  // its own room rather than the game's.
  useTrack('home');
  const { colors } = useTheme();

  const [account, setAccount] = useState<AccountInfo | null>(null);
  const [name, setName] = useState(username ?? '');
  const [savedName, setSavedName] = useState<string | null>(username ?? null);
  const [nameNote, setNameNote] = useState<{ ok: boolean; text: string } | null>(null);

  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [flow, setFlow] = useState<Flow | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async () => {
    setAccount(await currentAccount());
    // Confirms what was passed in rather than being the first to know it: the
    // field is already filled, so this only matters if it changed elsewhere.
    const existing = await currentUsername();
    setSavedName(existing);
    if (existing) setName(existing);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Supabase rate-limits sending, so hold the button briefly rather than
  // letting people hammer it and get thrown a lockout error.
  const startCooldown = useCallback(() => {
    setCooldown(RESEND_COOLDOWN);
    if (timer.current) clearInterval(timer.current);
    timer.current = setInterval(() => {
      setCooldown((n) => {
        if (n <= 1 && timer.current) clearInterval(timer.current);
        return Math.max(0, n - 1);
      });
    }, 1000);
  }, []);

  useEffect(() => () => { if (timer.current) clearInterval(timer.current); }, []);

  const run = async (fn: () => Promise<void>, after?: () => void) => {
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      await fn();
      after?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  const send = (which: Flow) =>
    run(
      // 'link' attaches the email to the current anonymous user so progress
      // carries over; 'signin' returns to an account made on another device.
      () => (which === 'link' ? startLinkEmail(email) : startSignIn(email)),
      () => {
        setFlow(which);
        setCode('');
        startCooldown();
        setNotice('Check your email for your 6-digit code.');
      },
    );

  const confirm = () =>
    run(
      () => (flow === 'signin' ? confirmSignIn(email, code) : confirmLinkEmail(email, code)),
      () => {
        setFlow(null);
        setCode('');
        refresh();
        onChanged();
      },
    );

  const saveName = async () => {
    setNameNote(null);
    setBusy(true);
    const res = await setUsername(name);
    setBusy(false);
    if (res.ok) {
      setSavedName(name.trim());
      setNameNote({ ok: true, text: 'Saved. This is the name on the leaderboard.' });
      onChanged();
    } else {
      setNameNote({ ok: false, text: res.error });
    }
  };

  const signedIn = !!account?.email;
  const nameUnchanged = busy || name.trim().length < 3 || name.trim() === savedName;

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        style={{ backgroundColor: colors.background }}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        {/* -------- name -------- */}
        <Text style={[styles.h2, { color: colors.text }]}>Your name</Text>
        <Text style={[styles.body, { color: colors.textMuted }]}>
          Shown on the leaderboard. You don't need an account to set one.
        </Text>

        <TextInput
          value={name}
          onChangeText={(t) => setName(t.replace(/[^A-Za-z0-9_]/g, ''))}
          placeholder="Pick a username"
          placeholderTextColor={colors.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
          maxLength={16}
          style={[styles.input, { borderColor: colors.border, color: colors.text, backgroundColor: colors.surface }]}
        />
        {nameNote ? (
          <Text style={[styles.note, { color: nameNote.ok ? feedbackColors.correct : colors.danger }]}>
            {nameNote.text}
          </Text>
        ) : (
          <Text style={[styles.hint, { color: colors.textMuted }]}>
            3–16 characters · letters, numbers, underscores
          </Text>
        )}
        <Pressable
          disabled={nameUnchanged}
          onPress={saveName}
          style={({ pressed }) => [
            styles.primary,
            { backgroundColor: colors.accent, opacity: nameUnchanged ? 0.4 : pressed ? 0.85 : 1 },
          ]}
        >
          <Text style={styles.primaryText}>Save name</Text>
        </Pressable>

        <View style={[styles.divider, { backgroundColor: colors.border }]} />

        {/* -------- account -------- */}
        <Text style={[styles.h2, { color: colors.text }]}>{signedIn ? 'Account' : 'Save your progress'}</Text>

        {signedIn ? (
          <>
            <Text style={[styles.body, { color: colors.textMuted }]}>
              Signed in as {account?.email}. Your streak and points are safe if you change phones.
            </Text>
            <Pressable
              onPress={() => run(signOut, () => { refresh(); onChanged(); })}
              style={({ pressed }) => [styles.secondary, { borderColor: colors.border, opacity: pressed ? 0.7 : 1 }]}
            >
              <Text style={[styles.secondaryText, { color: colors.text }]}>Sign out</Text>
            </Pressable>
          </>
        ) : flow === null ? (
          <>
            <Text style={[styles.body, { color: colors.textMuted }]}>
              Your streak currently lives only on this phone. Add an email and it follows you — we'll
              send a code, no password.
            </Text>

            <TextInput
              value={email}
              onChangeText={setEmail}
              placeholder="you@example.com"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              style={[styles.input, { borderColor: colors.border, color: colors.text, backgroundColor: colors.surface }]}
            />

            {error && <Text style={[styles.note, { color: colors.danger }]}>{error}</Text>}

            <Pressable
              disabled={busy || !email.includes('@')}
              onPress={() => send('link')}
              style={({ pressed }) => [
                styles.primary,
                { backgroundColor: colors.accent, opacity: busy || !email.includes('@') ? 0.4 : pressed ? 0.85 : 1 },
              ]}
            >
              <Text style={styles.primaryText}>Send code</Text>
            </Pressable>

            <Pressable
              disabled={busy || !email.includes('@')}
              onPress={() => send('signin')}
              style={({ pressed }) => [styles.link, { opacity: pressed ? 0.6 : 1 }]}
            >
              <Text style={[styles.linkText, { color: colors.textMuted }]}>
                Already have an account? Send a sign-in code
              </Text>
            </Pressable>
          </>
        ) : (
          <>
            <Text style={[styles.body, { color: colors.textMuted }]}>
              We sent a code to {email}.
            </Text>

            <TextInput
              value={code}
              onChangeText={(t) => setCode(t.replace(/[^0-9]/g, ''))}
              placeholder="6-digit code"
              placeholderTextColor={colors.textMuted}
              keyboardType="number-pad"
              autoFocus
              // Longer than the label on purpose: the project's OTP length is a
              // setting, and a mismatch should not make the code untypable.
              maxLength={10}
              style={[styles.input, { borderColor: colors.border, color: colors.text, backgroundColor: colors.surface }]}
            />

            {error && <Text style={[styles.note, { color: colors.danger }]}>{error}</Text>}
            {notice && !error && <Text style={[styles.note, { color: feedbackColors.correct }]}>{notice}</Text>}

            <Pressable
              disabled={busy || code.length < 6}
              onPress={confirm}
              style={({ pressed }) => [
                styles.primary,
                { backgroundColor: colors.accent, opacity: busy || code.length < 6 ? 0.4 : pressed ? 0.85 : 1 },
              ]}
            >
              <Text style={styles.primaryText}>Confirm</Text>
            </Pressable>

            <Pressable
              disabled={busy || cooldown > 0}
              onPress={() => send(flow)}
              style={({ pressed }) => [
                styles.secondary,
                { borderColor: colors.border, opacity: busy || cooldown > 0 ? 0.4 : pressed ? 0.7 : 1 },
              ]}
            >
              <Text style={[styles.secondaryText, { color: colors.text }]}>
                {cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend code'}
              </Text>
            </Pressable>

            <Pressable
              disabled={busy}
              onPress={() => { setFlow(null); setCode(''); setError(null); setNotice(null); }}
              style={({ pressed }) => [styles.link, { opacity: pressed ? 0.6 : 1 }]}
            >
              <Text style={[styles.linkText, { color: colors.textMuted }]}>Use a different email</Text>
            </Pressable>
          </>
        )}

        {busy && <ActivityIndicator color={colors.accent} style={styles.spinner} />}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: 24, paddingBottom: 60 },
  h2: { fontSize: 19, fontFamily: fonts.extraBold, marginBottom: 4 },
  body: { fontSize: 14, fontFamily: fonts.medium, lineHeight: 20, marginBottom: 14 },
  input: {
    borderWidth: 1.5,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 13,
    fontSize: 16,
    fontFamily: fonts.semiBold,
    marginBottom: 10,
  },
  note: { fontSize: 13, fontFamily: fonts.semiBold, marginBottom: 10 },
  hint: { fontSize: 12, fontFamily: fonts.medium, marginBottom: 10 },
  primary: { borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  primaryText: { color: '#FFFFFF', fontSize: 16, fontFamily: fonts.bold },
  secondary: {
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 13,
    alignItems: 'center',
    marginTop: 10,
  },
  secondaryText: { fontSize: 14, fontFamily: fonts.bold },
  link: { paddingVertical: 14, alignItems: 'center' },
  linkText: { fontSize: 13, fontFamily: fonts.medium, textDecorationLine: 'underline' },
  divider: { height: 1, marginVertical: 26 },
  spinner: { marginTop: 16 },
});

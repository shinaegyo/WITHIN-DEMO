import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
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
import { fonts } from '../theme/fonts';
import { useTheme } from '../theme/ThemeContext';

/**
 * Signing in is optional. An anonymous player already owns a streak and a
 * leaderboard place; an account only exists so those survive losing the phone.
 */
export function AccountScreen({ onChanged }: { onChanged: () => void }) {
  const { colors } = useTheme();

  const [account, setAccount] = useState<AccountInfo | null>(null);
  const [name, setName] = useState('');
  const [savedName, setSavedName] = useState<string | null>(null);
  const [nameNote, setNameNote] = useState<{ ok: boolean; text: string } | null>(null);

  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setAccount(await currentAccount());
    const existing = await currentUsername();
    setSavedName(existing);
    if (existing) setName(existing);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

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

  const signedIn = !!account?.email;

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
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
          disabled={busy || name.trim().length < 3 || name.trim() === savedName}
          onPress={saveName}
          style={({ pressed }) => [
            styles.primary,
            {
              backgroundColor: colors.accent,
              opacity: busy || name.trim().length < 3 || name.trim() === savedName ? 0.4 : pressed ? 0.85 : 1,
            },
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
        ) : (
          <>
            <Text style={[styles.body, { color: colors.textMuted }]}>
              Your streak currently lives only on this phone. Add an email and it follows you — we'll
              send a code, no password.
            </Text>

            <TextInput
              value={email}
              onChangeText={setEmail}
              editable={!codeSent}
              placeholder="you@example.com"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              style={[
                styles.input,
                {
                  borderColor: colors.border,
                  color: colors.text,
                  backgroundColor: codeSent ? colors.surfaceAlt : colors.surface,
                },
              ]}
            />

            {codeSent && (
              <TextInput
                value={code}
                onChangeText={(t) => setCode(t.replace(/[^0-9]/g, ''))}
                placeholder="6-digit code"
                placeholderTextColor={colors.textMuted}
                keyboardType="number-pad"
                maxLength={6}
                style={[styles.input, { borderColor: colors.border, color: colors.text, backgroundColor: colors.surface }]}
              />
            )}

            {error && <Text style={[styles.note, { color: colors.danger }]}>{error}</Text>}
            {notice && <Text style={[styles.note, { color: feedbackColors.correct }]}>{notice}</Text>}

            {!codeSent ? (
              <Pressable
                disabled={busy || !email.includes('@')}
                onPress={() =>
                  run(
                    // Links to the current anonymous user rather than creating
                    // a second account, so the streak carries over.
                    () => startLinkEmail(email),
                    () => {
                      setCodeSent(true);
                      setNotice('Check your email for a 6-digit code.');
                    },
                  )
                }
                style={({ pressed }) => [
                  styles.primary,
                  { backgroundColor: colors.accent, opacity: busy || !email.includes('@') ? 0.4 : pressed ? 0.85 : 1 },
                ]}
              >
                <Text style={styles.primaryText}>Send code</Text>
              </Pressable>
            ) : (
              <>
                <Pressable
                  disabled={busy || code.length < 6}
                  onPress={() =>
                    run(
                      () => confirmLinkEmail(email, code),
                      () => {
                        setCodeSent(false);
                        setCode('');
                        refresh();
                        onChanged();
                      },
                    )
                  }
                  style={({ pressed }) => [
                    styles.primary,
                    { backgroundColor: colors.accent, opacity: busy || code.length < 6 ? 0.4 : pressed ? 0.85 : 1 },
                  ]}
                >
                  <Text style={styles.primaryText}>Confirm</Text>
                </Pressable>

                {/* If the address already belongs to an account, linking fails;
                    this signs into that account instead. */}
                <Pressable
                  disabled={busy || code.length < 6}
                  onPress={() =>
                    run(
                      () => confirmSignIn(email, code),
                      () => {
                        setCodeSent(false);
                        setCode('');
                        refresh();
                        onChanged();
                      },
                    )
                  }
                  style={({ pressed }) => [styles.secondary, { borderColor: colors.border, opacity: pressed ? 0.7 : 1 }]}
                >
                  <Text style={[styles.secondaryText, { color: colors.text }]}>
                    I already had an account with this email
                  </Text>
                </Pressable>
              </>
            )}

            <Pressable
              disabled={busy || !email.includes('@')}
              onPress={() =>
                run(() => startSignIn(email), () => {
                  setCodeSent(true);
                  setNotice('Check your email for a 6-digit code.');
                })
              }
              style={({ pressed }) => [styles.link, { opacity: pressed ? 0.6 : 1 }]}
            >
              <Text style={[styles.linkText, { color: colors.textMuted }]}>
                Signing in on a new phone? Send me a sign-in code
              </Text>
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

import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { Text } from '../components/AppText';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Wordmark } from '../components/Wordmark';
import { confirmLinkEmail, confirmSignIn, setUsername, startLinkEmail, startSignIn } from '../lib/auth';
import { feedbackColors } from '../theme/colors';
import { fonts } from '../theme/fonts';
import { useTheme } from '../theme/ThemeContext';
import { playTrack } from '../utils/music';

/**
 * First-run flow. Two steps, because the account and the name are separate
 * decisions: the account protects a streak across devices, the name is what
 * appears on the leaderboard.
 */

type Step = 'account' | 'code' | 'username';
const RESEND_COOLDOWN = 30;

export function OnboardingScreen({
  onDone,
  mode = 'name',
  step: stepOf = 1,
  total = 4,
  onSkip,
}: {
  onDone: () => Promise<void> | void;
  /**
   * The name comes first because it is required and it is the fun one; the
   * email comes last, once there is a streak worth protecting. Asking for an
   * address on the first screen guards the whole game behind the least
   * appealing thing in it.
   */
  mode?: 'name' | 'account';
  step?: number;
  total?: number;
  onSkip?: () => void;
}) {
  const { colors } = useTheme();

  // The first screen anybody sees, so the music starts here rather than after
  // the tutorial. A browser refuses audio until something is pressed; the
  // player waits for that press and starts then, which is the name field or
  // the button either way.
  useEffect(() => {
    playTrack('home');
  }, []);

  const [step, setStep] = useState<Step>(mode === 'name' ? 'username' : 'account');
  const [flow, setFlow] = useState<'link' | 'signin'>('link');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const stepNumber = stepOf;

  const startCooldown = () => {
    setCooldown(RESEND_COOLDOWN);
    if (timer.current) clearInterval(timer.current);
    timer.current = setInterval(() => {
      setCooldown((n) => {
        if (n <= 1 && timer.current) clearInterval(timer.current);
        return Math.max(0, n - 1);
      });
    }, 1000);
  };

  const run = async (fn: () => Promise<void>, after?: () => void) => {
    setError(null);
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

  const send = (which: 'link' | 'signin') =>
    run(
      () => (which === 'link' ? startLinkEmail(email) : startSignIn(email)),
      () => {
        setFlow(which);
        setCode('');
        setStep('code');
        startCooldown();
      },
    );

  const saveName = async () => {
    setError(null);
    setBusy(true);
    const res = await setUsername(name);
    setBusy(false);
    if (res.ok) await onDone();
    else setError(res.error);
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]} edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.brand}>
            <Wordmark size={44} color={colors.text} />
            <Text style={[styles.tagline, { color: colors.textMuted }]}>Three rounds. One number each.</Text>
          </View>

          {/* Progress */}
          <Text style={[styles.stepLabel, { color: colors.textMuted }]}>
            STEP {stepNumber} OF {total}
          </Text>
          <View style={styles.bar}>
            {Array.from({ length: total }, (_, i) => i + 1).map((n) => (
              <View
                key={n}
                style={[
                  styles.barSegment,
                  { backgroundColor: n <= stepNumber ? colors.accent : colors.border },
                ]}
              />
            ))}
          </View>

          {step === 'account' && (
            <>
              <Text style={[styles.h1, { color: colors.text }]}>
                {onSkip ? 'Keep your progress' : 'Save your streak'}
              </Text>
              <Text style={[styles.body, { color: colors.textMuted }]}>
                {onSkip
                  ? "Your streak starts with today's numbers. Add an email and it follows you to a new phone — a code, no password."
                  : "Add an email so your streak and points follow you to a new phone. We'll send a code — no password to remember."}
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
                <Text style={styles.primaryText}>Continue</Text>
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

              {/* Remove once a verified sending domain exists — until then an
                  email requirement would lock out everyone but the developer. */}
              <Pressable
                disabled={busy}
                onPress={() => (onSkip ? onSkip() : setStep('username'))}
                style={({ pressed }) => [styles.link, { opacity: pressed ? 0.6 : 1 }]}
              >
                <Text style={[styles.linkText, { color: colors.textMuted }]}>
                  {onSkip ? 'Skip for now' : 'Continue without an account'}
                </Text>
              </Pressable>
            </>
          )}

          {step === 'code' && (
            <>
              <Text style={[styles.h1, { color: colors.text }]}>Enter your code</Text>
              <Text style={[styles.body, { color: colors.textMuted }]}>We sent a 6-digit code to {email}.</Text>

              <TextInput
                value={code}
                onChangeText={(t) => setCode(t.replace(/[^0-9]/g, ''))}
                placeholder="6-digit code"
                placeholderTextColor={colors.textMuted}
                keyboardType="number-pad"
                autoFocus
                maxLength={10}
                style={[styles.input, { borderColor: colors.border, color: colors.text, backgroundColor: colors.surface }]}
              />

              {error && <Text style={[styles.note, { color: colors.danger }]}>{error}</Text>}

              <Pressable
                disabled={busy || code.length < 6}
                onPress={() =>
                  run(
                    () => (flow === 'signin' ? confirmSignIn(email, code) : confirmLinkEmail(email, code)),
                    // Signing back in may already have a name; onDone re-checks.
                    () => setStep('username'),
                  )
                }
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
                onPress={() => { setStep('account'); setCode(''); setError(null); }}
                style={({ pressed }) => [styles.link, { opacity: pressed ? 0.6 : 1 }]}
              >
                <Text style={[styles.linkText, { color: colors.textMuted }]}>Use a different email</Text>
              </Pressable>
            </>
          )}

          {step === 'username' && (
            <>
              <Text style={[styles.h1, { color: colors.text }]}>Choose a username</Text>
              <Text style={[styles.body, { color: colors.textMuted }]}>
                This is how you'll appear on the leaderboard. Every name is unique.
              </Text>

              <TextInput
                value={name}
                onChangeText={(t) => setName(t.replace(/[^A-Za-z0-9_]/g, ''))}
                placeholder="Pick a username"
                placeholderTextColor={colors.textMuted}
                autoCapitalize="none"
                autoCorrect={false}
                autoFocus
                maxLength={16}
                style={[styles.input, { borderColor: colors.border, color: colors.text, backgroundColor: colors.surface }]}
              />

              {error ? (
                <Text style={[styles.note, { color: colors.danger }]}>{error}</Text>
              ) : (
                <Text style={[styles.hint, { color: colors.textMuted }]}>
                  3–16 characters · letters, numbers, underscores
                </Text>
              )}

              <Pressable
                disabled={busy || name.trim().length < 3}
                onPress={saveName}
                style={({ pressed }) => [
                  styles.primary,
                  { backgroundColor: colors.accent, opacity: busy || name.trim().length < 3 ? 0.4 : pressed ? 0.85 : 1 },
                ]}
              >
                <Text style={styles.primaryText}>Start playing</Text>
              </Pressable>
            </>
          )}

          {busy && <ActivityIndicator color={colors.accent} style={styles.spinner} />}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  flex: { flex: 1 },
  content: { padding: 28, paddingTop: 48, flexGrow: 1 },
  brand: { alignItems: 'center', marginBottom: 44 },
  tagline: { fontSize: 13, fontFamily: fonts.medium, marginTop: 4 },
  stepLabel: { fontSize: 10, fontFamily: fonts.bold, letterSpacing: 1.4, marginBottom: 8 },
  bar: { flexDirection: 'row', gap: 6, marginBottom: 30 },
  barSegment: { flex: 1, height: 4, borderRadius: 2 },
  h1: { fontSize: 26, fontFamily: fonts.logo, letterSpacing: -0.5, marginBottom: 8 },
  body: { fontSize: 15, fontFamily: fonts.medium, lineHeight: 21, marginBottom: 20 },
  input: {
    borderWidth: 1.5,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    fontFamily: fonts.semiBold,
    marginBottom: 10,
  },
  note: { fontSize: 13, fontFamily: fonts.semiBold, marginBottom: 10 },
  hint: { fontSize: 12, fontFamily: fonts.medium, marginBottom: 10 },
  primary: { borderRadius: 14, paddingVertical: 15, alignItems: 'center' },
  primaryText: { color: '#FFFFFF', fontSize: 16, fontFamily: fonts.bold },
  secondary: { borderWidth: 1, borderRadius: 14, paddingVertical: 13, alignItems: 'center', marginTop: 10 },
  secondaryText: { fontSize: 14, fontFamily: fonts.bold },
  link: { paddingVertical: 13, alignItems: 'center' },
  linkText: { fontSize: 13, fontFamily: fonts.medium, textDecorationLine: 'underline' },
  spinner: { marginTop: 16 },
});

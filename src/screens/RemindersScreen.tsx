import React, { useEffect, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '../components/AppText';
import { feedbackColors } from '../theme/colors';
import { useTrack } from '../utils/useTrack';
import { fonts } from '../theme/fonts';
import { useTheme } from '../theme/ThemeContext';
import { playTap } from '../utils/sound';
import { setReminders, type ReminderPrefs } from '../lib/api';
import { enablePush, pushAllowed } from '../utils/push';
import { radius, border } from '../theme/tokens';

/**
 * One reminder a day, at an hour you choose.
 *
 * A daily game is only daily if something says so. Everything else in the app
 * is built for the player who already opened it - this is the one thing that
 * reaches the player who forgot, and it is the difference between a streak and
 * a fortnight of silence.
 *
 * The hour is the whole design. A push at 3am costs the permission forever, and
 * iOS only lets an app ask once - so the hour is the player's own, in their own
 * timezone, and the server refuses to send twice in a day whatever else
 * happens.
 */

/** The hours worth offering. Nobody sets a reminder for 4am. */
const HOURS = [8, 9, 12, 15, 17, 18, 19, 20, 21, 22];

const label = (h: number) =>
  h === 12 ? 'noon' : h < 12 ? `${h}am` : h === 12 ? '12pm' : `${h - 12}pm`;

export function RemindersScreen() {
  useTrack(null);
  const { colors } = useTheme();
  const [prefs, setPrefs] = useState<ReminderPrefs>({ daily: false, hour: 19, streak: true, duel: false });
  const [allowed, setAllowed] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    pushAllowed().then(setAllowed);
    // The server's row is the truth about when; whether anything can arrive is
    // the device's business, and the two disagree the moment somebody turns
    // notifications off in iOS Settings.
    setReminders({}).then(setPrefs).catch(() => {});
  }, []);

  const save = async (next: Partial<ReminderPrefs>) => {
    setBusy(true);
    try {
      setPrefs(await setReminders(next));
    } catch {
      setNote('Could not save that. Try again in a moment.');
    } finally {
      setBusy(false);
    }
  };

  /**
   * Turning it on is the moment to ask the system, and the only one.
   *
   * Asking on first launch is how an app gets a No it can never come back from.
   * By the time somebody has pressed this, they have already decided.
   */
  const turnOn = async () => {
    setNote(null);
    const res = await enablePush();
    if (res.ok) {
      setAllowed(true);
      await save({ daily: true });
      return;
    }
    if (res.reason === 'denied') {
      setNote(
        Platform.OS === 'ios'
          ? 'Notifications are off for WITHIN in iOS Settings. Turn them on there and come back.'
          : 'Notifications are off for WITHIN in your system settings.',
      );
    } else if (res.reason === 'unsupported') {
      setNote('Reminders need the app installed on a phone — they cannot arrive in a browser.');
    } else {
      setNote('Something went wrong asking for permission.');
    }
  };

  const Row = ({
    label: rowLabel,
    detail,
    on,
    onToggle,
  }: {
    label: string;
    detail: string;
    on: boolean;
    onToggle: () => void;
  }) => (
    <Pressable
      disabled={busy}
      onPress={() => {
        playTap();
        onToggle();
      }}
      style={({ pressed }) => [
        styles.row,
        { borderColor: colors.border, backgroundColor: colors.surface, opacity: pressed ? 0.8 : 1 },
      ]}
    >
      <View style={styles.rowMain}>
        <Text style={[styles.rowLabel, { color: colors.text }]}>{rowLabel}</Text>
        <Text style={[styles.rowDetail, { color: colors.textMuted }]}>{detail}</Text>
      </View>
      <Text style={[styles.state, { color: on ? feedbackColors.correct : colors.textMuted }]}>
        {on ? 'ON' : 'OFF'}
      </Text>
    </Pressable>
  );

  const live = prefs.daily && allowed;

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={styles.page}
      showsVerticalScrollIndicator={false}
    >
      <Row
        label="Daily reminder"
        detail="One a day, and never on a day you have already played."
        on={live}
        onToggle={() => (live ? save({ daily: false }) : turnOn())}
      />

      {note && <Text style={[styles.note, { color: colors.textMuted }]}>{note}</Text>}

      <Text style={[styles.section, { color: colors.textMuted }]}>WHAT TIME</Text>
      <View style={styles.hours}>
        {HOURS.map((h) => {
          const picked = prefs.hour === h;
          return (
            <Pressable
              key={h}
              disabled={busy}
              onPress={() => {
                playTap();
                save({ hour: h });
              }}
              style={({ pressed }) => [
                styles.hour,
                {
                  borderColor: picked ? colors.accent : colors.border,
                  backgroundColor: picked ? colors.surfaceAlt : colors.surface,
                  opacity: pressed ? 0.8 : 1,
                },
              ]}
            >
              <Text
                style={[styles.hourText, { color: picked ? colors.text : colors.textMuted }]}
              >
                {label(h)}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Row
        label="Streak warnings"
        detail="On a run of two or more, the reminder says what is about to end."
        on={prefs.streak}
        onToggle={() => save({ streak: !prefs.streak })}
      />

      {/* Its own switch, and off by default. A duel invitation arrives about
          somebody else's timing rather than yours, and if it becomes a
          nuisance the mute takes the daily reminder with it - which is the one
          that actually keeps a daily game alive. */}
      <Row
        label="Duel invitations"
        detail="When somebody is waiting for an opponent. Never more than one a day."
        on={prefs.duel}
        onToggle={() => (prefs.duel ? save({ duel: false }) : allowed ? save({ duel: true }) : turnOn().then(() => save({ duel: true })))}
      />

      <Text style={[styles.footer, { color: colors.textMuted }]}>
        The time is your own clock, wherever you are. Nothing arrives on a day you have already
        finished your three rounds.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { padding: 18, gap: 10, paddingBottom: 40 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: border.hairline,
    borderRadius: radius.button,
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: 12,
  },
  rowMain: { flex: 1, gap: 3 },
  rowLabel: { fontSize: 15.5, fontFamily: fonts.extraBold },
  rowDetail: { fontSize: 12.5, fontFamily: fonts.medium, lineHeight: 17 },
  state: { fontSize: 13, fontFamily: fonts.extraBold, letterSpacing: 0.5 },
  section: { fontSize: 11.5, fontFamily: fonts.extraBold, letterSpacing: 1, marginTop: 14 },
  hours: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  hour: { borderWidth: border.hairline, borderRadius: radius.tile, paddingVertical: 9, paddingHorizontal: 14 },
  hourText: { fontSize: 13.5, fontFamily: fonts.bold },
  note: { fontSize: 12.5, fontFamily: fonts.medium, lineHeight: 18, paddingHorizontal: 2 },
  footer: { fontSize: 12, fontFamily: fonts.medium, lineHeight: 18, marginTop: 16 },
});

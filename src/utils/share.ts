import { Platform, Share } from 'react-native';
import { DailyGame } from '../lib/api';

/**
 * The shareable result.
 *
 * A grid of coloured blocks was the obvious thing to copy from Wordle, and it
 * does not survive the trip: five rows of squares arrive in a message as a
 * shape nobody can read, and unlike Wordle's it says almost nothing - the three
 * rounds now ask three different questions, so a column of blocks would not
 * even mean the same thing twice within one person's day.
 *
 * What travels is the score and where to play. Nothing here reveals a number or
 * how close a guess was, so it is safe to send before friends have played.
 */

const SITE = 'withindemo.vercel.app';

export function buildShareText(game: DailyGame): string {
  // No denominator, for the reason the summary card dropped its own: 35/70 is
  // a failing grade, and 35 is a good day.
  const lines = [
    `WITHIN #${game.puzzleNumber} — ${game.totalScore} ${game.totalScore === 1 ? 'point' : 'points'}`,
  ];

  if (game.stats.currentStreak > 0) {
    lines.push(`🔥 ${game.stats.currentStreak} day streak`);
  }

  lines.push('', `Play today's: ${SITE}`);
  return lines.join('\n');
}

/** Sent to somebody who has never played, so it leads with the invitation. */
export function buildInviteText(): string {
  return `Come play WITHIN today!\n\n${SITE}`;
}

export interface ShareOutcome {
  ok: boolean;
  copied?: boolean;
}

/**
 * Uses the OS share sheet where there is one, and falls back to the clipboard
 * on desktop browsers, which have no share sheet worth using.
 */
export async function shareResult(game: DailyGame): Promise<ShareOutcome> {
  return shareText(buildShareText(game));
}

export async function shareInvite(): Promise<ShareOutcome> {
  return shareText(buildInviteText());
}

async function shareText(message: string): Promise<ShareOutcome> {
  if (Platform.OS === 'web') {
    const nav = globalThis.navigator as any;

    if (nav?.share) {
      try {
        await nav.share({ text: message });
        return { ok: true };
      } catch (err: any) {
        // Dismissing the sheet is a decision, not a failure — don't then copy
        // something the player just chose not to send.
        if (err?.name === 'AbortError') return { ok: false };
        // Anything else means the sheet never opened: present on the browser
        // but unusable, which is common on desktop. Fall through to the
        // clipboard rather than leaving the player with nothing.
      }
    }

    try {
      if (nav?.clipboard?.writeText) {
        await nav.clipboard.writeText(message);
        return { ok: true, copied: true };
      }
    } catch {
      // Clipboard access can be denied outright.
    }
    return { ok: false };
  }

  try {
    const res = await Share.share({ message });
    return { ok: res.action !== Share.dismissedAction };
  } catch {
    return { ok: false };
  }
}

import { Platform, Share } from 'react-native';
import { DailyGame } from '../lib/api';
import { MAX_DAILY_SCORE } from '../game/scoring';

/**
 * The shareable result.
 *
 * Only direction is encoded — high, low or right — never a number and never
 * how close a guess was. It is safe to post before friends have played for a
 * second reason too: round order is per player, so somebody else's "round 1"
 * is not the same number as yours.
 */

const SITE = 'withindemo.vercel.app';

const MARK: Record<string, string> = {
  below: '🟦',
  above: '🟥',
  correct: '🟩',
};

export function buildShareText(game: DailyGame): string {
  const solved = game.dayStatus === 'complete';

  const grid = game.rounds
    .filter((r) => r.marks && r.marks.length > 0)
    .map((r) => r.marks.map((m) => MARK[m] ?? '⬜').join(''))
    .join('\n');

  const lines = [
    `WITHIN #${game.puzzleNumber} · ${game.totalScore}/${MAX_DAILY_SCORE}`,
    '',
    grid,
  ];

  if (!solved) lines.push('', 'Knocked out 💀');
  if (game.retriesUsed > 0) lines.push('(used a retry)');
  if (game.stats.currentStreak > 0) lines.push('', `🔥 ${game.stats.currentStreak} day streak`);

  lines.push('', SITE);
  return lines.filter((l) => l !== undefined).join('\n');
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
  const message = buildShareText(game);

  if (Platform.OS === 'web') {
    const nav = globalThis.navigator as any;
    try {
      if (nav?.share) {
        await nav.share({ text: message });
        return { ok: true };
      }
      if (nav?.clipboard?.writeText) {
        await nav.clipboard.writeText(message);
        return { ok: true, copied: true };
      }
    } catch {
      // A cancelled share sheet lands here too, which is not an error worth
      // reporting to the player.
      return { ok: false };
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

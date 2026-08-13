/**
 * Time until the next puzzle, which lands at the player's local midnight.
 *
 * Display only — the server decides when a new puzzle actually unlocks, from
 * the timezone stored on the profile. If a device clock is wrong the countdown
 * looks wrong, but the game itself is unaffected.
 */
export function msUntilLocalMidnight(now: Date = new Date()): number {
  const midnight = new Date(now);
  midnight.setHours(24, 0, 0, 0);
  return midnight.getTime() - now.getTime();
}

export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

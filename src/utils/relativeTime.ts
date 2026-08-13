/**
 * "How long ago", in the shortest form that is still unambiguous.
 *
 * Kept compact because it sits in a leaderboard row between a name and a score,
 * where a spelled-out "about 3 hours ago" would either wrap or squeeze the name.
 *
 * Each step is entered only once the unit below it is exhausted: minutes up to
 * 59, then hours up to 23, then days, then months, then years — so the value
 * never reads as something the next unit could say more precisely.
 */
export function formatRelative(iso: string | null): string {
  if (!iso) return '—';

  const then = Date.parse(iso);
  if (Number.isNaN(then)) return '—';

  const seconds = Math.max(0, (Date.now() - then) / 1000);

  if (seconds < 60) return 'now';

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;

  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d`;

  // Approximate on purpose: to a reader six weeks out, "1mo" is the useful
  // answer and the exact day count is not.
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo`;

  return `${Math.floor(days / 365)}y`;
}

import { League } from '../lib/api';

/**
 * The six leagues, in order, with the metal each one wears.
 *
 * The order is the ladder, so anything that needs to know whether one league is
 * above another asks this list rather than carrying its own copy - a promotion
 * is nothing more than a move up these indices.
 *
 * Bronze, silver and gold come straight from the medals on the boards, because
 * a player who is in Gold and sees a gold medal beside third place should be
 * seeing the same gold. Platinum, Diamond and Legend continue the run: two
 * cooler metals and then a colour that is not a metal at all, which is the
 * point of the top of a ladder.
 */
export const LEAGUES: League[] = ['Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond', 'Legend'];

export const LEAGUE_INK: Record<League, string> = {
  Bronze: '#B87333',
  Silver: '#AEB6BF',
  Gold: '#D4A017',
  Platinum: '#7FB6C4',
  Diamond: '#6F8FE8',
  Legend: '#B06CE0',
};

/** The points that open each league, for the ladder shown on the profile. */
export const LEAGUE_FLOOR: Record<League, number> = {
  Bronze: 0,
  Silver: 200,
  Gold: 400,
  Platinum: 600,
  Diamond: 800,
  Legend: 1000,
};

export function leagueRank(league: League): number {
  const i = LEAGUES.indexOf(league);
  return i < 0 ? 0 : i;
}

/** True when `now` sits above `before` on the ladder. */
export function promoted(before: League | null, now: League): boolean {
  return before !== null && leagueRank(now) > leagueRank(before);
}

/**
 * What the next league needs, or null at the top.
 *
 * Legend is the only league with a second condition, so the line that chases it
 * has to say both halves - a player sitting on 1100 points at thirty a day is
 * not being kept out by points.
 */
export function nextLeague(league: League): { league: League; points: number } | null {
  const i = leagueRank(league);
  if (i >= LEAGUES.length - 1) return null;
  const next = LEAGUES[i + 1];
  return { league: next, points: LEAGUE_FLOOR[next] };
}

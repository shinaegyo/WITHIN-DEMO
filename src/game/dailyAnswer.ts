/**
 * DEV-ONLY daily answer source.
 *
 * Phase 2+ will replace this whole module with a fetch to a server endpoint
 * that returns the real shared daily answer. Nothing outside this file should
 * know or care how the answer is produced — screens/components only ever call
 * getDailyAnswer().
 */

const DEFAULT_DEV_ANSWER = 427;

let devOverride: number | null = null;

export function getDailyAnswer(): number {
  return devOverride ?? DEFAULT_DEV_ANSWER;
}

/** Dev tooling only: lets the in-app dev panel test specific scenarios. */
export function setDevAnswerOverride(value: number | null): void {
  devOverride = value;
}

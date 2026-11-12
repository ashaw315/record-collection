/**
 * **SURPRISE ME's draw (§P.2 as "Ask field reconciled" rules it, 12 Nov; step 180).** "The page holding one
 * last-served record, and the pick excluding it from the whole tier unless that would leave nothing" is withdrawn:
 * the records the last answer named are left out, and the fallback is the whole pool. One rule for the ask and for
 * SURPRISE ME, so nothing singular survives from the moods build. `random` is injected so a test can name the draw.
 */
export function drawSurprise(poolIds: readonly string[], lastAnswer: readonly string[], random: () => number = Math.random): string | null {
  if (poolIds.length === 0) return null;
  const left = poolIds.filter((id) => !lastAnswer.includes(id));
  const from = left.length === 0 ? poolIds : left;
  return from[Math.min(from.length - 1, Math.floor(random() * from.length))] ?? null;
}

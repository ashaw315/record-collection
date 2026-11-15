/**
 * **SURPRISE ME's draw (§P.2 as "Ask field reconciled" rules it, 12 Nov; step 180).** "The page holding one
 * last-served record, and the pick excluding it from the whole tier unless that would leave nothing" is withdrawn:
 * the records the last answer named are left out, and the fallback is the whole pool. One rule for the ask and for
 * SURPRISE ME, so nothing singular survives from the moods build. `random` is injected so a test can name the draw.
 */
/*
  `shown` is the run's shown set, in the order its records were named (14 Nov). Where it holds every record, the draw
  leaves out the one named last while another remains: "the same record is not served twice in a row while another
  remains", and SURPRISE ME re-serves only "where the pool holds one" (§P.2).
*/
export function drawSurprise(poolIds: readonly string[], shown: readonly string[], random: () => number = Math.random): string | null {
  if (poolIds.length === 0) return null;
  const left = poolIds.filter((id) => !shown.includes(id));
  const last = shown.at(-1);
  const from = left.length > 0 ? left : poolIds.length > 1 ? poolIds.filter((id) => id !== last) : poolIds;
  return from[Math.min(from.length - 1, Math.floor(random() * from.length))] ?? null;
}

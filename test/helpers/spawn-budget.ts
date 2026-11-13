/**
 * A spawning test's budget, from its slowest test measured at rest (load 3 to 5, 13 Nov).
 *
 * Ten times, because the same tests that take 1.5s at rest timed out at 5s at load 14.5 on this 12-core laptop,
 * and the laptop is a working machine (Zoom, Chrome, a VM), not a build server. Never below vitest's default.
 */
export const underLoad = (msAtRest: number): number => Math.max(5_000, Math.ceil((msAtRest * 10) / 1_000) * 1_000);

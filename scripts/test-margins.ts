/**
 * **Which tests are nearest their time limit.**
 *
 * Three timing failures went into NOTES without a root cause (a seed
 * request reset, look up's race, a sign-in typed slowly), and what they
 * shared is that nobody knew beforehand which tests were one slow run from
 * red. On 10 Oct a test that takes 8 seconds against a 30 second limit
 * nobody chose was the first to go when WebKit ran 2.3 times slow.
 *
 * So a run says which tests used most of their limit. It is the share
 * that is ordered, not the duration: a minute against fifteen is further
 * from its limit than 24 seconds against 30.
 */
export type Timing = {
  /** What makes two attempts the same test. */
  id: string;
  /** How the line names it: project, file and line, title. */
  where: string;
  /** Milliseconds the attempt ran. */
  duration: number;
  /** Milliseconds the test was allowed; 0 is no limit. */
  timeout: number;
};

const used = (timing: Timing) => timing.duration / timing.timeout;

/** The tests nearest their limit, each by its worst attempt, nearest first. */
export function thinnest(timings: readonly Timing[], count = 10): Timing[] {
  const worst = new Map<string, Timing>();
  for (const timing of timings) {
    if (timing.timeout <= 0) continue;
    const held = worst.get(timing.id);
    if (held === undefined || used(timing) > used(held)) worst.set(timing.id, timing);
  }
  return [...worst.values()].sort((a, b) => used(b) - used(a)).slice(0, count);
}

const seconds = (ms: number) => `${(ms / 1000).toFixed(1)}s`;

export function marginsLines(timings: readonly Timing[], count = 10): string[] {
  const limited = new Set(timings.filter((timing) => timing.timeout > 0).map((timing) => timing.id)).size;
  if (limited === 0) return ['[margins] no test with a time limit ran'];
  const rows = thinnest(timings, count);
  return [
    `[margins] the ${rows.length} tests nearest their time limit, of ${limited} with one:`,
    ...rows.map((row) => {
      const left = row.timeout - row.duration;
      const margin = left < 0 ? `OVER by ${seconds(-left)}` : `${Math.round((left / row.timeout) * 100)}% left`;
      return `[margins] ${margin}: ${seconds(row.duration)} of ${row.timeout / 1000}s — ${row.where}`;
    }),
  ];
}

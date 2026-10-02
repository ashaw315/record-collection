/**
 * The handoff's build order, read as a sequence of numbered steps.
 *
 * **Design's exports replace the handoff wholesale.** A step Code inserts
 * between two exports is overwritten without a trace: step 71 was lost that
 * way twice in two days, the export carrying an italic placeholder where
 * the numbered, done-marked step had been. The list is sequential, so a gap
 * is a lost step -- but the first check compared each number with its
 * position and named the step AFTER the gap (`gap-at 72`), nothing named a
 * duplicate as one, and nothing said the vanished step had been marked done.
 * `check-index.mjs` assertion 3 reports from the three functions here.
 */

/** Spec: a step is a line matching `^\d+\. `. The quote lines and any placeholder prose between steps are not steps. */
const STEP = /^(\d+)\. (.*)$/;

/**
 * The handoff marks a step Code finished ahead of, or outside, the order
 * with a bold `Done:` or `Built.` opening. Every other step is unmarked,
 * built or not; the sequence check carries those.
 */
const DONE = /^\*\*(?:Done\b|Built\b)/;

/** @returns {{ n: number, line: number, text: string }[]} in file order */
export function parseSteps(orderBlock) {
  const steps = [];
  orderBlock.split('\n').forEach((line, i) => {
    const m = STEP.exec(line);
    if (m !== null) steps.push({ n: Number(m[1]), line: i, text: m[2] });
  });
  return steps;
}

/**
 * Numbers must run 0 to N, each once. `missing` is every number in that
 * range no step carries; `duplicates` every number more than one carries.
 * Both are named by the number itself, which is what a reader restores.
 */
export function stepSequence(steps) {
  if (steps.length === 0) return { last: null, missing: [], duplicates: [] };
  const counts = new Map();
  for (const s of steps) counts.set(s.n, (counts.get(s.n) ?? 0) + 1);
  const last = Math.max(...counts.keys());
  const missing = [];
  for (let n = 0; n <= last; n += 1) if (!counts.has(n)) missing.push(n);
  const duplicates = [...counts].filter(([, k]) => k > 1).map(([n]) => n).sort((a, b) => a - b);
  return { last, missing, duplicates };
}

export function isDone(text) {
  return DONE.test(text);
}

/**
 * The done-marked steps of `previous` (the committed order) whose number no
 * step of `current` (the tree's order) carries. By number, not text: Design
 * rewords done steps, and a reworded step is still there.
 */
export function doneStepsAbsent(previous, current) {
  const present = new Set(current.map((s) => s.n));
  return previous.filter((s) => isDone(s.text) && !present.has(s.n)).map(({ n, text }) => ({ n, text }));
}

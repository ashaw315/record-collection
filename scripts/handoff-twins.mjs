#!/usr/bin/env node
/**
 * **The link between a numbered Done line and the unnumbered step it
 * discharged, and the standing figure of ruled work with nothing built
 * against it (the coordinator, 4 Nov).**
 *
 *     node scripts/handoff-twins.mjs        # prints discharged, unbuilt and moved, exits 1 on a moved clause
 *
 * Design writes a step as "Unnumbered, for Code to number"; Code numbers it
 * by inserting a Done line of its own and never edits Design's, so both
 * stand. Each code-region block carries `discharges`: the step's head and
 * its clause as it stood when the work was built. A quote, not a pointer:
 * after Design edits the line a pointer still resolves and the Done reads
 * against text that moved; a quote that no longer matches names the step.
 * `scripts/handoff-unbuilt.json` lists what no block discharges, with what
 * was checked, and `test/repo/handoff-twins.test.ts` keeps the three sets
 * exact: discharged, unbuilt, and nothing in neither or both.
 */
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const HEAD = /^- \*\*Unnumbered, for Code to number(?: in the commit that takes it)? — (.+?)\.\*\*/;

/**
 * The unnumbered steps of a handoff text: each is its head (the words after
 * the dash, without the closing period) and its clause, the line itself with
 * the indented lines beneath it, which is what a step's bullets and quote
 * are, up to the next line that starts at the margin.
 */
export function stepsOf(text) {
  const lines = text.split('\n');
  const steps = [];
  for (let i = 0; i < lines.length; i += 1) {
    const m = lines[i].match(HEAD);
    if (!m) continue;
    const clause = [lines[i]];
    for (let j = i + 1; j < lines.length && /^\s+\S/.test(lines[j]); j += 1) clause.push(lines[j]);
    steps.push({ head: m[1], clause: clause.join('\n'), line: i + 1 });
  }
  return steps;
}

/** The heads every block's `discharges` names, with the block ids that name each. */
export function discharged(blocks) {
  const byHead = new Map();
  for (const b of blocks) for (const d of b.discharges ?? []) {
    if (!byHead.has(d.head)) byHead.set(d.head, []);
    byHead.get(d.head).push(b.id);
  }
  return byHead;
}

/**
 * Numbered is not built (the coordinator, 6 Nov). Until 6 Nov every
 * discharging block was a Done line, so discharged and built were one
 * bucket; then §W.8 was numbered 170 with nothing measured and the twins
 * counted it built, the backlog undercounting by one with the fact in prose
 * no test read. A numbered line without "Done" is its own bucket: the heads
 * such blocks discharge, each with its block id.
 */
export function numberedNotBuilt(blocks) {
  const out = new Map();
  for (const b of blocks) {
    if (!/^\d+[a-z]?\. \*\*Done\b/.test(b.text ?? '')) for (const d of b.discharges ?? []) out.set(d.head, b.id);
  }
  return out;
}

/*
  Q53 (the coordinator, 7 Nov): a Done line's head is a claim, not the state, and a clean one could not be told from
  one nobody had read. Every discharging Done block declares `states`, the clean ones included, so an omission is
  refused rather than read as "nothing owed". "built, nothing owed" stands alone: beside another state it would say
  two contrary things.
*/
export const STATES = ['built, nothing owed', "Code's work unbuilt", 'capture or measurement owed', 'judgement held', 'look provisional'];
const CLEAN = STATES[0];
const isDone = (b) => /^\d+[a-z]?\. \*\*Done\b/.test(b.text ?? '');

export function stateErrors(blocks) {
  const errors = [];
  for (const b of blocks) {
    if (!isDone(b) || !(b.discharges ?? []).length) continue;
    const s = b.states;
    if (!Array.isArray(s) || s.length === 0) errors.push(`${b.id}: no states declared`);
    else if (s.some((x) => !STATES.includes(x))) errors.push(`${b.id}: a state outside the five (${s.filter((x) => !STATES.includes(x)).join(', ')})`);
    else if (new Set(s).size !== s.length) errors.push(`${b.id}: a state named twice`);
    else if (s.includes(CLEAN) && s.length > 1) errors.push(`${b.id}: "${CLEAN}" beside another state`);
  }
  return errors;
}

/**
 * Each step's standing from its blocks: numbered (a block without Done), listed (unbuilt), or the union of its Done
 * blocks' states, "built, nothing owed" only where no block names anything else. The roll-up puts each step in one
 * place: Code has work where any part is Code's, waiting where anything is owed, held or provisional, else done.
 */
export function standing(steps, blocks, unbuilt) {
  const numbered = numberedNotBuilt(blocks);
  const listed = new Set(unbuilt.map((u) => u.head));
  const byState = new Map(STATES.map((s) => [s, 0]));
  const out = { byState, numbered: 0, listed: 0, codeHasWork: 0, waiting: 0, done: 0 };
  for (const step of steps) {
    if (numbered.has(step.head)) { out.numbered += 1; out.codeHasWork += 1; continue; }
    if (listed.has(step.head)) { out.listed += 1; out.codeHasWork += 1; continue; }
    const states = new Set(blocks.filter((b) => isDone(b) && (b.discharges ?? []).some((d) => d.head === step.head)).flatMap((b) => b.states ?? []));
    if (states.size > 1) states.delete(CLEAN);
    for (const s of states) byState.set(s, byState.get(s) + 1);
    if (states.has(STATES[1])) out.codeHasWork += 1;
    else if (states.has(CLEAN) || states.size === 0) out.done += 1;
    else out.waiting += 1;
  }
  return out;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const steps = stepsOf(readFileSync('docs/design/HANDOFF-wall-and-pull.md', 'utf8'));
  const blocks = JSON.parse(readFileSync('scripts/handoff-code-region.json', 'utf8'));
  const unbuilt = JSON.parse(readFileSync('scripts/handoff-unbuilt.json', 'utf8'));
  const done = discharged(blocks);
  const numbered = numberedNotBuilt(blocks);
  const listed = new Map(unbuilt.map((u) => [u.head, u]));
  const moved = [];
  for (const b of blocks) for (const d of b.discharges ?? []) {
    const step = steps.find((s) => s.head === d.head);
    if (step && step.clause !== d.clause) moved.push(`${b.id}: "${d.head}" moved after its Done`);
  }
  const unnamed = steps.filter((s) => !done.has(s.head) && !listed.has(s.head));
  const built = steps.filter((s) => done.has(s.head) && !numbered.has(s.head)).length;
  const numberedOnly = steps.filter((s) => numbered.has(s.head));
  console.log(`unnumbered steps ${steps.length}: built ${built}, numbered and not built ${numberedOnly.length}, listed as unbuilt ${steps.filter((s) => listed.has(s.head)).length}, in neither ${unnamed.length}`);
  for (const s of numberedOnly) console.log(`  numbered ${s.head}  — not built (${numbered.get(s.head)})`);
  for (const s of steps) if (listed.has(s.head)) console.log(`  unbuilt  ${s.head}  — ${listed.get(s.head).status}`);
  for (const s of unnamed) console.log(`  NEITHER  ${s.head}`);
  for (const m of moved) console.log(`  MOVED    ${m}`);
  const st = standing(steps, blocks, unbuilt);
  console.log(`built steps by state: ${[...st.byState].map(([s, n]) => `${s} ${n}`).join('; ')}`);
  console.log(`Code has work ${st.codeHasWork}, waiting ${st.waiting}, done ${st.done}`);
  const undeclared = stateErrors(blocks);
  for (const e of undeclared) console.log(`  STATE    ${e}`);
  process.exit(moved.length > 0 || unnamed.length > 0 || undeclared.length > 0 ? 1 : 0);
}

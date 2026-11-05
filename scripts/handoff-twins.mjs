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

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const steps = stepsOf(readFileSync('docs/design/HANDOFF-wall-and-pull.md', 'utf8'));
  const blocks = JSON.parse(readFileSync('scripts/handoff-code-region.json', 'utf8'));
  const unbuilt = JSON.parse(readFileSync('scripts/handoff-unbuilt.json', 'utf8'));
  const done = discharged(blocks);
  const listed = new Map(unbuilt.map((u) => [u.head, u]));
  const moved = [];
  for (const b of blocks) for (const d of b.discharges ?? []) {
    const step = steps.find((s) => s.head === d.head);
    if (step && step.clause !== d.clause) moved.push(`${b.id}: "${d.head}" moved after its Done`);
  }
  const unnamed = steps.filter((s) => !done.has(s.head) && !listed.has(s.head));
  console.log(`unnumbered steps ${steps.length}: discharged ${steps.filter((s) => done.has(s.head)).length}, listed as unbuilt ${steps.filter((s) => listed.has(s.head)).length}, in neither ${unnamed.length}`);
  for (const s of steps) if (listed.has(s.head)) console.log(`  unbuilt  ${s.head}  — ${listed.get(s.head).status}`);
  for (const s of unnamed) console.log(`  NEITHER  ${s.head}`);
  for (const m of moved) console.log(`  MOVED    ${m}`);
  process.exit(moved.length > 0 || unnamed.length > 0 ? 1 : 0);
}

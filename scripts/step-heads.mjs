#!/usr/bin/env node
/**
 * **A step a change file names is a step the handoff holds (the coordinator, 13 Nov).**
 *
 *     node scripts/step-heads.mjs     # records the heads from the drop refs, prints any absent, exits 1 on one
 *
 * Design writes a step as "Unnumbered, for Code to number"; Code numbers it with a Done line of its own and never
 * removes Design's (`scripts/handoff-twins.mjs`). Six times Code's commit removed it anyway: 177, 178 and 179 replaced
 * their steps with Done lines, and 180, 181 and 182 applied theirs and replaced them in the same commit, so those
 * three never stood in the tree at all. The twins test saw nothing wrong, since a step that is gone is neither
 * discharged nor unbuilt, and twice it surfaced only when a later change file's anchor was not there (12 and 13 Nov).
 *
 * So the heads each landed change file names are recorded, from the drop refs where the files live, into the
 * committed `scripts/handoff-step-heads.json`: the steps it inserts and the steps it anchors on ("In the step headed
 * …"). `test/repo/step-heads.test.ts` holds every recorded head to the handoff on each commit, CI included, where the
 * refs are absent and the record is not. A head is excused only by `scripts/handoff-steps-gone.json`, which names the
 * Design file that removed it, by deleting, renaming or superseding it, with the line that says so; the intake checks
 * that line against the file. The intake (`scripts/apply-code-region.mjs`) runs this before its suite, so a step
 * consumed in the commit that applies it fails there, before any anchor is missed.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { stepsOf } from './handoff-twins.mjs';

export const RECORD = 'scripts/handoff-step-heads.json';
export const GONE = 'scripts/handoff-steps-gone.json';
const HANDOFF = 'docs/design/HANDOFF-wall-and-pull.md';
const LANDED = 'docs/design-landed.jsonl';

/** The step heads a change file names: those it inserts, and those it anchors on, without the closing period. */
export function headsNamed(text) {
  const out = [];
  for (const m of text.matchAll(/^- \*\*Unnumbered, for Code to number(?: in the commit that takes it)? — (.+?)\.\*\*/gm)) out.push({ head: m[1], how: 'inserts' });
  for (const m of text.matchAll(/[Ii]n the step headed "(?:Unnumbered, for Code to number — )?(.+?)\.?"/g)) out.push({ head: m[1], how: 'anchors' });
  return out;
}

/**
 * The recorded heads the handoff does not hold and no Design file removed, each with the files that name it.
 * @param {{ file: string, heads: { head: string, how: string }[] }[]} record
 * @param {string} handoff
 * @param {{ head: string, by: string, how: string, line: string }[]} gone
 */
export function absent(record, handoff, gone) {
  const held = new Set(stepsOf(handoff).map((s) => s.head));
  const excused = new Set(gone.map((g) => g.head));
  const missing = new Map();
  for (const entry of record) for (const { head } of entry.heads) {
    if (held.has(head) || excused.has(head)) continue;
    if (!missing.has(head)) missing.set(head, []);
    missing.get(head).push(entry.file);
  }
  return [...missing].map(([head, files]) => ({ head, files }));
}

/** Gone entries that excuse a head the handoff still holds: an excuse outliving its reason hides the next removal. */
export function staleGone(handoff, gone) {
  const held = new Set(stepsOf(handoff).map((s) => s.head));
  return gone.filter((g) => held.has(g.head)).map((g) => g.head);
}

/* The landed record keys a file by its name less " - for Code to apply", and keeps any other verb (landed-list.mjs). */
const changeFile = (git, ref, name) => git('ls-tree', '--name-only', ref, 'docs/design/').split('\n')
  .find((f) => f === `docs/design/${name}` || f === `docs/design/${name}.md` || f.startsWith(`docs/design/${name} - for Code to apply`));

/** The record from the drop refs: each landed change file, read at its arrival ref, with the heads it names. */
export function fromRefs(git) {
  const landed = readFileSync(LANDED, 'utf8').trim().split('\n').map((l) => JSON.parse(l)).filter((x) => x.file);
  const record = [];
  const unread = [];
  for (const e of landed) {
    const path = e.ref ? changeFile(git, e.ref, e.file) : undefined;
    if (path === undefined) { unread.push(e.file); continue; }
    const heads = headsNamed(git('show', `${e.ref}:${path}`));
    if (heads.length > 0) record.push({ file: e.file, ref: e.ref, heads });
  }
  return { record, unread };
}

/** Each gone entry's line, found in the Design file it names, read at that file's ref; the entries whose line is not there. */
export function goneUnfounded(gone, git) {
  const landed = readFileSync(LANDED, 'utf8').trim().split('\n').map((l) => JSON.parse(l)).filter((x) => x.file);
  return gone.filter((g) => {
    const e = landed.find((x) => x.file === g.by);
    if (!e?.ref) return true;
    const path = changeFile(git, e.ref, g.by);
    return path === undefined || !git('show', `${e.ref}:${path}`).includes(g.line);
  }).map((g) => g.head);
}

/** Records the heads and judges them; the lines the intake prints, and whether it may proceed. */
export function check(git, write = true) {
  const { record, unread } = fromRefs(git);
  const text = `${JSON.stringify(record, null, 2)}\n`;
  if (write && (!existsSync(RECORD) || readFileSync(RECORD, 'utf8') !== text)) writeFileSync(RECORD, text);
  const gone = JSON.parse(readFileSync(GONE, 'utf8'));
  const missing = absent(record, readFileSync(HANDOFF, 'utf8'), gone);
  const stale = staleGone(readFileSync(HANDOFF, 'utf8'), gone);
  const unfounded = goneUnfounded(gone, git);
  const heads = record.reduce((n, e) => n + e.heads.length, 0);
  const lines = [`step heads: ${heads} named by ${record.length} landed files (${unread.length} with no change file in the refs: ${unread.join(', ') || 'none'}), ${missing.length} absent from the handoff, ${gone.length} removed by Design`];
  for (const m of missing) lines.push(`  ABSENT  ${m.head}  (named by ${m.files.join(', ')}): restore Design's step, or name the Design file that removed it in ${GONE}`);
  for (const s of stale) lines.push(`  STALE   ${s}: ${GONE} excuses a head the handoff holds`);
  for (const u of unfounded) lines.push(`  UNFOUNDED  ${u}: its line is not in the Design file it names`);
  return { ok: missing.length === 0 && stale.length === 0 && unfounded.length === 0, lines };
}

export const gitIn = (...args) => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const result = check(gitIn);
  process.stdout.write(`${result.lines.join('\n')}\n`);
  process.exit(result.ok ? 0 : 1);
}

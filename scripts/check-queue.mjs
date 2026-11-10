#!/usr/bin/env node
/**
 * The queue's check: a REPORT over `QUEUE.md`, never a verdict.
 *
 * `QUEUE.md` has no second record (the coordinator, 5 Nov). The twins test
 * (`test/repo/handoff-twins.test.ts`) can pair Design's unnumbered instruction
 * with Code's Done because two independent records exist and neither side can
 * drop a step the other holds. A queue file is one record, so a check over it
 * alone can hold ids unique, statuses valid, closed items resolving against
 * git and rulings against the design targets, and nothing more. It cannot
 * notice an item that was never written down, which is the exact failure the
 * file exists to prevent. A numbered assertion here would read as proof the
 * list is complete, which it cannot be, so every finding is report-only and
 * the exit code is always 0: an instrument that confirmed itself is the
 * family this is written to stay out of.
 *
 * Where a second record exists the check reads it rather than the file's
 * copy: the unbuilt handoff steps are printed from `scripts/handoff-unbuilt.json`,
 * the list the twins test keeps exact.
 *
 * **Assertion queue-1, one of the two numbered lines (queue-2 below), with the exit code: `QUEUE.md`
 * restates no unbuilt handoff step** (ruled by the coordinator, 5 Nov; its
 * name carries the script, because check-index's assertion 1 is "§65 rows=0"
 * and a refusal's message has to name one check). A
 * table row whose item carries a step's head after its `§x:` prefix,
 * lowercased with curly apostrophes straightened, is a copy; a row naming the
 * section number alone is a reference and is left alone. The two cannot be
 * confused because a reference needs the number and a copy needs the words,
 * and the heads are Design's sentences. What it misses is a paraphrase keeping
 * none of the words, the limit the index's quote rule already accepts. The
 * motivating defect is the coordinator's own, named by them: the queue content
 * handed over on 5 Nov restated all six unbuilt steps as items Q13 to Q18,
 * carrying their heads verbatim, and they had to be retired. Two
 * hand-maintained copies of one list, in the document this guards.
 *
 * `QUEUE_FILE` points a run at a staged file, which is how the tests break
 * one on purpose.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

export const STATUSES = ['open', 'done', 'dropped', 'ruled'];

/** Every `| Qn | status [ref] | item | record |` row of every table, with the `##` heading it sits under and its 1-based line. */
export function parseQueue(text) {
  const items = [];
  let section = '';
  text.split('\n').forEach((raw, i) => {
    const heading = /^##\s+(.+?)\s*$/.exec(raw);
    if (heading) {
      section = heading[1];
      return;
    }
    const row = /^\|\s*(Q\d+)\s*\|\s*([^|]*?)\s*\|\s*(.*?)\s*\|\s*([^|]*?)\s*\|\s*$/.exec(raw);
    if (row === null) return;
    const [status, ...rest] = row[2].split(/\s+/);
    items.push({ id: row[1], status: status ?? '', ref: rest.join(' ') || null, item: row[3], record: row[4], section, line: i + 1 });
  });
  return items;
}

const SHA = /^[0-9a-f]{7,40}$/;
const SECTION = /^§\S+$/;

/**
 * Internal consistency, as findings: duplicate ids, unknown statuses, a done
 * or dropped item naming no commit or one git does not resolve, a ruled (or
 * dropped-by-ruling) item naming no section or one no target holds.
 * `resolves` and `targetsText` are injected so the tests can stage each case.
 */
export function consistency(items, { resolves, targetsText }) {
  const findings = [];
  const seen = new Map();
  for (const it of items) {
    const at = `(line ${it.line})`;
    if (seen.has(it.id)) findings.push(`duplicate id ${it.id} at lines ${seen.get(it.id)} and ${it.line}`);
    else seen.set(it.id, it.line);
    if (!STATUSES.includes(it.status)) {
      findings.push(`${it.id}: status "${it.status}" is not one of ${STATUSES.join(', ')} ${at}`);
      continue;
    }
    if (it.status === 'done' || (it.status === 'dropped' && !(it.ref ?? '').startsWith('§'))) {
      if (it.ref === null || !SHA.test(it.ref)) findings.push(`${it.id}: ${it.status} names no commit ${at}`);
      else if (!resolves(it.ref)) findings.push(`${it.id}: ${it.status} names ${it.ref}, which git does not resolve ${at}`);
    } else if (it.status === 'ruled' || it.status === 'dropped') {
      if (it.ref === null || !SECTION.test(it.ref)) findings.push(`${it.id}: ${it.status} names no section ${at}`);
      else if (!targetsText.includes(it.ref)) findings.push(`${it.id}: ${it.status} ${it.ref}, which no design target or withdrawal holds ${at}`);
    }
  }
  return findings;
}

const plain = (s) => s.toLowerCase().replace(/[’‘]/g, "'").replace(/\s+/g, ' ');

/**
 * Rows that carry an unbuilt step's own words (its head after any `§x:`
 * prefix, in any case) are copies of the twins test's list; a row that names
 * the section number alone is a reference and is left alone.
 */
export function restatements(items, heads) {
  const findings = [];
  for (const head of heads) {
    const words = plain(head.replace(/^§[\w.]+:\s*/, ''));
    for (const it of items) if (plain(it.item).includes(words)) findings.push(`${it.id} restates "${head}", held by the twins test (line ${it.line})`);
  }
  return findings;
}

/**
 * **Assertion queue-2: no open row waits on a ruling that has landed** (the coordinator, 10 Nov). A row waiting on a
 * Design ruling names it after "**Waits on:**", a change file's title in double quotes or a withdrawal id in
 * backticks, and this resolves the name against the two records that exist for it: the landed list
 * (docs/design-landed.jsonl) and WITHDRAWALS.md's ids. The queue has no second record of its own; for this subset of
 * rows one exists. The motivating defect: Q10 and Q28 sat open four days after §43's ruling landed in "First paint is
 * styled", and with Q10 open, record-band-43:33's failures read as waiting on Design, so a stale row gave a live
 * failure a false cause. A name nothing holds is reported, not failed: the ruling may not be sent yet.
 */
export function waitingOnLanded(items, { files, withdrawalIds }) {
  const landed = [];
  const unknown = [];
  for (const it of items) {
    if (it.status !== 'open') continue;
    for (const m of it.item.matchAll(/\*\*Waits on:\*\*\s*(?:"([^"]+)"|`([^`]+)`)/g)) {
      const [name, shown] = m[1] !== undefined ? [m[1], `"${m[1]}"`] : [m[2], `\`${m[2]}\``];
      const held = m[1] !== undefined ? files.has(name) : withdrawalIds.has(name);
      (held ? landed : unknown).push(`${it.id} waits on ${shown}, which ${held ? 'has landed' : 'nothing holds yet'} (line ${it.line})`);
    }
  }
  return { landed, unknown };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const text = readFileSync(process.env.QUEUE_FILE ?? 'QUEUE.md', 'utf8');
  const items = parseQueue(text);
  /* UNBUILT_FILE is for the test's synthetic step only (7 Nov); the check reads the repo's list. */
  const unbuilt = JSON.parse(readFileSync(process.env.UNBUILT_FILE ?? 'scripts/handoff-unbuilt.json', 'utf8'));
  const design = 'docs/design';
  const targetsText = [
    ...readdirSync(design).filter((f) => /\.(md|dc\.html)$/.test(f)).map((f) => join(design, f)),
    'SPEC.md',
  ]
    .filter((p) => existsSync(p))
    .map((p) => readFileSync(p, 'utf8'))
    .join('\n');
  const resolves = (sha) => spawnSync('git', ['cat-file', '-e', `${sha}^{commit}`], { stdio: 'ignore' }).status === 0;

  const sections = [...new Set(items.map((i) => i.section))];
  const count = (s) => items.filter((i) => i.status === s).length;
  console.log(`QUEUE.md: ${items.length} items in ${sections.length} sections; open ${count('open')}, done ${count('done')}, dropped ${count('dropped')}, ruled ${count('ruled')}`);
  console.log(`unbuilt handoff steps, ${unbuilt.length}, derived from scripts/handoff-unbuilt.json (held by test/repo/handoff-twins.test.ts), not items here:`);
  for (const u of unbuilt) console.log(`  ${u.head} — ${u.status}`);
  const found = consistency(items, { resolves, targetsText });
  console.log(`consistency, report only: ${found.length === 0 ? 'nothing to report' : `${found.length} finding${found.length === 1 ? '' : 's'}`}`);
  for (const f of found) console.log(`  ${f}`);
  const copies = restatements(items, unbuilt.map((u) => u.head));
  /* `queue-1`, not `1`: assertion 1 is check-index's "§65 rows=0", and a refusal's message has to name one check (the coordinator, 5 Nov). */
  console.log(`${copies.length === 0 ? 'PASS' : 'FAIL'} queue-1 restates no unbuilt handoff step${copies.length === 0 ? '' : ` (${copies.length})`}`);
  for (const c of copies) console.log(`  ${c}`);
  const files = new Set(readFileSync('docs/design-landed.jsonl', 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l).file));
  const withdrawalIds = new Set([...readFileSync('docs/design/WITHDRAWALS.md', 'utf8').matchAll(/^- \*\*`([^`]+)`\*\*/gm)].map((m) => m[1]));
  const waits = waitingOnLanded(items, { files, withdrawalIds });
  console.log(`${waits.landed.length === 0 ? 'PASS' : 'FAIL'} queue-2 no open row waits on a ruling that has landed${waits.landed.length === 0 ? '' : ` (${waits.landed.length})`}`);
  for (const w of waits.landed) console.log(`  ${w}`);
  for (const w of waits.unknown) console.log(`  report only: ${w}`);
  console.log('The rest is a report, not a verdict: it cannot notice an item that was never written down, and a clean report is not proof the list is complete.');
  process.exit(copies.length === 0 && waits.landed.length === 0 ? 0 : 1);
}

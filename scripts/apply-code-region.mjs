#!/usr/bin/env node
/**
 * **Puts Code's lines back into the handoff after a Design export.**
 *
 *     node scripts/apply-code-region.mjs
 *
 * Design's exports replace `HANDOFF-wall-and-pull.md` wholesale, from a
 * source that does not hold what Code wrote into it. Code's lines live in
 * `scripts/handoff-code-region.json`, which no export touches: each block
 * is a paragraph and the start of the line it stands in front of. This
 * applies every block the handoff does not already carry, and exits one
 * if a block's anchor is gone, since a block it cannot place is a loss and
 * not a no-op. `test/repo/code-region.test.ts` fails the unit suite on a
 * tree where any block is absent.
 *
 * **It is the intake's one command (19 Oct), run on every drop.** A handoff
 * that already carries the blocks is a no-op, so nothing has to be judged
 * "needed". After the blocks it runs the index and the document suite,
 * `test/repo`, and exits one if either fails: Design's targets are test
 * inputs outside any test directory, and an intake that ran the index alone
 * left main red for two days (6077355). It fails the command, it does not
 * stop a commit: a `git commit` typed without it is not refused here, and
 * `commit-checked.sh` is the path that runs the same suite before one.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

/* run-result.ts loads as a module with its types stripped; Node warns that the package declares no type, on every intake. That warning only. */
const warned = process.listeners('warning');
process.removeAllListeners('warning');
process.on('warning', (warning) => {
  if (warning.code !== 'MODULE_TYPELESS_PACKAGE_JSON') for (const listener of warned) listener(warning);
});
const { readRunResult, summarise } = await import('./run-result.ts');
const { DOCUMENT_SUITE } = await import('./document-suite.mjs');

const HANDOFF = 'docs/design/HANDOFF-wall-and-pull.md';
const REGION = new URL('./handoff-code-region.json', import.meta.url);

export function readRegion() {
  return JSON.parse(readFileSync(REGION, 'utf8'));
}

/**
 * `handoff` with every absent block inserted as a paragraph in front of the
 * first line starting with its anchor. A block whose text changed replaces
 * its old line in place (29 Oct): "present" is the whole line, so a restated
 * step 160 was inserted beside its old text. `earlier` maps a block's id to
 * the texts it has had before, and only those are replaced, so a line that
 * merely shares a step's number is never overwritten.
 */
export function applyRegion(handoff, blocks, earlier = new Map()) {
  let lines = handoff.split('\n');
  const [restored, replaced, present, unanchored] = [[], [], [], []];
  for (const block of blocks) {
    if (lines.includes(block.text)) { present.push(block.id); continue; }
    const old = earlier.get(block.id);
    const was = old === undefined ? -1 : lines.findIndex((line) => old.has(line));
    if (was !== -1) { lines[was] = block.text; replaced.push(block.id); continue; }
    const at = lines.findIndex((line) => line.startsWith(block.before));
    if (at === -1) { unanchored.push(block.id); continue; }
    lines = [...lines.slice(0, at), block.text, '', ...lines.slice(at)];
    restored.push(block.id);
  }
  return { text: lines.join('\n'), restored, replaced, present, unanchored };
}

/** Every text each block has had in the commits that changed the region, by id; `git` runs a git command and returns its output. */
export function regionHistory(git) {
  const history = new Map();
  const commits = git('log', '--format=%H', '--', 'scripts/handoff-code-region.json').split('\n').filter(Boolean);
  for (const sha of commits) {
    for (const block of JSON.parse(git('show', `${sha}:scripts/handoff-code-region.json`))) {
      if (!history.has(block.id)) history.set(block.id, new Set());
      history.get(block.id).add(block.text);
    }
  }
  return history;
}

/** check-index's run: exit 0, a RESULT line, at least one assertion, every one passing and none absent. */
export function judgeIndex({ code, output }) {
  const m = /^RESULT: (\d+) PASS, (\d+) FAIL, (\d+) ABSENT of (\d+)/m.exec(output);
  if (m === null) return { ok: false, line: `no RESULT line (exit ${code}) — NOT OK` };
  const [pass, fail, absent, of] = m.slice(1).map(Number);
  const counts = `${pass} PASS, ${fail} FAIL, ${absent} ABSENT of ${of}`;
  const fault = fail > 0 || absent > 0 ? 'not every assertion passed' : of === 0 || pass !== of ? 'nothing was checked' : code !== 0 ? `non-zero exit (${code})` : null;
  return { ok: fault === null, line: `${counts} — ${fault === null ? 'OK' : `NOT OK — ${fault}`}` };
}

/** A vitest run, by the repository's judge: exit 0, a passed count above zero, nothing failed. */
export function judgeSuite({ code, output }) {
  const result = readRunResult({ output, exitCode: code, suite: 'unit' });
  return { ok: result.ok, line: summarise(result) };
}

const SUITE = process.env.INTAKE_SUITE?.split(' ') ?? DOCUMENT_SUITE;

/** The index, then the document suite, each run whatever the other said, so both lines are read. */
export function intake(run) {
  const index = judgeIndex(run('node', ['scripts/check-index.mjs']));
  const suite = judgeSuite(run('npx', ['vitest', 'run', ...SUITE]));
  return { ok: index.ok && suite.ok, lines: [`index: ${index.line}`, `${SUITE.join(' ')}: ${suite.line}`] };
}

const spawned = (command, args) => {
  const r = spawnSync(command, args, { encoding: 'utf-8', maxBuffer: 64 * 1024 * 1024 });
  return { code: r.status ?? 1, output: `${r.stdout ?? ''}${r.stderr ?? ''}` };
};

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const earlier = regionHistory((...args) => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }));
  const result = applyRegion(readFileSync(HANDOFF, 'utf8'), readRegion(), earlier);
  if (result.restored.length + result.replaced.length > 0) writeFileSync(HANDOFF, result.text);
  /*
    The landed record (the coordinator, 7 Nov): every change file the drop refs hold and the record does not list is
    appended with its ref and capture time, the record created with its horizon on the first run. The intake's commit
    names the file, so the landing commit is the first commit holding each line.
  */
  const { recordUpdate, fromGit, RECORD } = await import('./landed-list.mjs');
  /* LANDED_RECORD is for code-region.test's runs of this command in the real repo, which must not write the real record (10 Nov). */
  const target = process.env.LANDED_RECORD ?? RECORD;
  const existing = existsSync(RECORD) ? readFileSync(RECORD, 'utf8') : null;
  const d = new Date();
  const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const git = fromGit();
  const landed = recordUpdate(existing, git.drops, today, git.commits);
  if (landed.text !== null && landed.text !== existing) writeFileSync(target, landed.text);
  process.stdout.write(`landed record (${target}): ${landed.appended.length} appended${landed.appended.length > 0 ? ` (${landed.appended.join(', ')}); name ${target} in this intake's commit` : ''}\n`);
  process.stdout.write(`code region: ${result.restored.length} restored (${result.restored.join(', ') || 'none'}), ${result.replaced.length} replaced (${result.replaced.join(', ') || 'none'}), ${result.present.length} already present, ${result.unanchored.length} with no anchor${result.unanchored.length > 0 ? ` (${result.unanchored.join(', ')})` : ''}\n`);
  /*
    The step heads (the coordinator, 13 Nov): the heads each landed change file names, recorded from the refs into the
    committed record before the suite runs, so the suite's step-heads test reads this drop's heads; and the checks only
    the refs can make, each removal's line found in the Design file it names. Six of Design's steps were consumed by
    Code's commits before this existed (scripts/step-heads.mjs).
  */
  const { check: checkHeads, gitIn } = await import('./step-heads.mjs');
  const heads = checkHeads(gitIn);
  process.stdout.write(`${heads.lines.join('\n')}\n`);
  const checks = intake(spawned);
  const ok = result.unanchored.length === 0 && heads.ok && checks.ok;
  process.stdout.write(`${checks.lines.join('\n')}\n${ok ? 'INTAKE OK' : 'INTAKE NOT OK: do not commit this drop until what failed above is read'}\n`);
  process.exit(ok ? 0 : 1);
}

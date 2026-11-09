#!/usr/bin/env node
/**
 * **A step's captures, written where Adam can relay them to Design.**
 *
 *     node scripts/export-captures.mjs years-166              # into ~/Downloads
 *     node scripts/export-captures.mjs --out DIR years-166 arrow-167
 *
 * Written on the premise that captures are untracked and cannot ride a commit.
 * That premise was a collision between two guards, not a decision (found 8 Nov:
 * captures-unchanged counted the paths commit-checked intent-adds), and since
 * 8 Nov judgement captures are committed with the commit that reports them.
 * The export stays as Adam's copy to relay. The look of a
 * step is "provisional until captured" in Design's targets; three times
 * (step 159, 166, 167) the captures were the bottleneck because Adam had to
 * find PNGs by hand in `docs/captures/`. `commit-checked.sh` runs this after
 * a commit, for every folder the commit message names as
 * `docs/captures/<name>`, so a step's captures land in ~/Downloads with the
 * commit that reports them, under the same naming as the documents.
 *
 * From the working tree, not HEAD: `export-handoff.mjs --captures` reads a
 * folder as committed, and until 8 Nov no capture folder was. The folder is
 * copied whole, subfolders included, as it stands.
 */
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

/** The capture folders a commit message names, once each, in order of first mention. */
export function capturesNamed(message) {
  const names = [];
  for (const match of message.matchAll(/docs\/captures\/([A-Za-z0-9][A-Za-z0-9._-]*[A-Za-z0-9]|[A-Za-z0-9])/g)) {
    if (!names.includes(match[1])) names.push(match[1]);
  }
  return names;
}

/** Every file under a folder, counted through its subfolders. */
function countFiles(dir) {
  let n = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    n += entry.isDirectory() ? countFiles(path) : 1;
  }
  return n;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const args = process.argv.slice(2);
  const outAt = args.indexOf('--out');
  const outDir = outAt === -1 ? join(homedir(), 'Downloads') : args[outAt + 1];
  const names = outAt === -1 ? args : [...args.slice(0, outAt), ...args.slice(outAt + 2)];
  if (outDir === undefined || !existsSync(outDir)) {
    process.stderr.write(`export-captures: no such directory ${outDir ?? '(none given after --out)'}\n`);
    process.exit(2);
  }
  if (names.length === 0) {
    process.stderr.write('export-captures: no captures folder named\n');
    process.exit(2);
  }
  const missing = names.filter((name) => !existsSync(join('docs', 'captures', name)) || !statSync(join('docs', 'captures', name)).isDirectory());
  if (missing.length > 0) {
    process.stderr.write(`export-captures: NOT exported. The tree holds no captures folder ${missing.map((name) => `docs/captures/${name}`).join(', ')}.\n`);
    process.exit(1);
  }
  const sha = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim();
  /* The local date, as the document exports and drop-ref name theirs. */
  const d = new Date();
  const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  for (const name of names) {
    const source = join('docs', 'captures', name);
    const folder = join(outDir, `captures ${name} — export for Design, ${date} at ${sha}`);
    mkdirSync(folder, { recursive: true });
    cpSync(source, folder, { recursive: true });
    process.stdout.write(`${folder}\n${countFiles(source)} file(s) of ${source} at ${sha}, from the working tree\n`);
  }
}

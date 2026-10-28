#!/usr/bin/env node
/**
 * **The current handoff, written where Adam can relay it to Design.**
 *
 *     node scripts/export-handoff.mjs              # into ~/Downloads
 *     node scripts/export-handoff.mjs --out DIR
 *
 * One-directional, by the coordinator's rule of 28 Oct: Code exports the
 * handoff to Design on request, and Design never sends one back whole.
 * Handoff edits arrive as change files (DESIGN-RULES), because a whole
 * copy reverted Code's Done marks; the cost of that rule is that Design's
 * own copy only drifts, since nothing ever carries Code's step bodies to
 * it. It was 82 Done lines behind on 26 Oct, and on 28 Oct it lacked step
 * 133's body, so §T.6 placed the import against a layout Design had not
 * read. Reading is safe; writing is what caused the problem.
 *
 * The export is HEAD's handoff, not the tree's: an uncommitted edit is not
 * yet anything a ruling can stand on, and the note says when one exists.
 * It refuses when any code-region block is absent from HEAD, because a
 * handoff without Code's lines is the thing Design already has.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { readRegion } from './apply-code-region.mjs';

const HANDOFF = 'docs/design/HANDOFF-wall-and-pull.md';

/** The export's name: the date and the commit, so two exports never overwrite each other and a relay names its generation. */
export function fileName(date, sha) {
  return `HANDOFF-wall-and-pull — export for Design, ${date} at ${sha}.md`;
}

/**
 * The note, then the handoff verbatim; and the code-region blocks the
 * handoff does not carry, which the caller refuses on.
 */
export function exportText(handoff, blocks, { sha, date, treeDiffers }) {
  const lines = handoff.split('\n');
  const missing = blocks.filter((block) => !lines.includes(block.text)).map((block) => block.id);
  const note =
    `Export note, not part of the handoff: this is the repository's HANDOFF-wall-and-pull.md as committed at ${sha} on ${date}, with Code's step bodies and Done marks, which Design's own copy does not hold. ` +
    'It is read-only for Design: changes come back as change files anchored on this text, and this file never comes back whole (DESIGN-RULES: a whole copy reverts the other author).' +
    (treeDiffers ? ' The working tree holds uncommitted edits to the handoff that this export does not carry.' : '');
  return { text: `${note}\n\n${handoff}`, missing };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const outAt = process.argv.indexOf('--out');
  const outDir = outAt === -1 ? join(homedir(), 'Downloads') : process.argv[outAt + 1];
  if (outDir === undefined || !existsSync(outDir)) {
    process.stderr.write(`export-handoff: no such directory ${outDir ?? '(none given after --out)'}\n`);
    process.exit(1);
  }
  const git = (...args) => execFileSync('git', args, { encoding: 'utf8' });
  const sha = git('rev-parse', '--short', 'HEAD').trim();
  const committed = git('show', `HEAD:${HANDOFF}`);
  const treeDiffers = existsSync(HANDOFF) && readFileSync(HANDOFF, 'utf8') !== committed;
  const date = new Date().toISOString().slice(0, 10);
  const blocks = readRegion();
  const { text, missing } = exportText(committed, blocks, { sha, date, treeDiffers });
  if (missing.length > 0) {
    process.stderr.write(`export-handoff: NOT exported. HEAD's handoff lacks ${missing.length} code-region block(s): ${missing.join(', ')}. Run node scripts/apply-code-region.mjs and commit first.\n`);
    process.exit(1);
  }
  const path = join(outDir, fileName(date, sha));
  writeFileSync(path, text);
  process.stdout.write(`${path}\n${blocks.length} of ${blocks.length} code-region blocks carried, ${committed.split('\n').length} lines, at ${sha}${treeDiffers ? '; the working tree differs from HEAD and the export is HEAD' : ''}\n`);
}

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
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const HANDOFF = 'docs/design/HANDOFF-wall-and-pull.md';
const REGION = new URL('./handoff-code-region.json', import.meta.url);

export function readRegion() {
  return JSON.parse(readFileSync(REGION, 'utf8'));
}

/** `handoff` with every absent block inserted as a paragraph in front of the first line starting with its anchor. */
export function applyRegion(handoff, blocks) {
  let lines = handoff.split('\n');
  const [restored, present, unanchored] = [[], [], []];
  for (const block of blocks) {
    if (lines.includes(block.text)) { present.push(block.id); continue; }
    const at = lines.findIndex((line) => line.startsWith(block.before));
    if (at === -1) { unanchored.push(block.id); continue; }
    lines = [...lines.slice(0, at), block.text, '', ...lines.slice(at)];
    restored.push(block.id);
  }
  return { text: lines.join('\n'), restored, present, unanchored };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const result = applyRegion(readFileSync(HANDOFF, 'utf8'), readRegion());
  if (result.restored.length > 0) writeFileSync(HANDOFF, result.text);
  process.stdout.write(`code region: ${result.restored.length} restored (${result.restored.join(', ') || 'none'}), ${result.present.length} already present, ${result.unanchored.length} with no anchor${result.unanchored.length > 0 ? ` (${result.unanchored.join(', ')})` : ''}\n`);
  process.exit(result.unanchored.length > 0 ? 1 : 0);
}

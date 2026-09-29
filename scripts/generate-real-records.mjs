/**
 * **`src/app/records/[id]/real-records.ts`, rendered from the capture.**
 *
 *     node scripts/generate-real-records.mjs           # prints the file
 *     node scripts/generate-real-records.mjs --write   # rewrites it
 *
 * Held by test/repo/real-records-generated.test.ts, which fails when the
 * committed file is not what this renders from docs/captures/real-records.json.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const CAPTURE_PATH = 'docs/captures/real-records.json';
export const TARGET_PATH = 'src/app/records/[id]/real-records.ts';

export function renderRealRecords(rows) {
  const ids = rows.map((r) => `  '${r.id}',`).join('\n');
  return `/**
 * **Every real record id in the collection, as one list -- GENERATED.**
 *
 * Rendered from docs/captures/real-records.json by scripts/generate-real-records.mjs;
 * do not edit. The capture comes from the database (scripts/real-records-capture.mjs).
 * test/repo/real-records-generated.test.ts fails when this file and the capture disagree.
 *
 *     node scripts/generate-real-records.mjs --write
 *
 * The generator's properties -- §5.5's area floor, §20's clearance, the 6:1
 * size band -- are claims about the REAL sheet rather than about a sample, so
 * every test that checks one has to see the same seventeen. The hand-typed
 * list this replaces (29 Sep) shared 4 ids of 17 with the collection.
 */
export const REAL_RECORD_IDS = [
${ids}
] as const;
`;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const rows = JSON.parse(readFileSync(CAPTURE_PATH, 'utf8'));
  const out = renderRealRecords(rows);
  if (process.argv.includes('--write')) {
    writeFileSync(TARGET_PATH, out);
    process.stdout.write(`${TARGET_PATH}: ${rows.length} ids written\n`);
  } else {
    process.stdout.write(out);
  }
}

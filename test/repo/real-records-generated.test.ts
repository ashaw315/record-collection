import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { renderRealRecords } from '../../scripts/generate-real-records.mjs';

/**
 * **`real-records.ts` is generated from the capture, and this fails when it
 * is not.** The hand-typed list shared 4 ids of 17 with the collection for a
 * week under a header that said "every real record id" (29 Sep). A generated
 * file cannot drift from its source; a test that compares them says when it has.
 */
const JSON_PATH = 'docs/captures/real-records.json';
const TS_PATH = 'src/app/records/[id]/real-records.ts';

describe('the real record ids are generated from the capture', () => {
  it('has a capture with distinct ids to generate from', () => {
    const rows = JSON.parse(readFileSync(JSON_PATH, 'utf8')) as Array<{ id: string }>;
    expect(rows.length).toBeGreaterThan(0);
    expect(new Set(rows.map((r) => r.id)).size).toBe(rows.length);
  });

  it('matches what the generator renders from the capture', () => {
    const rows = JSON.parse(readFileSync(JSON_PATH, 'utf8'));
    expect(
      readFileSync(TS_PATH, 'utf8'),
      `${TS_PATH} is not generated from ${JSON_PATH} — run \`node scripts/generate-real-records.mjs --write\``,
    ).toBe(renderRealRecords(rows));
  });
});

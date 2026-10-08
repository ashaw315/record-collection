import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * **A capture runs only when it is asked for (8 Oct).**
 *
 * The capture project is part of a bare `npx playwright test`, which is
 * what a gate runs. Each capture keeps itself out of a gate by skipping
 * unless `CAPTURE=1`. That was a convention carried by every file and by
 * nothing else, so the first new file written without the line ran inside
 * a gate: `table-98.capture.ts` rewrote the committed captures mid-run and
 * put 200 records into the database other specs were reading.
 *
 * A convention held by repetition is a premise held by prose. This reads
 * every capture file and holds that each test in it skips before it does
 * anything.
 */
const DIR = join('e2e', 'capture');
const SKIP = "test.skip(process.env.CAPTURE !== '1'";

describe('every capture skips itself unless CAPTURE=1', () => {
  const files = readdirSync(DIR).filter((name) => name.endsWith('.capture.ts'));

  it('finds the capture files', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files)('%s: each test skips before it acts', (name) => {
    const source = readFileSync(join(DIR, name), 'utf8');
    /*
      Before anything is awaited: a skip after the first action has already
      loaded a page, seeded a fixture or written a file.
    */
    const starts = [...source.matchAll(/^\s*test\((?:'|"|`)/gm)].map((m) => m.index);
    expect(starts.length, `${name} declares at least one test`).toBeGreaterThan(0);
    for (const start of starts) {
      const body = source.slice(start);
      const firstAwait = body.search(/\bawait\s/);
      const beforeAction = firstAwait === -1 ? body : body.slice(0, firstAwait);
      expect(beforeAction.includes(SKIP), `${name}: a test that acts before it skips:\n${body.slice(0, 160)}`).toBe(true);
    }
  });
});

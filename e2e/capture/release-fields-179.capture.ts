import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { registerCleanup, trackArtist, trackCreated } from '../cleanup';
import { seedRelease } from '../seed';
import { login } from '../sign-in';
import { wholePage } from '../whole-page';
import { NO_SCROLL_HEIGHT } from '../../src/app/records/[id]/band-geometry';

/**
 * **§66, three fields from the release, captured (the step's Capture bullet; step 179):** at 1440 × 900 and 390, a
 * record with all three fields, one with no format text and no barcode, and one whose date is a month only. **Every
 * record here is seeded,** and the month-only case above all: no record in the collection has a month-only date (the
 * report-first figures, 11 Nov), so the file names say `seeded-` and no figure here describes the collection (the
 * coordinator, 12 Nov, on §55's lesson). Written to `docs/captures/release-fields-179/`. Run with CAPTURE=1
 * --project=capture.
 */
const OUT = join('docs', 'captures', 'release-fields-179');
registerCleanup();

const CASES = {
  'all-three': { formats: [{ name: 'Vinyl', qty: '1', descriptions: ['LP'], text: 'Gatefold' }], identifiers: [{ type: 'Barcode', value: '8 43563 19772 1', description: 'Printed' }], released: '1982-03-15' },
  'no-format-no-barcode': { released: '1982' },
  'month-only': { formats: [{ name: 'Vinyl', qty: '1', descriptions: ['LP'], text: 'Gatefold' }], identifiers: [{ type: 'Barcode', value: '5 012345 678900', description: 'Printed' }], released: '1982-03' },
} as const;

async function post(page: Page, path: string, data: unknown): Promise<{ id: string }> {
  const response = await page.request.post(path, { data });
  expect(response.status(), path).toBe(201);
  const body = (await response.json()) as { id: string };
  trackCreated(path, body);
  return body;
}

async function seedCase(page: Page, name: keyof typeof CASES, index: number): Promise<string> {
  const suffix = `cap179${Date.now().toString(36)}${index}`;
  /* Random, not the clock: the two windows' tests run in parallel workers and drew the same id in the same millisecond, so the second worker's pressing was found, not created (the first run, 12 Nov). */
  const release = 918_000_000 + Math.floor(Math.random() * 1_000_000);
  await seedRelease(release, { title: `Release ${suffix}`, tracklist: [{ position: 'A1', title: `Opening ${suffix}` }], ...CASES[name] });
  const artist = await post(page, '/api/artists', { name: `Fields-${suffix}` });
  trackArtist(artist.id);
  const pressing = await post(page, '/api/pressings', { catalogNumber: `RF-${suffix}`, countryPressed: 'UK', colorVariant: 'Black', vinylWeightGrams: 180, yearPressed: 1982, discogsReleaseId: release });
  const record = await post(page, '/api/records', { title: `${name.replace(/-/g, ' ')} ${suffix}`, artistId: artist.id, pressingId: pressing.id });
  return record.id;
}

for (const [width, height, pointer] of [[1440, NO_SCROLL_HEIGHT, 'fine'], [390, 844, 'coarse']] as const) {
  test.describe(`${width} × ${height}`, () => {
    test.use({ viewport: { width, height }, hasTouch: pointer === 'coarse' });
    test(`the three cases at ${width}`, async ({ page }) => {
      test.skip(process.env.CAPTURE !== '1', 'A capture tool: run with CAPTURE=1');
      test.setTimeout(180_000);
      mkdirSync(OUT, { recursive: true });
      await login(page);
      let index = 0;
      for (const name of Object.keys(CASES) as Array<keyof typeof CASES>) {
        const id = await seedCase(page, name, index++);
        await page.goto(`/records/${id}`);
        await page.getByRole('heading', { level: 1 }).first().waitFor({ timeout: 30_000 });
        await page.evaluate(() => document.fonts.ready);
        /* The whole page as a window, never `fullPage`: Chromium's full-page shot drops the touch emulation while it draws (e2e/whole-page.ts). */
        await wholePage(page, join(OUT, `seeded-${name}-${width}.png`));
      }
      if (width === 390) {
        writeFileSync(
          join(OUT, 'README.md'),
          `# release-fields-179 · three fields from the release (§66, step 179), captured ${new Date().toISOString().slice(0, 10)}

**Every record in these captures is seeded, and no figure here describes the collection.** The month-only case in
particular: no record in the collection carries a month-only date (the report-first figures, 11 Nov: 25 with a day, 27
a year only, 3 none), so it exists only here, with a cached release written for the capture. The file names say
\`seeded-\` for that reason (the coordinator, 12 Nov, on §55's lesson: a capture is a figure with a picture attached).

From the build (E2E_SERVER=build), full page, at 1440 × 900 with a fine pointer and 390 × 844 under a coarse pointer.

| case | what the release carries | files |
|---|---|---|
| all three | format text "Gatefold", barcode "8 43563 19772 1", released 1982-03-15 | seeded-all-three-{1440,390}.png |
| no format text, no barcode | released 1982 only: neither row, the year alone | seeded-no-format-no-barcode-{1440,390}.png |
| a month only | released 1982-03: "March 1982", no day invented | seeded-month-only-{1440,390}.png |

Format stands after Colour and Barcode last in Pressing detail; the date stands at the end of the PRESSING line in place
of the pressed year it dates. §66's "provisional until built and captured" returns on these.
`,
        );
      }
    });
  });
}

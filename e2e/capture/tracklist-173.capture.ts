import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { registerCleanup, trackArtist, trackSavedRecord } from '../cleanup';
import { seedRelease } from '../seed';
import { NO_SCROLL_HEIGHT } from '../../src/app/records/[id]/band-geometry';
import { login } from '../sign-in';

/**
 * **173c (§65): the TRACKLIST section captured at 1440 × 900 and 390, closed and opened, on the records the step names.**
 * "The record with the most credits, and the ones with the most release credits and the most track credits; the longest
 * and the shortest tracklist; a seeded record with no cached release." The five are found through the model by
 * `scripts/export-tracklist-records.mts` (read-only against production) and written to records.json with their release
 * payloads and the names the page shows (label, plant); this seeds each as a record of the run's own under its real title
 * and artist, so the page draws exactly what production would. Run with E2E_SERVER=build CAPTURE=1 --project=capture;
 * replaced only with CAPTURE_REPLACE=1. Specimens come from the build at the stated viewport.
 */
registerCleanup();
const OUT = join('docs', 'captures', 'tracklist-173');
type Exported = { why: string; artist: string; title: string; label: string | null; plant: string | null; catalog: string | null; releaseYear: number | null; releaseId: number; tracks: number; credits: number; count: number; payload: Record<string, unknown> };

const post = async (page: Page, path: string, data: unknown): Promise<string> => { const j = (await (await page.request.post(path, { data })).json()) as { id?: string; error?: { existingId?: string } }; return j.id ?? j.error?.existingId ?? ''; };
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

async function seedNamed(page: Page, r: Exported, suffix: string): Promise<string> {
  const releaseId = 900_000_000 + Math.floor(Math.random() * 90_000_000);
  await seedRelease(releaseId, r.payload);
  const artistId = await post(page, '/api/artists', { name: r.artist });
  trackArtist(artistId);
  const labelId = r.label === null ? null : await post(page, '/api/labels', { name: r.label });
  const pressingId = await post(page, '/api/pressings', { catalogNumber: r.catalog ?? `TL-${suffix}`, discogsReleaseId: releaseId, ...(r.plant === null ? {} : { pressingPlant: r.plant }) });
  const recordId = await post(page, '/api/records', { title: r.title, artistId, pressingId, ...(labelId === null ? {} : { labelId }), ...(r.releaseYear === null ? {} : { releaseYear: r.releaseYear }) });
  await trackSavedRecord(page, recordId);
  return recordId;
}

test('the TRACKLIST section on the step’s records, at 1440 × 900 and 390, closed and opened', async ({ browser }) => {
  test.skip(process.env.CAPTURE !== '1', 'A capture tool: run with CAPTURE=1');
  if (existsSync(join(OUT, 'README.md')) && process.env.CAPTURE_REPLACE !== '1') throw new Error(`${OUT} already holds the capture. It is not replaced unless CAPTURE_REPLACE=1.`);
  test.setTimeout(600_000);
  mkdirSync(OUT, { recursive: true });
  const exported = JSON.parse(readFileSync(join(OUT, 'records.json'), 'utf8')) as { exported: string; held: number; tracks: { min: number; max: number }; records: Exported[] };
  const lines: string[] = [];
  const suffix = Date.now().toString(36);
  for (const [width, height] of [[1440, NO_SCROLL_HEIGHT], [390, 844]] as const) {
    const context = await browser.newContext({ viewport: { width, height } });
    context.setDefaultTimeout(30_000);
    const page = await context.newPage();
    await login(page);
    for (const r of exported.records) {
      const id = await seedNamed(page, r, `${suffix}-${width}`);
      await page.goto(`/records/${id}`);
      const section = page.locator('[data-section="tracklist"]');
      await section.waitFor();
      await section.scrollIntoViewIfNeeded();
      await page.mouse.move(0, 0);
      const base = `${slug(r.why)}--${slug(r.title)}-${width}`;
      await section.screenshot({ path: join(OUT, `${base}-closed.png`) });
      const countLine = (await section.locator('details > summary').textContent())?.trim() ?? '(no count line)';
      await section.locator('details > summary').click();
      await expect(section.locator('details')).toHaveAttribute('open', /.*/);
      await page.mouse.move(0, 0);
      await section.screenshot({ path: join(OUT, `${base}-opened.png`) });
      const cols = await section.locator('[data-tracks]').evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(' ').filter(Boolean).length);
      lines.push(`| ${r.why} | ${r.artist} — ${r.title} | ${width} | ${r.tracks} | ${r.credits} | ${countLine} | ${cols} | ${base}-closed.png, ${base}-opened.png |`);
    }
    /* The sixth: a record with no cached release draws no section (§65, §38). */
    const artistId = await post(page, '/api/artists', { name: `Tracklist None ${suffix}-${width}` });
    trackArtist(artistId);
    const pressingId = await post(page, '/api/pressings', { catalogNumber: `TLN-${suffix}-${width}`, vinylWeightGrams: 180 });
    const none = await post(page, '/api/records', { title: `No Cached Release ${suffix}`, artistId, pressingId });
    await trackSavedRecord(page, none);
    await page.goto(`/records/${none}`);
    await page.locator('[data-section="pressing-detail"]').waitFor();
    await expect(page.locator('[data-section="tracklist"]')).toHaveCount(0);
    await page.screenshot({ path: join(OUT, `no-cached-release-${width}.png`), fullPage: true });
    lines.push(`| no cached release | (seeded) No Cached Release | ${width} | — | — | no section | — | no-cached-release-${width}.png |`);
    await context.close();
  }
  writeFileSync(join(OUT, 'README.md'), `# 173c · the TRACKLIST section (§65), captured ${new Date().toISOString().slice(0, 10)}

From the build (E2E_SERVER=build) at 1440 × 900 and 390 × 844, each record closed and opened. The five records are the
step's, found through the model by \`scripts/export-tracklist-records.mts\` against production on ${exported.exported.slice(0, 10)}
(${exported.held} records hold a release; ${exported.tracks.min} to ${exported.tracks.max} tracks), seeded here under their own titles,
labels and plants, so the page draws what production draws. The count line's wording ("Credits · n") and the two track
columns from 960 are Code's proposals, provisional until judged (§65 b1.s25).

| why | record | width | tracks | credits stored | count line | track columns | files |
|---|---|---|---|---|---|---|---|
${lines.join('\n')}

The per-record report of the count line, the companies drawn and suppressed, is \`tracklist-counts.txt\` beside this file
(\`npm run discogs:tracklist-counts\`, read-only against production).
`);
});

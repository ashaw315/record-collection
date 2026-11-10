import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { registerCleanup, trackArtist, trackSavedRecord } from '../cleanup';
import { seedRelease } from '../seed';
import { NO_SCROLL_HEIGHT } from '../../src/app/records/[id]/band-geometry';
import { SCREEN } from '../../src/app/screen-frame';
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
/*
  The records come from the 173c export; the shots go to a folder of the run's own. A committed capture is evidence for
  a decision and nothing rewrites it (test/repo/captures-unchanged), so the 173c folder stands as Design judged it and a
  later build names a new one: CAPTURE_INTO=tracklist-173d, the default, is the companies moved (§65 b2.s27).
*/
const RECORDS = join('docs', 'captures', 'tracklist-173', 'records.json');
const INTO = process.env.CAPTURE_INTO ?? 'tracklist-173d';
const OUT = join('docs', 'captures', INTO);
type Exported = { why: string; artist: string; title: string; label: string | null; plant: string | null; catalog: string | null; releaseYear: number | null; releaseId: number; tracks: number; credits: number; count: number; payload: Record<string, unknown> };

/*
  Two figures Design asked for on the 173c captures ("Companies with the release", 10 Nov), measured and not judged by eye:
  the longest opened line against §T.6's content measure, SCREEN.measure ("the content keeps its measure of 736"), and whether the
  open mark is §T.1's − at its ruled size, "1px ink strokes in a 12 square". The line is measured as its text's own box,
  not its list item's, which runs the row's width whatever the text does.
*/
const CONTENT_MEASURE = SCREEN.measure;
const longestLine = (details: Element): { width: number; text: string } => {
  let best = { width: 0, text: '' };
  for (const li of Array.from(details.querySelectorAll('li'))) {
    const range = document.createRange();
    range.selectNodeContents(li);
    const width = Math.round(range.getBoundingClientRect().width * 10) / 10;
    if (width > best.width) best = { width, text: (li.textContent ?? '').trim() };
  }
  return best;
};
const readMark = (summary: Element): { box: string; strokeWidth: string; down: string } => {
  const svg = summary.querySelector('svg');
  const down = summary.querySelector('[data-mark-line="down"]');
  const across = summary.querySelector('[data-mark-line="across"]');
  if (svg === null || down === null || across === null) return { box: 'no mark', strokeWidth: '', down: '' };
  const r = svg.getBoundingClientRect();
  return { box: `${r.width} × ${r.height}`, strokeWidth: `stroke ${getComputedStyle(across).strokeWidth}`, down: getComputedStyle(down).display };
};

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
  const exported = JSON.parse(readFileSync(RECORDS, 'utf8')) as { exported: string; held: number; tracks: { min: number; max: number }; records: Exported[] };
  const lines: string[] = [];
  const figures: string[] = [];
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
      const closedMark = await section.locator('details > summary').evaluate(readMark);
      await section.locator('details > summary').click();
      await expect(section.locator('details')).toHaveAttribute('open', /.*/);
      await page.mouse.move(0, 0);
      await section.screenshot({ path: join(OUT, `${base}-opened.png`) });
      const cols = await section.locator('[data-tracks]').evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(' ').filter(Boolean).length);
      const openMark = await section.locator('details > summary').evaluate(readMark);
      const longest = await section.locator('details').evaluate(longestLine);
      lines.push(`| ${r.why} | ${r.artist} — ${r.title} | ${width} | ${r.tracks} | ${r.credits} | ${countLine} | ${cols} | ${base}-closed.png, ${base}-opened.png |`);
      figures.push(`| ${r.artist} — ${r.title} | ${width} | ${longest.width} | ${longest.width > CONTENT_MEASURE ? 'over' : 'within'} | ${longest.text} | ${closedMark.box} ${closedMark.strokeWidth} down ${closedMark.down} | ${openMark.box} ${openMark.strokeWidth} down ${openMark.down} |`);
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
  writeFileSync(join(OUT, 'README.md'), `# ${INTO} · the TRACKLIST section (§65), captured ${new Date().toISOString().slice(0, 10)}

From the build (E2E_SERVER=build) at 1440 × 900 and 390 × 844, each record closed and opened. The five records are the
step's, found through the model by \`scripts/export-tracklist-records.mts\` against production on ${exported.exported.slice(0, 10)}
(\`${RECORDS}\`; the 173c folder beside this one stands as Design judged it, the companies after the last track's credits)
(${exported.held} records hold a release; ${exported.tracks.min} to ${exported.tracks.max} tracks), seeded here under their own titles,
labels and plants, so the page draws what production draws. The count line's wording ("Credits · n") and the two track
columns from 960 are Code's proposals, provisional until judged (§65 b1.s25).

| why | record | width | tracks | credits stored | count line | track columns | files |
|---|---|---|---|---|---|---|---|
${lines.join('\n')}

These shots are cropped to the section, so they cannot show that it stands in its own row directly after Pressing
detail's; \`e2e/tracklist-173.spec.ts\` asserts that from the built page at 1440, 960, 480 and 390. The companies stand
with the release's credits, after its last role and before the first track's heading (§65 b2.s27), asserted there on
Jewels Of Thought.

## Two figures, measured ("Companies with the release", 10 Nov)

The longest opened line is its text's own box, against §T.6's content measure of ${CONTENT_MEASURE}; the mark is the
summary's svg box and its across stroke, with the down stroke's display closed and opened (§T.1: "1px ink strokes in a
12 square"; − is the + with its down stroke hidden).

| record | width | longest opened line, px | against ${CONTENT_MEASURE} | the line | mark closed | mark opened |
|---|---|---|---|---|---|---|
${figures.join('\n')}

The per-record report of the count line, the companies drawn and suppressed, is \`tracklist-counts.txt\` in the 173c folder
(\`npm run discogs:tracklist-counts\`, read-only against production).
`);
});

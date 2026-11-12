import { expect, test, type Page } from '@playwright/test';
import { registerCleanup, trackArtist, trackCreated } from './cleanup';
import { seedRelease } from './seed';
import { login } from './sign-in';
import { NO_SCROLL_HEIGHT } from '../src/app/records/[id]/band-geometry';

/**
 * **§66, three fields from the release (Design, 11 Nov; Adam's ruling; step 179).** The format text and the barcode
 * are two rows of Pressing detail, Format after Colour and Barcode last, each drawn only where the record has one; the
 * full release date stands in place of the pressed year at the PRESSING line's end, as much as is known, never
 * inventing a day; search reaches the barcode by its digits through the record's current pressing. Each test seeds
 * its own cached release and a record on a pressing of it. Fails against the page before this step, which drew
 * neither row and the year alone, and against a search that did not reach the barcode.
 */
registerCleanup();
test.beforeEach(async ({ page }) => login(page));

const RELEASE_BASE = 917_000_000;

async function post(page: Page, path: string, data: unknown): Promise<{ id: string }> {
  const response = await page.request.post(path, { data });
  expect(response.status(), path).toBe(201);
  const body = (await response.json()) as { id: string };
  trackCreated(path, body);
  return body;
}

/** A record on a pressing of a seeded release, the release carrying what the case asks. */
async function seeded(page: Page, payload: Record<string, unknown>, yearPressed: number | null) {
  const suffix = `rf179${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
  /* Random, not the clock: the projects run in parallel workers, and the capture tool drew one id twice in one millisecond. */
  const release = RELEASE_BASE + Math.floor(Math.random() * 1_000_000);
  await seedRelease(release, { title: `Release ${suffix}`, tracklist: [{ position: 'A1', title: `Opening ${suffix}` }], ...payload });
  const artist = await post(page, '/api/artists', { name: `Fields-${suffix}` });
  trackArtist(artist.id);
  const pressing = await post(page, '/api/pressings', { catalogNumber: `RF-${suffix}`, countryPressed: 'UK', colorVariant: 'Black', discogsReleaseId: release, ...(yearPressed === null ? {} : { yearPressed }) });
  const record = await post(page, '/api/records', { title: `Fields Record ${suffix}`, artistId: artist.id, pressingId: pressing.id });
  return { recordId: record.id, suffix, barcodeDigits: '843563197721' };
}

const FULL = { formats: [{ name: 'Vinyl', qty: '1', descriptions: ['LP'], text: 'Gatefold' }], identifiers: [{ type: 'Barcode', value: '8 43563 19772 1', description: 'Printed' }], released: '1982-03-15' };

/** The Pressing detail section's row labels, in document order, and no other section's. */
const detailLabels = async (page: Page) => (await page.locator('[data-section="pressing-detail"] dt').allTextContents()).map((t) => t.trim());

test('a record with all three: Format after Colour and Barcode last in Pressing detail, the full date at the PRESSING line’s end', async ({ page }) => {
  const { recordId } = await seeded(page, FULL, 1982);
  await page.setViewportSize({ width: 1440, height: NO_SCROLL_HEIGHT });
  await page.goto(`/records/${recordId}`);
  await page.locator('[data-section="pressing-detail"]').waitFor({ timeout: 30_000 });
  const labels = await detailLabels(page);
  expect(labels, 'Format directly after Colour').toContain('Format');
  expect(labels.indexOf('Format')).toBe(labels.indexOf('Colour') + 1);
  expect(labels[labels.length - 1], 'Barcode last').toBe('Barcode');
  await expect(page.getByText('Gatefold', { exact: true })).toBeVisible();
  await expect(page.getByText('8 43563 19772 1', { exact: true })).toBeVisible();
  await expect(page.getByText(/UK, 15 March 1982/), 'the date in place of the pressed year').toBeVisible();
  expect(await page.getByText(/UK, 1982$/).count(), 'and not the year beside it').toBe(0);
});

test('a record with no format text and no barcode draws neither row, and a year-only release keeps the year', async ({ page }) => {
  const { recordId } = await seeded(page, { released: '1982' }, 1982);
  await page.setViewportSize({ width: 1440, height: NO_SCROLL_HEIGHT });
  await page.goto(`/records/${recordId}`);
  await page.locator('[data-section="pressing-detail"]').waitFor({ timeout: 30_000 });
  const labels = await detailLabels(page);
  expect(labels).not.toContain('Format');
  expect(labels).not.toContain('Barcode');
  await expect(page.getByText(/UK, 1982/)).toBeVisible();
});

test('a release dated to a month only says the month and never invents a day', async ({ page }) => {
  const { recordId } = await seeded(page, { released: '1982-03' }, 1982);
  await page.setViewportSize({ width: 1440, height: NO_SCROLL_HEIGHT });
  await page.goto(`/records/${recordId}`);
  await expect(page.getByText(/UK, March 1982/)).toBeVisible();
  expect(await page.getByText(/\d+ March 1982/).count(), 'no day').toBe(0);
});

test('search reaches the record by its barcode, typed with or without its spaces, through its current pressing', async ({ page }) => {
  const { recordId, suffix } = await seeded(page, FULL, 1982);
  for (const typed of ['843563197721', '8 43563-19772 1']) {
    const found = (await (await page.request.get(`/api/records?q=${encodeURIComponent(typed)}&pageSize=100`)).json()) as { data: Array<{ id: string }> };
    expect(found.data.map((row) => row.id), typed).toContain(recordId);
  }
  /* A part of the code reaches nothing: the whole barcode, by its digits, or no hit. */
  const part = (await (await page.request.get(`/api/records?q=19772&pageSize=100`)).json()) as { data: Array<{ id: string }> };
  expect(part.data.map((row) => row.id), `a part of the code, ${suffix}`).not.toContain(recordId);
});

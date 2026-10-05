import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import sharp from 'sharp';
import { registerCleanup, trackArtist } from './cleanup';
import { seedImage } from './seed';
import { COVER_CROP_BOUND } from '../src/app/records/[id]/cover-fit';
import { NO_SCROLL_HEIGHT } from '../src/app/records/[id]/band-geometry';

registerCleanup();

/**
 * Step 83, §33: "The cover is cropped to fill its square where the
 * photograph's shorter side is at least 95% of its longer, and fitted in the
 * square on paper beyond that."
 *
 * **Evidence is fixtures, read as pixels.** Every one of the seventeen real
 * covers is inside the bound, so a capture of the collection shows nothing.
 * Each fixture has a 20px dark frame on every edge. Cropping a near case to
 * its square removes about 24px from each end of its longer side, so a
 * cropped photograph has no frame on those two sides and a fitted one has
 * all four, with paper beyond the other two. The assertions read the cover's
 * own screenshot at its edges: the channel the claim is about, where a
 * computed `object-fit` would be a proxy one layer below it.
 *
 * **Each fixture is checked before it is relied on** (CLAUDE.md §2): its
 * file's dimensions and ratio against the manifest, so a regenerated or
 * replaced file cannot move across the bound and leave a test passing on
 * the wrong photograph.
 */

const PASSWORD = process.env.E2E_PASSWORD ?? 'test-password-for-e2e';
const FIXTURES = join('test', 'fixtures', 'covers');
type Fixture = { file: string; width: number; height: number; ratio: number; bound: number; expected: 'crop' | 'fit' };
const manifest = JSON.parse(readFileSync(join(FIXTURES, 'manifest.json'), 'utf8')) as Fixture[];

const FRAME = [43, 33, 24];
type Rgb = number[];
const near = (a: Rgb, b: Rgb, tol = 28) => a.every((v, i) => Math.abs(v - b[i]) <= tol);

async function login(page: Page) {
  await page.goto('/login');
  await page.locator('form[data-hydrated="true"]').waitFor({ timeout: 15_000 });
  await page.getByLabel('Password').pressSequentially(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL('/');
}

/** The precondition: the file on disk is the photograph the manifest describes. */
function checkedFixture(f: Fixture): Buffer {
  const bytes = readFileSync(join(FIXTURES, f.file));
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  expect({ width, height }, `${f.file}: the file's own dimensions`).toEqual({ width: f.width, height: f.height });
  const ratio = Math.min(width, height) / Math.max(width, height);
  expect(ratio, `${f.file}: its ratio`).toBeCloseTo(f.ratio, 4);
  expect(f.expected, `${f.file}: the side of ${COVER_CROP_BOUND} it sits on`).toBe(ratio >= COVER_CROP_BOUND ? 'crop' : 'fit');
  return bytes;
}

async function seedRecordWithCover(page: Page, bytes: Buffer, tag: string): Promise<string> {
  const s = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const a = await page.request.post('/api/artists', { data: { name: `Fit83-${tag}-${s}` } });
  const artistId = ((await a.json()) as { id: string }).id;
  trackArtist(artistId);
  const r = await page.request.post('/api/records', { data: { title: `Fit83 ${tag} ${s}`, artistId } });
  expect(r.status()).toBe(201);
  const id = ((await r.json()) as { id: string }).id;
  await seedImage({ recordId: id, imageType: 'cover', url: `data:image/png;base64,${bytes.toString('base64')}` });
  return id;
}

/** The cover's square as drawn: its box on the page, and its pixels. */
async function readCover(page: Page, id: string, width: number) {
  await page.setViewportSize({ width, height: NO_SCROLL_HEIGHT });
  await page.goto(`/records/${id}`);
  const cover = page.locator('[data-cell="sleeve"] img[data-cover]');
  /* The treatment is decided when the photograph has loaded; read nothing before then. */
  await page.locator('[data-cell="sleeve"] img[data-cover][data-cover-treatment]').waitFor({ timeout: 30_000 });
  await page.addStyleTag({ content: 'nextjs-portal{display:none!important}' });
  const box = await cover.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const cell = (el.closest('[data-cell="sleeve"]') as HTMLElement).getBoundingClientRect();
    return { left: r.left - cell.left, top: r.top - cell.top, width: r.width, height: r.height };
  });
  const paper = await page.evaluate(() => {
    const k = document.createElement('canvas'); k.width = 1; k.height = 1;
    const x = k.getContext('2d') as CanvasRenderingContext2D;
    x.fillStyle = getComputedStyle(document.body).backgroundColor; x.fillRect(0, 0, 1, 1);
    return Array.from(x.getImageData(0, 0, 1, 1).data.slice(0, 3));
  });
  const shot = await cover.screenshot();
  const { data, info } = await sharp(shot).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const at = (x: number, y: number): Rgb => {
    const px = Math.min(info.width - 1, Math.max(0, Math.round(x)));
    const py = Math.min(info.height - 1, Math.max(0, Math.round(y)));
    const i = (py * info.width + px) * 3;
    return [data[i], data[i + 1], data[i + 2]];
  };
  return { box, paper, at, size: info.width };
}

test.beforeEach(async ({ page }) => login(page));

for (const f of manifest) {
  for (const width of [390, 1440]) {
    /* Fails against the built cover, which crops every photograph: an outside fixture has no side frame and no paper; and against a rule comparing width with height, on the portrait pair. */
    test(`${f.file} at ${width}: ${f.expected === 'crop' ? 'cropped to fill, flush, its long sides’ frame gone' : 'fitted whole on paper, all four frame sides drawn, not flush'}`, async ({ page }) => {
      const bytes = checkedFixture(f);
      const id = await seedRecordWithCover(page, bytes, f.file.replace(/\W+/g, '').slice(5, 22));
      const c = await readCover(page, id, width);
      const S = c.size;
      expect(Math.abs(c.box.width - c.box.height), 'the cover’s box is the square').toBeLessThanOrEqual(1);
      expect(c.box.left, 'the square keeps its place: flush left in its cell').toBeCloseTo(0, 0);
      expect(c.box.top, 'and flush to its top').toBeCloseTo(0, 0);

      const landscape = f.width > f.height;
      /* Along the photograph's LONGER side are its two ends; across it are its two flanks. */
      const end = (first: boolean, depth: number): Rgb => (landscape ? c.at(first ? depth : S - 1 - depth, S / 2) : c.at(S / 2, first ? depth : S - 1 - depth));
      const flank = (first: boolean, depth: number): Rgb => (landscape ? c.at(S / 2, first ? depth : S - 1 - depth) : c.at(first ? depth : S - 1 - depth, S / 2));

      if (f.expected === 'crop') {
        /* Fills and is flush: the flanks' frame sits on the square's own edge; the ends' frame is cropped away, and no paper shows. */
        for (const first of [true, false]) {
          expect(near(flank(first, 3), FRAME), `the ${first ? 'first' : 'last'} flank's frame is on the square's edge: ${flank(first, 3)}`).toBe(true);
          expect(near(end(first, 3), FRAME), `the ${first ? 'first' : 'last'} end's frame is cropped away: ${end(first, 3)}`).toBe(false);
          expect(near(end(first, 3), c.paper, 10), `and no paper shows there: ${end(first, 3)}`).toBe(false);
        }
      } else {
        /* Fitted whole: paper beyond each flank, then the flank's frame; the ends' frame on the square's edge. */
        const band = (S - (S * Math.min(f.width, f.height)) / Math.max(f.width, f.height)) / 2;
        expect(band, 'there is a band to read').toBeGreaterThan(4);
        for (const first of [true, false]) {
          expect(near(flank(first, Math.min(3, band / 2)), c.paper, 10), `paper beyond the ${first ? 'first' : 'last'} flank, so the photograph is not flush: ${flank(first, Math.min(3, band / 2))} against paper ${c.paper}`).toBe(true);
          expect(near(flank(first, band + 4), FRAME), `the ${first ? 'first' : 'last'} flank's frame is drawn inside the band: ${flank(first, band + 4)}`).toBe(true);
          expect(near(end(first, 3), FRAME), `the ${first ? 'first' : 'last'} end's frame is drawn, so the photograph is whole: ${end(first, 3)}`).toBe(true);
        }
      }
    });
  }
}

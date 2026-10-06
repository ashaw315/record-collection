import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import sharp from 'sharp';
import { sql } from 'drizzle-orm';
import { getTestDb } from '../test/helpers/db';
import { registerCleanup, trackArtist } from './cleanup';
import { seedImage } from './seed';
import { WRITE_CAPTURES } from './write-captures';
import { GRID_FORK, NO_SCROLL_HEIGHT } from '../src/app/records/[id]/band-geometry';

registerCleanup();

/**
 * Step 85, §33: "The cover is not shown until its photograph has loaded and
 * its dimensions are read, and until then its square stays empty."
 *
 * **Two waits, because the built defect lives in only one of them.** A
 * photograph that has not arrived paints nothing in any build, so holding
 * the photograph alone passes against the cover as built at step 83. The
 * defect is the other wait: the photograph has arrived and is painted, and
 * nothing has yet read its shape, so it stands cropped. That state lasts
 * for as long as the page's scripts take, so the first test holds the
 * scripts and lets the photograph through, and reads the square's pixels.
 * The second holds the photograph and lets the scripts through, which is
 * the throttled network the step names.
 *
 * **"At no frame" is read two ways, and the second is a proxy.** The pixel
 * read covers the held state, which is every frame until release. For the
 * frames after release, a sampler set before the page's own scripts records,
 * each animation frame, whether the photograph is loaded, whether a
 * treatment is decided and whether the cover's computed visibility is
 * visible. That is the style and not the pixels: it is what is reachable
 * for a frame that cannot be stopped on.
 */

const PASSWORD = process.env.E2E_PASSWORD ?? 'test-password-for-e2e';
const FIXTURES = join('test', 'fixtures', 'covers');
type Fixture = { file: string; width: number; height: number; expected: 'crop' | 'fit' };
const manifest = JSON.parse(readFileSync(join(FIXTURES, 'manifest.json'), 'utf8')) as Fixture[];
const pick = (file: string): Fixture => {
  const f = manifest.find((m) => m.file === file);
  if (f === undefined) throw new Error(`no fixture ${file}`);
  return f;
};
/* The photograph far beyond the bound, which the step names, and one inside it: hidden while waiting whatever its shape. */
const FAR = pick('cover-far-1200x900.png');
const INSIDE = pick('cover-inside-1000x951.png');
const WIDTHS = [390, 1000, GRID_FORK];
const CAPTURES = join('docs', 'captures', 'cover-wait-85');

type Rgb = number[];
const near = (a: Rgb, b: Rgb, tol = 10) => a.every((v, i) => Math.abs(v - b[i]) <= tol);
type Frame = { loaded: boolean; treatment: string | null; visible: boolean };

async function login(page: Page) {
  await page.goto('/login');
  await page.locator('form[data-hydrated="true"]').waitFor({ timeout: 15_000 });
  await page.getByLabel('Password').pressSequentially(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL('/');
}

/** A record whose cover is a URL the test serves, so the photograph can be held; the server never sees the request. */
async function seedRecord(page: Page, f: Fixture, tag: string): Promise<{ id: string; url: string }> {
  const bytes = readFileSync(join(FIXTURES, f.file));
  expect({ width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) }, `${f.file}: the file's own dimensions`).toEqual({ width: f.width, height: f.height });
  const s = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const a = await page.request.post('/api/artists', { data: { name: `Wait85-${tag}-${s}` } });
  const artistId = ((await a.json()) as { id: string }).id;
  trackArtist(artistId);
  const r = await page.request.post('/api/records', { data: { title: `Wait85 ${tag} ${s}`, artistId } });
  expect(r.status()).toBe(201);
  const id = ((await r.json()) as { id: string }).id;
  /* A spine colour, so the record has a tint: without one the cell's ground above the fork is paper too, and "the tint at 1440" would not be staged. */
  await getTestDb().execute(sql`UPDATE records SET spine_colour = ${'#a25829'} WHERE id = ${id}::uuid`);
  const url = `/held-cover-85/${s}-${f.file}`;
  await seedImage({ recordId: id, imageType: 'cover', url });
  return { id, url };
}

/** A gate a route waits at until the test opens it. */
function gate() {
  let open: () => void = () => undefined;
  const opened = new Promise<void>((resolve) => { open = resolve; });
  return { open, opened };
}

async function sampleFrames(page: Page) {
  await page.addInitScript(() => {
    const frames: Array<{ loaded: boolean; treatment: string | null; visible: boolean }> = [];
    (window as unknown as { __coverFrames: typeof frames }).__coverFrames = frames;
    const tick = () => {
      const img = document.querySelector<HTMLImageElement>('[data-cell="sleeve"] img[data-cover]');
      if (img !== null) frames.push({ loaded: img.complete && img.naturalWidth > 0, treatment: img.getAttribute('data-cover-treatment'), visible: getComputedStyle(img).visibility === 'visible' });
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}
const frames = (page: Page) => page.evaluate(() => (window as unknown as { __coverFrames: Frame[] }).__coverFrames);

/** The square's pixels on a five by five grid, the ground it stands on, and paper. */
async function readSquare(page: Page) {
  const m = await page.locator('[data-cell="sleeve"] img[data-cover]').evaluate((el) => {
    const rgb = (colour: string) => {
      const k = document.createElement('canvas'); k.width = 1; k.height = 1;
      const x = k.getContext('2d') as CanvasRenderingContext2D;
      x.fillStyle = colour; x.fillRect(0, 0, 1, 1);
      return Array.from(x.getImageData(0, 0, 1, 1).data);
    };
    /* The cell's ground: the nearest ancestor that paints a colour. */
    let ground = rgb(getComputedStyle(document.body).backgroundColor);
    for (let up = el.parentElement; up !== null; up = up.parentElement) {
      const c = rgb(getComputedStyle(up).backgroundColor);
      if (c[3] > 0) { ground = c; break; }
    }
    const r = el.getBoundingClientRect();
    /* In the page's coordinates: at 390 the square is below the first window. */
    return { box: { x: r.left + window.scrollX, y: r.top + window.scrollY, width: r.width, height: r.height }, ground: ground.slice(0, 3), paper: rgb(getComputedStyle(document.body).backgroundColor).slice(0, 3) };
  });
  expect(m.box.width, 'the square has its size while it waits').toBeGreaterThan(100);
  expect(Math.abs(m.box.width - m.box.height), 'and is a square').toBeLessThanOrEqual(1);
  const shot = await page.screenshot({ clip: m.box, fullPage: true });
  const { data, info } = await sharp(shot).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const points: Rgb[] = [];
  for (let i = 0; i < 5; i += 1) for (let j = 0; j < 5; j += 1) {
    const px = Math.round(((i + 0.5) / 5) * (info.width - 1));
    const py = Math.round(((j + 0.5) / 5) * (info.height - 1));
    const at = (py * info.width + px) * 3;
    points.push([data[at], data[at + 1], data[at + 2]]);
  }
  return { ...m, points, centre: points[12] };
}

/** The step's stated grounds, as preconditions: paper at 390 and 1000, the tint above the fork. */
function expectGround(width: number, ground: Rgb, paper: Rgb) {
  if (width >= GRID_FORK) expect(near(ground, paper), `at ${width} the cell's ground is the tint and not paper: ${ground} against paper ${paper}`).toBe(false);
  else expect(near(ground, paper), `at ${width} the cell's ground is paper: ${ground} against ${paper}`).toBe(true);
}

test.beforeEach(async ({ page }) => login(page));

test.describe('§33: a photograph that has arrived is not shown until its shape is read', () => {
  for (const f of [FAR, INSIDE]) {
    for (const width of WIDTHS) {
      /* Fails against SleeveCover as built at step 83, whose image is visible from the server's markup: the square reads the photograph, cropped, for as long as the scripts take. */
      test(`${f.file} at ${width}: loaded with the page’s scripts held, the square reads as the cell’s ground at every point; released, it is ${f.expected === 'fit' ? 'fitted' : 'cropped'}, and in no sampled frame is its computed visibility visible without a treatment`, async ({ page }) => {
        const { id, url } = await seedRecord(page, f, f.expected);
        const scripts = gate();
        await page.route(`**${url}`, (route) => route.fulfill({ contentType: 'image/png', body: readFileSync(join(FIXTURES, f.file)) }));
        await page.route((u) => u.pathname.startsWith('/_next/') && u.pathname.endsWith('.js'), async (route) => { await scripts.opened; await route.continue(); });
        await sampleFrames(page);
        await page.setViewportSize({ width, height: NO_SCROLL_HEIGHT });
        await page.goto(`/records/${id}`, { waitUntil: 'commit' });
        await page.waitForFunction(() => {
          const img = document.querySelector<HTMLImageElement>('[data-cell="sleeve"] img[data-cover]');
          return img !== null && img.complete && img.naturalWidth > 0;
        }, undefined, { timeout: 30_000 });
        await page.waitForTimeout(300);
        /* The precondition: the photograph is in, and nothing has read it. Without this the test could pass on a page that had simply finished. */
        const before = await page.locator('[data-cell="sleeve"] img[data-cover]').evaluate((el) => ({ natural: (el as HTMLImageElement).naturalWidth, treatment: el.getAttribute('data-cover-treatment') }));
        expect(before, 'the photograph has loaded and its shape is not yet read').toEqual({ natural: f.width, treatment: null });

        const waiting = await readSquare(page);
        expectGround(width, waiting.ground, waiting.paper);
        for (const [i, p] of waiting.points.entries()) expect(near(p, waiting.ground), `point ${i} of the waiting square reads as the cell's ground ${waiting.ground}: ${p}`).toBe(true);

        scripts.open();
        await page.locator(`[data-cell="sleeve"] img[data-cover][data-cover-treatment="${f.expected}"]`).waitFor({ timeout: 30_000 });
        await page.waitForTimeout(200);
        const shown = await readSquare(page);
        expect(shown.points.some((p) => !near(p, shown.ground)), 'once decided, the photograph is drawn in the square').toBe(true);

        const seen = await frames(page);
        expect(seen.some((s) => s.loaded && s.treatment === null), 'the sampler saw the waiting state').toBe(true);
        expect(seen.filter((s) => s.visible && s.treatment === null).length, 'frames with the cover visible and no treatment decided').toBe(0);
        expect(seen.at(-1), 'and it ends shown, as decided').toEqual({ loaded: true, treatment: f.expected, visible: true });
      });
    }
  }
});

test.describe('§33: a photograph that has not arrived leaves its square empty', () => {
  for (const width of WIDTHS) {
    /*
      Holds the photograph and lets the scripts run: the throttled network.
      The pixel read here passes against the step 83 cover too, because an
      image with nothing loaded paints nothing in any build; it would fail
      against a wait that drew a placeholder or a colour of its own. The
      frame count is the line that fails against step 83: its cover is
      visible in every frame before the photograph arrives.
    */
    test(`${FAR.file} at ${width}: with the photograph held, the square reads as the cell’s ground; when it arrives it is fitted, and in no sampled frame is its computed visibility visible without a treatment`, async ({ page }) => {
      const { id, url } = await seedRecord(page, FAR, 'held');
      const photograph = gate();
      await page.route(`**${url}`, async (route) => { await photograph.opened; await route.fulfill({ contentType: 'image/png', body: readFileSync(join(FIXTURES, FAR.file)) }); });
      await sampleFrames(page);
      await page.setViewportSize({ width, height: NO_SCROLL_HEIGHT });
      await page.goto(`/records/${id}`, { waitUntil: 'commit' });
      /* The page's scripts have run: the title's ladder is chosen by client code after paint. */
      await page.locator('[data-title-step][data-ladder]').waitFor({ timeout: 30_000 });
      await page.addStyleTag({ content: 'nextjs-portal{display:none!important}' });
      await page.waitForTimeout(300);
      const before = await page.locator('[data-cell="sleeve"] img[data-cover]').evaluate((el) => ({ natural: (el as HTMLImageElement).naturalWidth, treatment: el.getAttribute('data-cover-treatment') }));
      expect(before, 'the photograph has not arrived').toEqual({ natural: 0, treatment: null });

      const waiting = await readSquare(page);
      expectGround(width, waiting.ground, waiting.paper);
      for (const [i, p] of waiting.points.entries()) expect(near(p, waiting.ground), `point ${i} of the waiting square reads as the cell's ground ${waiting.ground}: ${p}`).toBe(true);
      if (WRITE_CAPTURES) {
        mkdirSync(CAPTURES, { recursive: true });
        await page.screenshot({ fullPage: true, path: join(CAPTURES, `cover-wait-85-far-1200x900-${String(width).padStart(4, '0')}-waiting-square${Math.round(waiting.box.width)}.png`) });
      }

      photograph.open();
      await page.locator('[data-cell="sleeve"] img[data-cover][data-cover-treatment="fit"]').waitFor({ timeout: 30_000 });
      await page.waitForTimeout(200);
      if (WRITE_CAPTURES) await page.screenshot({ fullPage: true, path: join(CAPTURES, `cover-wait-85-far-1200x900-${String(width).padStart(4, '0')}-arrived-fitted.png`) });
      const seen = await frames(page);
      expect(seen.some((s) => !s.loaded), 'the sampler saw the square before the photograph').toBe(true);
      expect(seen.filter((s) => s.visible && s.treatment === null).length, 'frames with the cover visible and no treatment decided').toBe(0);
      expect(seen.at(-1), 'and it ends shown, fitted').toEqual({ loaded: true, treatment: 'fit', visible: true });
    });
  }
});

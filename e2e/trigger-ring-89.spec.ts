import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import sharp from 'sharp';
import { registerCleanup, trackArtist } from './cleanup';
import { seedImage } from './seed';
import { WRITE_CAPTURES } from './write-captures';
import { GRID_FORK, NO_SCROLL_HEIGHT } from '../src/app/records/[id]/band-geometry';

registerCleanup();

/**
 * Step 89, §M.6: "On the cover, the focus ring is drawn inside the square:
 * 2px of paper at its edge, and 2px of ink inside that. A ring of ink alone
 * inside the square would vanish on a dark photograph... and paper alone on
 * a light one, so the ring is both, and one of its two bands shows on any
 * photograph. It shows on keyboard focus only."
 *
 * Withdrawn by it: the ring outside the box, which the cell's clip hid.
 * Read as pixels, focused against unfocused: along each side, 1px in is
 * paper and 3px in is ink, and 7px in is the photograph as it was.
 *
 * Three covers, made here so their edges are known exactly: one light, one
 * dark, and one whose edge is light in places and dark in others, where
 * each band vanishes along part of its run and the other must carry it.
 */

const PASSWORD = process.env.E2E_PASSWORD ?? 'test-password-for-e2e';
const LIGHT = [240, 236, 226];
const DARK = [18, 16, 14];
type Rgb = number[];
const near = (a: Rgb, b: Rgb, tol = 14) => a.every((v, i) => Math.abs(v - b[i]) <= tol);
const CAPTURES = join('docs', 'captures', 'trigger-ring-89');

async function cover(kind: 'light' | 'dark' | 'mixed'): Promise<string> {
  const size = 600;
  const px = Buffer.alloc(size * size * 3);
  for (let y = 0; y < size; y += 1) for (let x = 0; x < size; x += 1) {
    /* Mixed: 100px blocks, alternately light and dark, so every side of the square runs through both. */
    const c = kind === 'light' ? LIGHT : kind === 'dark' ? DARK : (Math.floor(x / 100) + Math.floor(y / 100)) % 2 === 0 ? LIGHT : DARK;
    px.set(c, (y * size + x) * 3);
  }
  return `data:image/png;base64,${(await sharp(px, { raw: { width: size, height: size, channels: 3 } }).png().toBuffer()).toString('base64')}`;
}

async function login(page: Page) {
  await page.goto('/login');
  await page.locator('form[data-hydrated="true"]').waitFor({ timeout: 15_000 });
  await page.getByLabel('Password').pressSequentially(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL('/');
}

async function seed(page: Page, url: string): Promise<string> {
  const s = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const a = await page.request.post('/api/artists', { data: { name: `Ring89-${s}` } });
  const artistId = ((await a.json()) as { id: string }).id;
  trackArtist(artistId);
  const r = await page.request.post('/api/records', { data: { title: `Ring89 ${s}`, artistId } });
  expect(r.status()).toBe(201);
  const id = ((await r.json()) as { id: string }).id;
  await seedImage({ recordId: id, imageType: 'cover', url });
  return id;
}

/** The cover's square as pixels, in the square's own coordinates. */
async function readSquare(page: Page) {
  const b = await page.locator('[data-cover-trigger]').evaluate((el) => { const r = el.getBoundingClientRect(); return { x: r.left + scrollX, y: r.top + scrollY, w: r.width, h: r.height }; });
  const { data, info } = await sharp(await page.screenshot({ fullPage: true, clip: { x: b.x, y: b.y, width: b.w, height: b.h } })).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const k = info.width / b.w;
  const at = (x: number, y: number): Rgb => { const i = (Math.min(info.height - 1, Math.round(y * k)) * info.width + Math.min(info.width - 1, Math.round(x * k))) * 3; return [data[i], data[i + 1], data[i + 2]]; };
  return { side: b.w, at };
}

test.beforeEach(async ({ page }) => login(page));

for (const kind of ['light', 'dark', 'mixed'] as const) {
  for (const width of [390, GRID_FORK]) {
    /* Fails against the ring as built at step 81, outside the box and clipped by the cell: focused and unfocused read the same on every side. */
    test(`${kind} cover at ${width}: keyboard focus draws 2px of paper at the edge and 2px of ink inside it on all four sides, and nothing without it`, async ({ page }) => {
      const id = await seed(page, await cover(kind));
      await page.setViewportSize({ width, height: NO_SCROLL_HEIGHT });
      await page.goto(`/records/${id}`);
      await page.locator('[data-cell="sleeve"] img[data-cover][data-cover-treatment]').waitFor({ timeout: 30_000 });
      await page.addStyleTag({ content: 'nextjs-portal{display:none!important}' });
      await page.locator('[data-cover-trigger]').scrollIntoViewIfNeeded();
      await page.mouse.move(1, 1);
      const colours = await page.evaluate(() => { const rgb = (c: string) => { const k = document.createElement('canvas'); k.width = 1; k.height = 1; const x = k.getContext('2d') as CanvasRenderingContext2D; x.fillStyle = c; x.fillRect(0, 0, 1, 1); return Array.from(x.getImageData(0, 0, 1, 1).data.slice(0, 3)); }; return { paper: rgb(getComputedStyle(document.body).backgroundColor), ink: rgb(getComputedStyle(document.body).color) }; });

      const rest = await readSquare(page);
      const S = rest.side;
      /* Along each side, at three places; `depth` is how far in from that side. Away from the corners and from the mixed cover's block edges. */
      const runs = [0.25, 0.45, 0.75];
      const point = (side: 'top' | 'bottom' | 'left' | 'right', run: number, depth: number): [number, number] =>
        side === 'top' ? [S * run, depth] : side === 'bottom' ? [S * run, S - 1 - depth] : side === 'left' ? [depth, S * run] : [S - 1 - depth, S * run];
      const sides = ['top', 'bottom', 'left', 'right'] as const;
      for (const side of sides) for (const run of runs) {
        expect(near(rest.at(...point(side, run, 1)), colours.paper) && near(rest.at(...point(side, run, 3)), colours.ink), `unfocused, no ring on the ${side} at ${run}`).toBe(false);
      }

      await page.locator('[data-cover-trigger]').focus();
      await page.keyboard.press('Shift+Tab');
      await page.keyboard.press('Tab');
      expect(await page.locator('[data-cover-trigger]').evaluate((el) => el === document.activeElement && el.matches(':focus-visible')), 'the keyboard is on the cover').toBe(true);
      const focused = await readSquare(page);
      for (const side of sides) for (const run of runs) {
        const photo = rest.at(...point(side, run, 7));
        expect(near(focused.at(...point(side, run, 1)), colours.paper), `the ${side} at ${run}: 1px in is paper, ${focused.at(...point(side, run, 1))}`).toBe(true);
        expect(near(focused.at(...point(side, run, 3)), colours.ink), `the ${side} at ${run}: 3px in is ink, ${focused.at(...point(side, run, 3))}`).toBe(true);
        expect(near(focused.at(...point(side, run, 7)), photo, 4), `the ${side} at ${run}: 7px in is the photograph as it was`).toBe(true);
        /* Whatever the photograph is there, one band reads against it. */
        expect(!near(photo, colours.paper, 40) || !near(photo, colours.ink, 40), `one band stands against the photograph on the ${side} at ${run}: photograph ${photo}`).toBe(true);
      }
      if (kind === 'dark') expect(near(rest.at(S / 2, 7), colours.ink, 40), 'the precondition: on the dark cover the ink band is lost, so the paper band is the ring').toBe(true);
      if (kind === 'light') expect(near(rest.at(S / 2, 7), colours.paper, 40), 'the precondition: on the light cover the paper band is lost, so the ink band is the ring').toBe(true);

      if (WRITE_CAPTURES) {
        mkdirSync(CAPTURES, { recursive: true });
        await page.locator('[data-cell="sleeve"]').screenshot({ path: join(CAPTURES, `ring-${kind}-${String(width).padStart(4, '0')}-focused-paper2-ink2.png`) });
      }

      /* Keyboard focus only: a press by pointer focuses the cover and draws no ring; it opens the sleeve, which is closed again to read the square. */
      await page.keyboard.press('Tab');
      await page.locator('[data-cover-trigger]').click();
      await page.locator('[data-sleeve-modal]').waitFor();
      await page.locator('[data-sleeve-close]').click();
      await expect(page.locator('[data-sleeve-modal]')).toHaveCount(0);
      await page.mouse.move(1, 1);
      await page.waitForTimeout(100);
      const pressed = await readSquare(page);
      /* Asserted, not assumed: the cover holds focus, and the browser does not count it as the keyboard's. Without this the reads below could be skipped and say nothing. */
      expect(await page.locator('[data-cover-trigger]').evaluate((el) => ({ focused: el === document.activeElement, keyboard: el.matches(':focus-visible') })), 'focus is back on the cover, by the pointer').toEqual({ focused: true, keyboard: false });
      for (const side of sides) expect(near(pressed.at(...point(side, 0.45, 1)), colours.paper) && near(pressed.at(...point(side, 0.45, 3)), colours.ink), `focused by a press, no ring on the ${side}`).toBe(false);
    });
  }
}

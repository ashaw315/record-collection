import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import sharp from 'sharp';
import { sql } from 'drizzle-orm';
import { getTestDb } from '../test/helpers/db';
import { registerCleanup, trackArtist } from './cleanup';
import { seedImage } from './seed';
import { GRID_FORK, NO_SCROLL_HEIGHT } from '../src/app/records/[id]/band-geometry';

registerCleanup();

/**
 * Step 87, §33: "A photograph that fails to load is treated as no
 * photograph, and the cell shows what it shows for a record with none."
 * The step: "On the cover image's error event, turn the square into §6's
 * and §5.3's no-cover frame, filled with paper, with the bar and the black
 * block still drawn, and leave every other colour on the page as the
 * record's; no timeout and no retry."
 *
 * The record has a colour, which is the case §6 and §5.3 never met: a
 * record with no photograph has none, so their frame never stood on a
 * tint. Above the fork this record's cell is its tint, so "reads as paper
 * at its centre" can fail there and is not true by default.
 */

const PASSWORD = process.env.E2E_PASSWORD ?? 'test-password-for-e2e';
const COVER = join('test', 'fixtures', 'covers', 'cover-inside-1000x951.png');
const WIDTHS = [390, GRID_FORK];
type Rgb = number[];
const near = (a: Rgb, b: Rgb, tol = 8) => a.every((v, i) => Math.abs(v - b[i]) <= tol);

async function login(page: Page) {
  await page.goto('/login');
  await page.locator('form[data-hydrated="true"]').waitFor({ timeout: 15_000 });
  await page.getByLabel('Password').pressSequentially(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL('/');
}

/** A record with a colour, and a cover at a URL the test serves, fails or holds. `cover: false` is a record with no photograph and no colour. */
async function seedRecord(page: Page, cover: boolean): Promise<{ id: string; url: string }> {
  const s = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const a = await page.request.post('/api/artists', { data: { name: `Fail87-${s}` } });
  const artistId = ((await a.json()) as { id: string }).id;
  trackArtist(artistId);
  const r = await page.request.post('/api/records', { data: { title: `Fail87 ${s}`, artistId } });
  expect(r.status()).toBe(201);
  const id = ((await r.json()) as { id: string }).id;
  const url = `/held-cover-87/${s}.png`;
  if (cover) {
    await getTestDb().execute(sql`UPDATE records SET spine_colour = ${'#a25829'} WHERE id = ${id}::uuid`);
    await seedImage({ recordId: id, imageType: 'cover', url });
  }
  return { id, url };
}

function gate() {
  let open: () => void = () => undefined;
  const opened = new Promise<void>((resolve) => { open = resolve; });
  return { open, opened };
}

const FRAME = '[data-cell="sleeve"] [data-mark="coverFrame"]';
const FAILED = `${FRAME}[data-cover-failed]`;

const colours = (page: Page) => page.evaluate(() => {
  const rgb = (colour: string) => { const k = document.createElement('canvas'); k.width = 1; k.height = 1; const x = k.getContext('2d') as CanvasRenderingContext2D; x.fillStyle = colour; x.fillRect(0, 0, 1, 1); return Array.from(x.getImageData(0, 0, 1, 1).data); };
  const cell = document.querySelector('[data-cell="sleeve"]') as HTMLElement;
  return { paper: rgb(getComputedStyle(document.body).backgroundColor).slice(0, 3), ink: rgb(getComputedStyle(document.body).color).slice(0, 3), cell: rgb(getComputedStyle(cell).backgroundColor) };
});

/** The whole page as pixels, and the square's box in the page's coordinates. */
async function shoot(page: Page, square: string) {
  const box = await page.locator(square).evaluate((el) => { const r = el.getBoundingClientRect(); return { x: r.left + scrollX, y: r.top + scrollY, w: r.width, h: r.height }; });
  const { data, info } = await sharp(await page.screenshot({ fullPage: true })).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  return { box, data, info };
}

test.beforeEach(async ({ page }) => login(page));

for (const width of WIDTHS) {
  /* Fails against the cover as built at step 85, which waits for good on a photograph that will not arrive: no failed frame is ever drawn. */
  test(`at ${width} a cover whose request fails becomes the frame, filled with paper, with the bar and block drawn and every pixel outside the square as it was`, async ({ page }) => {
    const { id, url } = await seedRecord(page, true);
    const fail = gate();
    await page.route(`**${url}`, async (route) => { await fail.opened; await route.abort('failed'); });
    await page.setViewportSize({ width, height: NO_SCROLL_HEIGHT });
    await page.goto(`/records/${id}`, { waitUntil: 'commit' });
    await page.locator('[data-title-step][data-ladder]').waitFor({ timeout: 30_000 });
    await page.addStyleTag({ content: 'nextjs-portal{display:none!important}' });
    await page.waitForTimeout(400);
    const c = await colours(page);
    if (width >= GRID_FORK) expect(near(c.cell.slice(0, 3), c.paper) && c.cell[3] === 255, 'the precondition above the fork: the cell is the record’s tint, not paper').toBe(false);

    /* Waiting: the photograph has not arrived and has not failed. */
    await expect(page.locator(FAILED)).toHaveCount(0);
    const waiting = await shoot(page, '[data-cell="sleeve"] img[data-cover]');

    fail.open();
    await page.locator(FAILED).waitFor({ timeout: 15_000 });
    await page.waitForTimeout(300);
    await expect(page.locator('[data-cell="sleeve"] img[data-cover]'), 'the square leaves the waiting state').toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Open the sleeve' }), 'and is not a way in to a sleeve with no photograph').toHaveCount(0);

    const failed = await shoot(page, FAILED);
    expect([failed.box.x, failed.box.y, failed.box.w, failed.box.h].map(Math.round), 'the frame is the cover’s own square').toEqual([waiting.box.x, waiting.box.y, waiting.box.w, waiting.box.h].map(Math.round));
    const k = failed.info.width / width;
    const at = (shot: typeof failed, x: number, y: number): Rgb => { const i = (Math.round(y * k) * shot.info.width + Math.round(x * k)) * 3; return [shot.data[i], shot.data[i + 1], shot.data[i + 2]]; };
    const { x, y, w, h } = failed.box;
    for (const [fx, fy] of [[0.5, 0.5], [0.1, 0.1], [0.9, 0.1], [0.1, 0.9], [0.9, 0.9]]) expect(near(at(failed, x + w * fx, y + h * fy), c.paper), `the frame reads as paper at ${fx}, ${fy} of the square: ${at(failed, x + w * fx, y + h * fy)} against ${c.paper}`).toBe(true);
    const edge = await page.locator(FAILED).evaluate((el) => { const cs = getComputedStyle(el); return [cs.borderTopWidth, cs.borderRightWidth, cs.borderBottomWidth, cs.borderLeftWidth, cs.borderTopStyle]; });
    expect(edge, 'inside a hairline').toEqual(['1px', '1px', '1px', '1px', 'solid']);

    /* The bar and the black block stay drawn, in the record's colour and in ink. */
    const marks = await page.evaluate(() => {
      const rgb = (colour: string) => { const k2 = document.createElement('canvas'); k2.width = 1; k2.height = 1; const x2 = k2.getContext('2d') as CanvasRenderingContext2D; x2.fillStyle = colour; x2.fillRect(0, 0, 1, 1); return Array.from(x2.getImageData(0, 0, 1, 1).data.slice(0, 3)); };
      const m = (name: string) => { const el = document.querySelector(`[data-cell="sleeve"] [data-mark="${name}"]`) as HTMLElement; const r = el.getBoundingClientRect(); return { drawn: r.width > 0 && r.height > 0, colour: rgb(getComputedStyle(el).backgroundColor) }; };
      return { bar: m('sleeveBar'), block: m('sleeveBlock') };
    });
    expect(marks.bar.drawn && marks.block.drawn, 'the bar and the block are drawn').toBe(true);
    expect(near(marks.bar.colour, c.ink), 'the bar keeps the record’s colour: it does not fall back to ink').toBe(false);
    expect(near(marks.block.colour, c.ink, 12), 'the block is ink').toBe(true);

    /* Every other colour on the page is as it was: outside the square, no pixel differs between waiting and failed. */
    expect([failed.info.width, failed.info.height]).toEqual([waiting.info.width, waiting.info.height]);
    let outside = 0; let differ = 0;
    const [x0, y0, x1, y1] = [Math.floor(x * k) - 1, Math.floor(y * k) - 1, Math.ceil((x + w) * k) + 1, Math.ceil((y + h) * k) + 1];
    for (let py = 0; py < failed.info.height; py += 1) for (let px = 0; px < failed.info.width; px += 1) {
      if (px >= x0 && px <= x1 && py >= y0 && py <= y1) continue;
      outside += 1;
      const i = (py * failed.info.width + px) * 3;
      if (failed.data[i] !== waiting.data[i] || failed.data[i + 1] !== waiting.data[i + 1] || failed.data[i + 2] !== waiting.data[i + 2]) differ += 1;
    }
    expect(outside, 'pixels compared outside the square').toBeGreaterThan(100_000);
    expect(differ, 'pixels outside the square that changed when the photograph failed').toBe(0);
  });
}

/* Fails against a frame shown on a timer, or whenever the photograph has not yet loaded. */
test('a slow cover that does arrive never shows the frame', async ({ page }) => {
  const { id, url } = await seedRecord(page, true);
  const arrive = gate();
  await page.route(`**${url}`, async (route) => { await arrive.opened; await route.fulfill({ contentType: 'image/png', body: readFileSync(COVER) }); });
  await page.addInitScript(() => {
    const seen: boolean[] = [];
    (window as unknown as { __failedFrames: boolean[] }).__failedFrames = seen;
    const tick = () => { seen.push(document.querySelector('[data-cover-failed]') !== null); requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  });
  await page.setViewportSize({ width: GRID_FORK, height: NO_SCROLL_HEIGHT });
  await page.goto(`/records/${id}`, { waitUntil: 'commit' });
  await page.locator('[data-title-step][data-ladder]').waitFor({ timeout: 30_000 });
  /* Slow: held for three seconds after the page is up, with no timeout to trip. */
  await page.waitForTimeout(3000);
  arrive.open();
  await page.locator('[data-cell="sleeve"] img[data-cover][data-cover-treatment]').waitFor({ timeout: 15_000 });
  const seen = await page.evaluate(() => (window as unknown as { __failedFrames: boolean[] }).__failedFrames);
  expect(seen.length, 'frames sampled').toBeGreaterThan(60);
  expect(seen.filter(Boolean).length, 'frames in which the failed frame was drawn').toBe(0);
  await expect(page.getByRole('button', { name: 'Open the sleeve' })).toHaveCount(1);
});

/* Fails against a cover that hears the failure only through its handler: this photograph has failed before the page's scripts run, so no error event is left to hear. */
test('a cover that failed before the page’s scripts ran is the frame once they have', async ({ page }) => {
  const { id, url } = await seedRecord(page, true);
  const scripts = gate();
  await page.route(`**${url}`, (route) => route.abort('failed'));
  await page.route((u) => u.pathname.startsWith('/_next/') && u.pathname.endsWith('.js'), async (route) => { await scripts.opened; await route.continue(); });
  await page.setViewportSize({ width: GRID_FORK, height: NO_SCROLL_HEIGHT });
  await page.goto(`/records/${id}`, { waitUntil: 'commit' });
  await page.waitForFunction(() => { const img = document.querySelector<HTMLImageElement>('[data-cell="sleeve"] img[data-cover]'); return img !== null && img.complete && img.naturalWidth === 0; }, undefined, { timeout: 30_000 });
  await expect(page.locator(FAILED), 'the precondition: failed, and nothing has run to say so').toHaveCount(0);
  scripts.open();
  await page.locator(FAILED).waitFor({ timeout: 30_000 });
});

/* Fails against a change that fills every frame: §6's frame on a record with no photograph is as it was, with no fill of its own. */
test('a record with no photograph at all is unchanged: its frame is not the failed one and has no fill', async ({ page }) => {
  const { id } = await seedRecord(page, false);
  await page.setViewportSize({ width: GRID_FORK, height: NO_SCROLL_HEIGHT });
  await page.goto(`/records/${id}`);
  await page.locator(FRAME).waitFor({ timeout: 30_000 });
  await expect(page.locator(FAILED)).toHaveCount(0);
  const alpha = await page.locator(FRAME).evaluate((el) => { const k = document.createElement('canvas'); k.width = 1; k.height = 1; const x = k.getContext('2d') as CanvasRenderingContext2D; x.fillStyle = getComputedStyle(el).backgroundColor; x.fillRect(0, 0, 1, 1); return x.getImageData(0, 0, 1, 1).data[3]; });
  expect(alpha, 'no fill').toBe(0);
});

/*
  Ruled on 6 Oct, replacing a test that stood here for a few hours: "The
  trigger binds to the loaded photograph, not the square. A waiting square
  is not a trigger, for the same reason the no-cover frame isn't: there is
  no displayed cover to press." The trigger had been the square's button,
  live from the server's markup, so the sleeve could be opened on a
  photograph that had not arrived, and a failure then had to close it. That
  case no longer exists, and its behaviour and test went with it.

  Fails against the cover as built at step 81, whose button is named and
  pressable while the photograph waits.
*/
test('a waiting square is not a trigger: nothing is named Open the sleeve and a press opens nothing, until the photograph has loaded', async ({ page }) => {
  const { id, url } = await seedRecord(page, true);
  const arrive = gate();
  await page.route(`**${url}`, async (route) => { await arrive.opened; await route.fulfill({ contentType: 'image/png', body: readFileSync(COVER) }); });
  await page.setViewportSize({ width: GRID_FORK, height: NO_SCROLL_HEIGHT });
  await page.goto(`/records/${id}`, { waitUntil: 'commit' });
  await page.locator('[data-title-step][data-ladder]').waitFor({ timeout: 30_000 });
  await page.waitForTimeout(300);
  const square = page.locator('[data-cell="sleeve"] img[data-cover]');
  expect(await square.evaluate((img) => (img as HTMLImageElement).naturalWidth), 'the precondition: the photograph has not arrived').toBe(0);
  await expect(page.getByRole('button', { name: 'Open the sleeve' })).toHaveCount(0);
  const box = await square.boundingBox();
  if (box === null) throw new Error('the square has no box');
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForTimeout(300);
  await expect(page.locator('[data-sleeve-modal]'), 'a press on the waiting square opens nothing').toHaveCount(0);
  expect(await page.evaluate(() => (history.state as { sleeve?: boolean } | null)?.sleeve === true), 'and adds no history entry').toBe(false);
  /* Nor by the keyboard: Tab from the top of the page never lands in the sleeve's cell. */
  for (let i = 0; i < 40; i += 1) {
    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => document.activeElement?.closest('[data-cell="sleeve"]') !== null && document.activeElement?.closest('[data-cell="sleeve"]') !== undefined), `Tab ${i + 1} is not in the sleeve's cell`).toBe(false);
  }

  arrive.open();
  await page.locator('[data-cell="sleeve"] img[data-cover][data-cover-treatment]').waitFor({ timeout: 15_000 });
  await expect(page.getByRole('button', { name: 'Open the sleeve' }), 'loaded, the cover is the trigger').toHaveCount(1);
  await page.getByRole('button', { name: 'Open the sleeve' }).click();
  await page.locator('[data-sleeve-modal]').waitFor();
});

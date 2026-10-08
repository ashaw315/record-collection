import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { registerCleanup, trackArtist } from './cleanup';
import { seedImage } from './seed';
import { WRITE_CAPTURES } from './write-captures';
import { GRID_FORK, NO_SCROLL_HEIGHT } from '../src/app/records/[id]/band-geometry';
import { MODAL_CONTROL, MODAL_INSET, MODAL_LABEL_GAP, MODAL_LABEL_LINE, MODAL_ROW, SETTLE_MS, sleeveSquare } from '../src/app/records/[id]/sleeve-modal';
import { spreadSquare } from '../src/app/records/[id]/sleeve-open';
import { login } from './sign-in';

registerCleanup();

/**
 * Step 93, §M.4: "A rotation or a resize while the modal is open
 * re-measures the square once the viewport settles, and the sleeve takes
 * its new size and place at once. Nothing animates the change... If a turn,
 * the gatefold's opening or the cover's travel is under way, it is cut to
 * its end state first and then re-measured... A resize that does not change
 * the square's size moves nothing. Where the gatefold is open, it is the
 * spread that is re-measured."
 *
 * Withdrawn by it: the sizes taken once, which left a 354 square on a
 * window 390 high.
 *
 * "Settles" is this build's figure, SETTLE_MS, 150ms with no resize event,
 * accepted on 6 Oct with the state it leaves: until then the sleeve is at
 * its old size. That state is asserted and captured here so it is known.
 */

const fixture = (file: string) => `data:image/png;base64,${readFileSync(join('test', 'fixtures', 'covers', file)).toString('base64')}`;
const PHONE = { width: 390, height: 844 };
const TURNED = { width: 844, height: 390 };
const CAPTURES = join('docs', 'captures', 'modal-rotation-93');

async function openSleeve(page: Page, viewport: { width: number; height: number }, gatefold = false) {
  const s = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const a = await page.request.post('/api/artists', { data: { name: `Resize93-${s}` } });
  const artistId = ((await a.json()) as { id: string }).id;
  trackArtist(artistId);
  const r = await page.request.post('/api/records', { data: { title: `Resize93 ${s}`, artistId } });
  expect(r.status()).toBe(201);
  const id = ((await r.json()) as { id: string }).id;
  await seedImage({ recordId: id, imageType: 'cover', url: fixture('cover-inside-1000x951.png') });
  await seedImage({ recordId: id, imageType: 'back', url: fixture('cover-outside-portrait-949x1000.png') });
  if (gatefold) for (const leaf of ['gatefold_left', 'gatefold_right'] as const) await seedImage({ recordId: id, imageType: leaf, url: fixture('cover-far-1200x900.png') });
  await page.setViewportSize(viewport);
  await page.goto(`/records/${id}`);
  await page.locator('[data-cell="sleeve"] img[data-cover][data-cover-treatment]').waitFor({ timeout: 30_000 });
  await page.addStyleTag({ content: 'nextjs-portal{display:none!important}' });
  await page.getByRole('button', { name: 'Open the sleeve' }).click();
  await page.locator('[data-sleeve-modal]:not([data-travelling])').waitFor();
  await page.waitForFunction(() => getComputedStyle(document.querySelector('[data-sleeve-controls]') as HTMLElement).opacity === '1');
}

const box = (page: Page, selector: string) => page.locator(selector).evaluate((el) => { const r = el.getBoundingClientRect(); return { left: r.left, top: r.top, width: r.width, height: r.height, right: r.right, bottom: r.bottom }; });
const width = (page: Page, selector: string) => page.locator(selector).evaluate((el) => el.getBoundingClientRect().width);

test.beforeEach(async ({ page }) => login(page));

/* Fails against the sizes taken once (step 81): turned, the 354 square stays, and with its label and controls it runs off a window 390 high. */
test('the modal open at 390 × 844, turned to 844 × 390: until the viewport settles the sleeve is at its old size; then the sleeve, label and controls fit, at once, and the top row is untouched', async ({ page }) => {
  await openSleeve(page, PHONE);
  const before = sleeveSquare(PHONE.width, PHONE.height);
  const after = sleeveSquare(TURNED.width, TURNED.height);
  expect([before, after], 'the precondition: the two windows have different squares').toEqual([354, 222]);
  expect(await width(page, '[data-sleeve]')).toBe(before);
  const row = await box(page, '[data-sleeve-row]');

  await page.setViewportSize(TURNED);
  const turnedAt = Date.now();
  /* The accepted transient: the viewport has changed and has not yet settled. */
  expect(await width(page, '[data-sleeve]'), 'before it settles the sleeve is still at its old size').toBe(before);
  const overrun = await page.evaluate(() => (document.querySelector('[data-sleeve-controls]') as HTMLElement).getBoundingClientRect().bottom - window.innerHeight);
  expect(overrun, 'and its controls run off the turned window: the state the settling ends').toBeGreaterThan(0);
  if (WRITE_CAPTURES) { mkdirSync(CAPTURES, { recursive: true }); await page.screenshot({ path: join(CAPTURES, `rotation-0844x390-before-settle-s${before}.png`) }); }

  /* At once: sampled in the page, the square goes from the old size to the new with no size between. */
  const sizes = await page.evaluate(async (target) => {
    const seen: number[] = [];
    await new Promise<void>((resolve) => { const started = performance.now(); const tick = () => { const w = (document.querySelector('[data-sleeve]') as HTMLElement).getBoundingClientRect().width; if (seen[seen.length - 1] !== w) seen.push(w); if (w === target && performance.now() - started > 100 || performance.now() - started > 3000) resolve(); else requestAnimationFrame(tick); }; requestAnimationFrame(tick); });
    return seen;
  }, after);
  expect(sizes, 'the old size, then the new, and nothing between: no animation').toEqual([before, after]);
  const settledIn = Date.now() - turnedAt;
  expect(settledIn, `it settled about ${SETTLE_MS}ms after the last resize event`).toBeLessThan(SETTLE_MS + 1500);

  const square = await box(page, '[data-sleeve]');
  const label = await box(page, '[data-face-label]');
  const controls = await box(page, '[data-sleeve-controls]');
  const stack = after + MODAL_LABEL_GAP + MODAL_LABEL_LINE + MODAL_LABEL_GAP + MODAL_CONTROL;
  expect(square.left, 'centred across the turned window').toBeCloseTo((TURNED.width - after) / 2, 0);
  expect(square.top, 'and down the space below the row').toBeCloseTo(MODAL_ROW + (TURNED.height - MODAL_ROW - stack) / 2, 0);
  expect(square.top - MODAL_ROW).toBeGreaterThanOrEqual(MODAL_INSET - 0.5);
  expect(label.top).toBeCloseTo(square.bottom + MODAL_LABEL_GAP, 0);
  expect(controls.top).toBeCloseTo(label.bottom + MODAL_LABEL_GAP, 0);
  expect(TURNED.height - controls.bottom, 'the controls fit, with the inset beneath').toBeGreaterThanOrEqual(MODAL_INSET - 0.5);
  const rowAfter = await box(page, '[data-sleeve-row]');
  expect({ top: rowAfter.top, height: rowAfter.height, left: rowAfter.left }, 'the top row is untouched').toEqual({ top: row.top, height: row.height, left: row.left });
  expect(rowAfter.width, 'and spans the turned window').toBe(TURNED.width);
  if (WRITE_CAPTURES) await page.screenshot({ path: join(CAPTURES, `rotation-0844x390-settled-s${after}.png`) });
});

/* Fails against a re-measure of the closed square alone: the open spread would keep its 177 leaves, or be re-drawn closed. */
test('the same rotation with the gatefold open: the spread is re-measured to the largest that fits and stays centred, and folding returns to the new closed square', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openSleeve(page, PHONE, true);
  await page.locator('[data-sleeve-control="open"]').click();
  await page.locator('[data-spread]').waitFor();
  expect(await width(page, '[data-leaf="right"]'), 'the precondition: open on the phone, each leaf 177').toBe(spreadSquare(PHONE.width, PHONE.height));
  await page.setViewportSize(TURNED);
  const leaf = spreadSquare(TURNED.width, TURNED.height);
  expect(leaf, 'turned, two closed squares fit side by side').toBe(sleeveSquare(TURNED.width, TURNED.height));
  await page.waitForFunction((w) => (document.querySelector('[data-leaf="right"]') as HTMLElement | null)?.getBoundingClientRect().width === w, leaf, { timeout: 5000 });
  const left = await box(page, '[data-leaf="panel"]');
  const right = await box(page, '[data-leaf="right"]');
  const c = TURNED.width / 2;
  expect([left.left, left.right, right.left, right.right], 'the spread is centred on the turned window').toEqual([c - leaf, c, c, c + leaf]);
  expect([left.width, left.height, right.height]).toEqual([leaf, leaf, leaf]);
  await expect(page.locator('[data-face-label]')).toHaveText(/^inside$/i);
  await page.locator('[data-sleeve-control="fold"]').click();
  await page.locator('[data-sleeve]').waitFor();
  const closed = await box(page, '[data-sleeve]');
  expect([closed.width, closed.left], 'folded, it is the closed square measured for the turned window').toEqual([sleeveSquare(TURNED.width, TURNED.height), (TURNED.width - sleeveSquare(TURNED.width, TURNED.height)) / 2]);
});

/* Fails against a settle that cuts whatever is moving on every resize, or re-lays the sleeve when nothing about it changed. */
test('a resize that keeps the square’s size moves nothing: a turn under way is not cut, and the sleeve stays on the window’s centre', async ({ page }) => {
  await openSleeve(page, { width: GRID_FORK, height: NO_SCROLL_HEIGHT });
  const S = sleeveSquare(GRID_FORK, NO_SCROLL_HEIGHT);
  expect(sleeveSquare(1500, NO_SCROLL_HEIGHT), 'the precondition: a wider window with the same square').toBe(S);
  await page.locator('[data-sleeve-control="turn"]').click();
  await page.locator('[data-sleeve][data-turning]').waitFor();
  await page.setViewportSize({ width: 1500, height: NO_SCROLL_HEIGHT });
  const during = await page.evaluate(async (settle) => {
    const sleeve = document.querySelector('[data-sleeve]') as HTMLElement;
    const started = performance.now(); let turningAfterSettle = false; let cutAt: number | null = null; let was = sleeve.hasAttribute('data-turning');
    await new Promise<void>((resolve) => { const tick = () => { const t = performance.now() - started; const now = sleeve.hasAttribute('data-turning'); if (was && !now && cutAt === null) cutAt = t; if (now && t > settle + 60) turningAfterSettle = true; was = now; if (t > 1200) resolve(); else requestAnimationFrame(tick); }; requestAnimationFrame(tick); });
    return { turningAfterSettle, cutAt, face: sleeve.getAttribute('data-face') };
  }, SETTLE_MS);
  expect(during.turningAfterSettle, 'the turn was still turning after the viewport had settled').toBe(true);
  expect(during.face, 'and finished on the back in its own time').toBe('back');
  const square = await box(page, '[data-sleeve]');
  expect([square.width, square.left], 'the same square, on the wider window’s centre').toEqual([S, (1500 - S) / 2]);
});

/* Fails against a re-measure that leaves the motion running at the old size, or drops it on the face it left. */
test('a turn under way when the viewport settles on a different square is cut to its end state and then re-measured', async ({ page }) => {
  await openSleeve(page, { width: GRID_FORK, height: NO_SCROLL_HEIGHT });
  await page.locator('[data-sleeve-control="turn"]').click();
  await page.locator('[data-sleeve][data-turning]').waitFor();
  await page.setViewportSize({ width: GRID_FORK, height: 700 });
  const after = sleeveSquare(GRID_FORK, 700);
  await page.waitForFunction((w) => (document.querySelector('[data-sleeve]') as HTMLElement).getBoundingClientRect().width === w, after, { timeout: 5000 });
  const state = await page.locator('[data-sleeve]').evaluate((el) => ({ turning: el.hasAttribute('data-turning'), face: el.getAttribute('data-face'), transform: getComputedStyle(el).transform }));
  expect(state, 'on the face it was turning to, flat, at the new size').toEqual({ turning: false, face: 'back', transform: 'none' });
  await expect(page.locator('[data-face-label]')).toHaveText(/^back$/i);
});

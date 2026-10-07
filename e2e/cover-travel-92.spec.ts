import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { registerCleanup, trackArtist } from './cleanup';
import { seedImage } from './seed';
import { GRID_FORK, NO_SCROLL_HEIGHT } from '../src/app/records/[id]/band-geometry';
import { MODAL_ROW, sleeveSquare } from '../src/app/records/[id]/sleeve-modal';
import { FADE_MS, TRAVEL_MS } from '../src/app/records/[id]/sleeve-travel';

registerCleanup();

/**
 * Step 92, §M.7: "The modal does not appear: the cover the reader pressed
 * travels from its square on the record page to the modal's square, growing
 * into place... one motion, on one curve, an ease-out cubic... Position,
 * size and the crop all move on it together." "The paper comes up with the
 * cover, rising from clear to opaque over the same duration on the same
 * curve, and the top row... comes with it." "The face label and the
 * controls arrive after the cover lands, with a short fade." "Closing plays
 * the travel in reverse, and every way of closing plays it." "A close is
 * honoured from any state, at any moment." "Under the reduced-motion
 * setting, nothing travels."
 *
 * Every animation frame from the press is sampled in the page: the
 * travelling cover's box and its photograph's box, the paper's and the top
 * row's opacity, the label's and the controls', and where focus is.
 */

const PASSWORD = process.env.E2E_PASSWORD ?? 'test-password-for-e2e';
const fixture = (file: string) => `data:image/png;base64,${readFileSync(join('test', 'fixtures', 'covers', file)).toString('base64')}`;
type Photo = { file: string; width: number; height: number };
const photos = JSON.parse(readFileSync(join('test', 'fixtures', 'covers', 'manifest.json'), 'utf8')) as Photo[];
const INSIDE = photos.find((p) => p.file === 'cover-inside-1000x951.png') as Photo;

async function login(page: Page) {
  await page.goto('/login');
  await page.locator('form[data-hydrated="true"]').waitFor({ timeout: 15_000 });
  await page.getByLabel('Password').pressSequentially(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL('/');
}

async function seed(page: Page, gatefold = false): Promise<string> {
  const s = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const a = await page.request.post('/api/artists', { data: { name: `Travel92-${s}` } });
  const artistId = ((await a.json()) as { id: string }).id;
  trackArtist(artistId);
  const r = await page.request.post('/api/records', { data: { title: `Travel92 ${s}`, artistId } });
  expect(r.status()).toBe(201);
  const id = ((await r.json()) as { id: string }).id;
  await seedImage({ recordId: id, imageType: 'cover', url: fixture(INSIDE.file) });
  await seedImage({ recordId: id, imageType: 'back', url: fixture('cover-outside-portrait-949x1000.png') });
  if (gatefold) for (const leaf of ['gatefold_left', 'gatefold_right'] as const) await seedImage({ recordId: id, imageType: leaf, url: fixture('cover-far-1200x900.png') });
  return id;
}

async function recordPage(page: Page, id: string, width: number, height: number) {
  await page.setViewportSize({ width, height });
  await page.goto(`/records/${id}`);
  await page.locator('[data-cell="sleeve"] img[data-cover][data-cover-treatment]').waitFor({ timeout: 30_000 });
  await page.addStyleTag({ content: 'nextjs-portal{display:none!important}' });
  await page.locator('[data-cover-trigger]').scrollIntoViewIfNeeded();
  await page.waitForTimeout(200);
}

const opened = (page: Page) => page.locator('[data-sleeve-modal]:not([data-travelling])').waitFor();

type Box = [number, number, number, number];
type Frame = {
  t: number; modal: boolean; travelling: string | null; cover: Box | null; photo: Box | null;
  paper: number | null; row: number | null; label: number | null; controls: number | null;
  spread: boolean; turning: boolean; focusOnTrigger: boolean; pageCoverShown: boolean;
};

/** Does `action` in the page and samples every animation frame until the modal has rested, or gone, for five frames. */
const sample = (page: Page, action: 'press' | 'close' | 'escape' | 'back' | 'press-then-escape', at = 150) => page.evaluate(async ({ what, when }) => {
  const frames: Frame[] = [];
  type Frame = { t: number; modal: boolean; travelling: string | null; cover: [number, number, number, number] | null; photo: [number, number, number, number] | null; paper: number | null; row: number | null; label: number | null; controls: number | null; spread: boolean; turning: boolean; focusOnTrigger: boolean; pageCoverShown: boolean };
  const rect = (el: Element | null): [number, number, number, number] | null => { if (el === null) return null; const r = el.getBoundingClientRect(); return [r.left, r.top, r.width, r.height]; };
  const opacity = (el: Element | null) => (el === null ? null : Number(getComputedStyle(el).opacity));
  const trigger = document.querySelector('[data-cover-trigger]') as HTMLElement;
  const escape = () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  const started = performance.now();
  if (what === 'press' || what === 'press-then-escape') trigger.click();
  if (what === 'close') (document.querySelector('[data-sleeve-close]') as HTMLElement).click();
  if (what === 'escape') escape();
  if (what === 'back') history.back();
  let escaped = what !== 'press-then-escape';
  await new Promise<void>((resolve) => {
    let rest = 0;
    const tick = () => {
      const t = performance.now() - started;
      const modal = document.querySelector<HTMLElement>('[data-sleeve-modal]');
      const travelling = modal?.getAttribute('data-travelling') ?? null;
      frames.push({
        t, modal: modal !== null, travelling,
        cover: rect(document.querySelector('[data-travel-cover]')), photo: rect(document.querySelector('[data-travel-cover] img')),
        paper: opacity(document.querySelector('[data-sleeve-paper]')), row: opacity(document.querySelector('[data-sleeve-row]')),
        label: opacity(document.querySelector('[data-face-label]')), controls: opacity(document.querySelector('[data-sleeve-controls]')),
        spread: document.querySelector('[data-spread]') !== null, turning: document.querySelector('[data-sleeve][data-turning]') !== null,
        focusOnTrigger: document.activeElement === trigger,
        pageCoverShown: getComputedStyle(trigger.querySelector('img') as HTMLElement).visibility === 'visible',
      });
      if (!escaped && t >= when) { escaped = true; escape(); }
      const moving = travelling !== null || (modal !== null && (opacity(document.querySelector('[data-face-label]')) ?? 1) < 1);
      rest = moving ? 0 : rest + 1;
      if ((rest >= 5 && t > 100 && escaped) || t > 6000) resolve(); else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  return frames;
}, { what: action, when: at }) as Promise<Frame[]>;

const centre = (b: Box): [number, number] => [b[0] + b[2] / 2, b[1] + b[3] / 2];
const close = (a: number, b: number, tol: number) => Math.abs(a - b) <= tol;

test.beforeEach(async ({ page }) => login(page));

for (const [width, height] of [[390, 844], [GRID_FORK, NO_SCROLL_HEIGHT]] as const) {
  /* Fails against the modal as built at step 81, which appears at once: no frame travels. */
  test(`at ${width} × ${height} the pressed cover travels from the page’s square to the modal’s on an ease-out, its crop easing to the fit, the paper and the top row rising with it, and the label and controls fading in after it lands`, async ({ page }) => {
    const id = await seed(page);
    await recordPage(page, id, width, height);
    const S = sleeveSquare(width, height);
    const from = await page.locator('[data-cover-trigger]').evaluate((el) => { const r = el.getBoundingClientRect(); return [r.left, r.top, r.width, r.height] as [number, number, number, number]; });
    const frames = await sample(page, 'press');
    const travel = frames.filter((f) => f.travelling === 'in' && f.cover !== null);
    expect(travel.length, 'frames sampled while the cover travels').toBeGreaterThanOrEqual(8);

    /* Where it lands: inside the modal's square's hairline. */
    await opened(page);
    const to = await page.locator('[data-sleeve]').evaluate((el) => { const r = el.getBoundingClientRect(); return [r.left + 1, r.top + 1, r.width - 2, r.height - 2] as [number, number, number, number]; });
    expect(to[2], 'the modal’s square').toBe(S - 2);

    const first = travel[0].cover as Box;
    expect(close(first[0], from[0], 30) && close(first[1], from[1], 30) && close(first[2], from[2], 30), `it starts at the page’s square ${from.map(Math.round)}: ${first.map(Math.round)}`).toBe(true);
    const eased: number[] = [];
    for (const f of travel) {
      const b = f.cover as Box; const p = f.photo as Box;
      /* Position and size on one value: the same fraction of the way in x, in y and in size, wherever each moves far enough to read. */
      const parts = [[b[0], from[0], to[0]], [b[1], from[1], to[1]], [b[2], from[2], to[2]]].filter(([, a, z]) => Math.abs(z - a) > 20).map(([v, a, z]) => (v - a) / (z - a));
      expect(parts.length).toBeGreaterThan(0);
      for (const part of parts) expect(part, `position and size move together at ${Math.round(f.t)}ms: ${parts.map((v) => v.toFixed(3))}`).toBeCloseTo(parts[0], 1);
      const e = parts[0];
      eased.push(e);
      expect(Math.abs(b[2] - b[3]), 'it stays a square').toBeLessThan(0.75);
      /* The paper and the top row come up with it, on the same value. */
      expect(f.paper as number, `the paper's opacity is the travel's value at ${Math.round(f.t)}ms`).toBeCloseTo(e, 1);
      expect(f.row as number, 'and the top row’s').toBeCloseTo(e, 1);
      expect((f.label ?? 0) + (f.controls ?? 0), 'the label and controls have not arrived').toBe(0);
      expect(f.pageCoverShown, 'the page’s own cover is not drawn as well: the travelling one is it').toBe(false);
      /* The crop eases to the fit: the photograph is centred on the box; at the start it covers the box, at the end it sits inside it. */
      const [cx, cy] = centre(b); const [px, py] = centre(p);
      expect(Math.abs(cx - px) + Math.abs(cy - py), 'the photograph is centred in the travelling square').toBeLessThan(1);
    }
    for (let i = 1; i < eased.length; i += 1) expect(eased[i]).toBeGreaterThanOrEqual(eased[i - 1] - 0.005);
    const photoOf = (f: Frame) => f.photo as Box; const boxOf = (f: Frame) => f.cover as Box;
    /* This fixture is inside §33's bound, so the page crops it: wider than tall, its width overhangs the square at the start and its height falls short of it at the end. */
    expect(photoOf(travel[0])[2] / boxOf(travel[0])[2], 'at the start the photograph covers the square: cropped, as on the page').toBeGreaterThan(1.02);
    expect(photoOf(travel[0])[3] / boxOf(travel[0])[3]).toBeCloseTo(1, 1);
    const last = travel[travel.length - 1];
    expect(photoOf(last)[2] / boxOf(last)[2], 'by the end it is fitted: its width is the square’s').toBeLessThan(1.012);
    expect(photoOf(last)[3] / boxOf(last)[3], 'and its height inside it').toBeLessThan(0.99);

    /* An ease-out, and one duration at every width. */
    const t0 = travel[0].t;
    const third = travel.findIndex((f) => f.t - t0 >= TRAVEL_MS / 3);
    expect(eased[third], `how far it has gone a third of the way through its ${TRAVEL_MS}ms`).toBeGreaterThan(0.55);
    const lasted = last.t - t0;
    expect(lasted, `it lasts about ${TRAVEL_MS}ms`).toBeGreaterThan(TRAVEL_MS * 0.75);
    expect(lasted).toBeLessThan(TRAVEL_MS * 1.4);

    /* After it lands: the label and controls fade in, from the landing. */
    const landed = frames.filter((f) => f.modal && f.travelling === null);
    expect(landed.length).toBeGreaterThan(3);
    const fading = landed.filter((f) => (f.label as number) > 0.02 && (f.label as number) < 0.98);
    expect(fading.length, `frames in which the label is part-way in, over about ${FADE_MS}ms`).toBeGreaterThanOrEqual(2);
    expect(landed[landed.length - 1].label, 'and it ends fully shown, with the controls').toBe(1);
    expect(landed[landed.length - 1].controls).toBe(1);
    expect(landed[landed.length - 1].paper, 'at rest the paper is opaque').toBe(1);
    expect(sleeveSquare(width, height) > 0 && MODAL_ROW > 0).toBe(true);
  });
}

/** What a return is, by frames: the label and controls go first, then the cover travels back to the page's square while the paper clears, and focus returns once it has landed. */
function expectReturn(frames: Frame[], from: Box, to: Box, name: string) {
  const out = frames.filter((f) => f.travelling === 'out' && f.cover !== null);
  expect(out.length, `${name}: frames sampled while the cover travels back`).toBeGreaterThanOrEqual(8);
  const firstOut = frames.indexOf(out[0]);
  /* Before it leaves, the label has gone. */
  const before = frames.slice(0, firstOut).filter((f) => f.modal);
  expect(before.some((f) => (f.label as number) < 0.98 && (f.label as number) > 0.02), `${name}: the label fades before the cover leaves`).toBe(true);
  expect(out[0].label, `${name}: and has gone when it does`).toBe(0);
  const start = out[0].cover as Box; const end = out[out.length - 1].cover as Box;
  expect(close(start[0], from[0], 30) && close(start[2], from[2], 30), `${name}: it leaves from the modal’s square`).toBe(true);
  /*
    The return is the travel played backwards, so it is fastest as it lands:
    the last frame sampled before the modal goes can be a whole frame's
    travel short of home. Within a fifth of the distance is "arriving"; that
    it then IS home is the last assertion below, the page's own cover drawn
    in its square.
  */
  const reach = 0.2 * Math.max(Math.abs(from[0] - to[0]), Math.abs(from[1] - to[1]), Math.abs(from[2] - to[2]), 150);
  expect(close(end[0], to[0], reach) && close(end[1], to[1], reach) && close(end[2], to[2], reach), `${name}: and arrives at the page’s square ${to.map(Math.round)}: ${end.map(Math.round)}`).toBe(true);
  for (let i = 1; i < out.length; i += 1) expect(Math.abs((out[i].cover as Box)[2] - to[2]), `${name}: it only ever comes nearer the page’s size`).toBeLessThanOrEqual(Math.abs((out[i - 1].cover as Box)[2] - to[2]) + 0.5);
  for (let i = 1; i < out.length; i += 1) expect((out[i].paper as number), `${name}: the paper only clears`).toBeLessThanOrEqual((out[i - 1].paper as number) + 0.005);
  expect(out[out.length - 1].paper as number).toBeLessThan(0.2);
  for (const f of out) { expect(f.spread || f.turning, `${name}: it travels as the folded front`).toBe(false); expect(f.focusOnTrigger, `${name}: focus does not return before it lands`).toBe(false); }
  const done = frames[frames.length - 1];
  expect({ modal: done.modal, focusOnTrigger: done.focusOnTrigger, pageCoverShown: done.pageCoverShown }, `${name}: landed, the modal is gone, the page’s cover is drawn and holds focus`).toEqual({ modal: false, focusOnTrigger: true, pageCoverShown: true });
  return out[out.length - 1].t - out[0].t;
}

test.describe('§M.7: every way of closing plays the same return', () => {
  /* Fails against a return that runs on the button alone: Back would cut straight to the page, with no frame travelling. */
  test('CLOSE, Escape and Back each fade the label, travel the cover back to the page’s square while the paper clears, and return focus on landing; the three take the same time', async ({ page }) => {
    const id = await seed(page);
    const lasted: Record<string, number> = {};
    for (const way of ['close', 'escape', 'back'] as const) {
      await recordPage(page, id, GRID_FORK, NO_SCROLL_HEIGHT);
      const to = await page.locator('[data-cover-trigger]').evaluate((el) => { const r = el.getBoundingClientRect(); return [r.left, r.top, r.width, r.height] as [number, number, number, number]; });
      await page.locator('[data-cover-trigger]').click();
      await opened(page);
      await page.waitForTimeout(FADE_MS + 150);
      const from = await page.locator('[data-sleeve]').evaluate((el) => { const r = el.getBoundingClientRect(); return [r.left + 1, r.top + 1, r.width - 2, r.height - 2] as [number, number, number, number]; });
      lasted[way] = expectReturn(await sample(page, way), from, to, way);
      await expect(page).toHaveURL(new RegExp(`/records/${id}$`));
    }
    expect(Math.abs(lasted.back - lasted.close), `Back’s return lasts what CLOSE’s does: ${JSON.stringify(lasted)}`).toBeLessThan(80);
    expect(Math.abs(lasted.escape - lasted.close)).toBeLessThan(80);
  });

  /* Fails against a close that waits for the turn or the fold, or travels the spread: "the sleeve cuts at once to its folded front, from wherever a turn or the gatefold's opening has reached, and then travels home." */
  test('a close with the gatefold open, and one in the middle of a turn, cut to the folded front and travel home', async ({ page }) => {
    const id = await seed(page, true);
    await recordPage(page, id, GRID_FORK, NO_SCROLL_HEIGHT);
    const to = await page.locator('[data-cover-trigger]').evaluate((el) => { const r = el.getBoundingClientRect(); return [r.left, r.top, r.width, r.height] as [number, number, number, number]; });
    await page.locator('[data-cover-trigger]').click();
    await opened(page);
    const from = await page.locator('[data-sleeve]').evaluate((el) => { const r = el.getBoundingClientRect(); return [r.left + 1, r.top + 1, r.width - 2, r.height - 2] as [number, number, number, number]; });
    await page.locator('[data-sleeve-control="open"]').click();
    await page.locator('[data-spread]:not([data-opening])').waitFor();
    expectReturn(await sample(page, 'back'), from, to, 'from the open gatefold');

    await page.locator('[data-cover-trigger]').click();
    await opened(page);
    await page.waitForTimeout(FADE_MS + 150);
    await page.locator('[data-sleeve-control="turn"]').click();
    await page.locator('[data-sleeve][data-turning]').waitFor();
    expectReturn(await sample(page, 'escape'), from, to, 'from the middle of a turn');
  });

  /* Fails against a close that waits for the cover to land first, or jumps it to the modal's square: "If the close comes while the cover is still travelling in, it reverses from wherever the cover is." */
  test('a close while the cover is still travelling in reverses from where the cover is', async ({ page }) => {
    const id = await seed(page);
    await recordPage(page, id, GRID_FORK, NO_SCROLL_HEIGHT);
    const home = await page.locator('[data-cover-trigger]').evaluate((el) => { const r = el.getBoundingClientRect(); return [r.left, r.top, r.width, r.height] as [number, number, number, number]; });
    const frames = (await sample(page, 'press-then-escape', 120)).filter((f) => f.cover !== null);
    const widths = frames.map((f) => (f.cover as Box)[2]);
    const peak = Math.max(...widths);
    const S = sleeveSquare(GRID_FORK, NO_SCROLL_HEIGHT);
    expect(frames.some((f) => f.travelling === 'in') && frames.some((f) => f.travelling === 'out'), 'it travelled in, and then out').toBe(true);
    expect(peak, `it turned back before reaching the modal’s square of ${S}`).toBeLessThan(S - 20);
    expect(peak, 'having left the page’s square').toBeGreaterThan(home[2] + 20);
    let jump = 0;
    for (let i = 1; i < widths.length; i += 1) jump = Math.max(jump, Math.abs(widths[i] - widths[i - 1]));
    expect(jump, 'no frame jumps: it reverses from where it is').toBeLessThan((S - home[2]) * 0.25);
    const last = frames[frames.length - 1].cover as Box;
    expect(close(last[0], home[0], 30) && close(last[2], home[2], 30), 'and comes home').toBe(true);
    await expect(page.locator('[data-sleeve-modal]')).toHaveCount(0);
    expect(await page.evaluate(() => (history.state as { sleeve?: boolean } | null)?.sleeve === true), 'with no history entry left').toBe(false);
  });
});

test.describe('§M.7: under reduced motion nothing travels', () => {
  /* Fails against a travel that ignores the setting. */
  test('the modal is in place at once, with its label and controls, and closing returns at once to the page', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const id = await seed(page);
    await recordPage(page, id, GRID_FORK, NO_SCROLL_HEIGHT);
    const opening = await sample(page, 'press');
    expect(opening.filter((f) => f.travelling !== null || f.cover !== null).length, 'frames travelling').toBe(0);
    expect(opening.slice(3).every((f) => f.modal && f.paper === 1 && f.label === 1 && f.controls === 1), 'in place, paper, label and controls together').toBe(true);
    const closing = await sample(page, 'back');
    expect(closing.filter((f) => f.travelling !== null || f.cover !== null).length).toBe(0);
    expect(closing.slice(3).every((f) => !f.modal && f.focusOnTrigger), 'gone at once, focus on the cover').toBe(true);
  });
});

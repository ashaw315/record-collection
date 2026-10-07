import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { registerCleanup, trackArtist } from './cleanup';
import { seedImage } from './seed';
import { GRID_FORK, NO_SCROLL_HEIGHT } from '../src/app/records/[id]/band-geometry';
import { MODAL_CONTROL, MODAL_CONTROL_GAP, MODAL_LABEL_GAP, MODAL_LABEL_LINE, MODAL_ROW, sleeveSquare } from '../src/app/records/[id]/sleeve-modal';
import { OPEN_MS, spreadSquare } from '../src/app/records/[id]/sleeve-open';
import { TURN_PERSPECTIVE } from '../src/app/records/[id]/sleeve-turn';

registerCleanup();

/**
 * Step 88, §M.4, §M.5 and §M.6: the gatefold's opening.
 *
 * "OPEN shows on the front only, and only where the gatefold opens... The
 * gatefold opens only when both inside photos exist." "The gatefold's
 * opening rotates the front panel 180 degrees about its left edge, the
 * fold, to become the left leaf, showing the inside left on its reverse and
 * uncovering the inside right in place." "In one motion, the front panel
 * rotates about the fold while the whole sleeve moves right by half a
 * square, so the spread ends centred... the sleeve also scales down to the
 * largest spread that fits, in the same motion." "Open, the control row
 * shows FOLD alone."
 *
 * Built and verified on a fixture record carrying both leaves, as the step
 * says: tests do not run against production, where Bitches Brew has both.
 */

const PASSWORD = process.env.E2E_PASSWORD ?? 'test-password-for-e2e';
const fixture = (file: string) => `data:image/png;base64,${readFileSync(join('test', 'fixtures', 'covers', file)).toString('base64')}`;
const FRONT = fixture('cover-inside-1000x951.png');
const LEFT = fixture('cover-far-1200x900.png');
const RIGHT = fixture('cover-at-bound-1000x950.png');

async function login(page: Page) {
  await page.goto('/login');
  await page.locator('form[data-hydrated="true"]').waitFor({ timeout: 15_000 });
  await page.getByLabel('Password').pressSequentially(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL('/');
}

async function seedSleeve(page: Page, leaves: Array<'gatefold_left' | 'gatefold_right'>, back = false): Promise<string> {
  const s = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const a = await page.request.post('/api/artists', { data: { name: `Fold88-${s}` } });
  const artistId = ((await a.json()) as { id: string }).id;
  trackArtist(artistId);
  const r = await page.request.post('/api/records', { data: { title: `Fold88 ${s}`, artistId } });
  expect(r.status()).toBe(201);
  const id = ((await r.json()) as { id: string }).id;
  await seedImage({ recordId: id, imageType: 'cover', url: FRONT });
  if (back) await seedImage({ recordId: id, imageType: 'back', url: fixture('cover-outside-portrait-949x1000.png') });
  for (const leaf of leaves) await seedImage({ recordId: id, imageType: leaf, url: leaf === 'gatefold_left' ? LEFT : RIGHT });
  return id;
}

async function openSleeve(page: Page, id: string, width: number, height: number) {
  await page.setViewportSize({ width, height });
  await page.goto(`/records/${id}`);
  await page.locator('[data-cell="sleeve"] img[data-cover][data-cover-treatment]').waitFor({ timeout: 30_000 });
  await page.addStyleTag({ content: 'nextjs-portal{display:none!important}' });
  await page.getByRole('button', { name: 'Open the sleeve' }).click();
  await page.locator('[data-sleeve-modal]').waitFor();
  await page.locator('[data-sleeve] img[data-sleeve-face]').evaluate((img) => (img as HTMLImageElement).decode());
  await page.mouse.move(1, height - 1);
}

const box = (page: Page, selector: string) => page.locator(selector).evaluate((el) => { const r = el.getBoundingClientRect(); return { left: r.left, top: r.top, width: r.width, height: r.height, right: r.right, bottom: r.bottom }; });
const controls = (page: Page) => page.locator('[data-sleeve-controls] button').evaluateAll((els) => els.map((el) => (el.textContent ?? '').trim().toUpperCase()));

type Frame = { t: number; moving: boolean; panel: string | null; transform: string; origin: string; foldX: number | null; top: number | null; size: number | null; label: string; closedShown: boolean; rightShown: boolean; opacity: string };

/** Presses a control and samples every animation frame until the sleeve has rested for three, or for `quietMs` where nothing is expected to move. */
const samplePress = (page: Page, control: string, quietMs: number) => page.evaluate(async ({ name, quiet }) => {
  const frames: Array<{ t: number; moving: boolean; panel: string | null; transform: string; origin: string; foldX: number | null; top: number | null; size: number | null; label: string; closedShown: boolean; rightShown: boolean; opacity: string }> = [];
  const started = performance.now();
  const button = document.querySelector(`[data-sleeve-control="${name}"]`) as HTMLElement;
  button.focus();
  button.click();
  await new Promise<void>((resolve) => {
    let seen = false; let rest = 0;
    const tick = () => {
      const spread = document.querySelector<HTMLElement>('[data-spread]');
      const panel = document.querySelector<HTMLElement>('[data-leaf="panel"]');
      const right = document.querySelector<HTMLElement>('[data-leaf="right"]');
      const moving = spread !== null && spread.hasAttribute('data-opening');
      const r = right?.getBoundingClientRect() ?? null;
      const cs = panel === null ? null : getComputedStyle(panel);
      frames.push({
        t: performance.now() - started, moving, panel: panel?.getAttribute('data-panel') ?? null, transform: cs?.transform ?? 'absent', origin: cs?.transformOrigin ?? '',
        foldX: r?.left ?? null, top: r?.top ?? null, size: r?.width ?? null,
        label: (document.querySelector('[data-face-label]')?.textContent ?? '').trim().toLowerCase(),
        closedShown: document.querySelector('[data-sleeve]') !== null, rightShown: right !== null && right.querySelector('img[data-sleeve-face="inside-right"]') !== null,
        opacity: spread === null ? '1' : getComputedStyle(spread).opacity,
      });
      seen = seen || moving; rest = seen && !moving ? rest + 1 : 0;
      const t = performance.now() - started;
      if ((seen && rest >= 3) || (!seen && t > quiet) || t > 6000) resolve(); else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  return frames;
}, { name: control, quiet: quietMs }) as Promise<Frame[]>;

function matrix(transform: string): number[] {
  if (transform === 'none') return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  const n = transform.slice(transform.indexOf('(') + 1, -1).split(',').map(Number);
  return n.length === 16 ? n : [n[0], n[1], 0, 0, n[2], n[3], 0, 0, 0, 0, 1, 0, n[4], n[5], 0, 1];
}

test.beforeEach(async ({ page }) => login(page));

test.describe('§M.6: OPEN shows on the front only, and only where both inside photos exist', () => {
  /* Fails against the modal as built at step 81, which has no OPEN; and against an OPEN drawn on the back. */
  test('with both leaves the front shows TURN OVER and OPEN, 24 apart, OPEN a §9.3 control; the back shows TURN OVER alone', async ({ page }) => {
    const id = await seedSleeve(page, ['gatefold_left', 'gatefold_right'], true);
    await openSleeve(page, id, GRID_FORK, NO_SCROLL_HEIGHT);
    expect(await controls(page)).toEqual(['TURN OVER', 'OPEN']);
    const turn = await box(page, '[data-sleeve-control="turn"]');
    const open = await box(page, '[data-sleeve-control="open"]');
    expect(open.left - turn.right, 'the controls are 24 apart').toBeCloseTo(MODAL_CONTROL_GAP, 1);
    const style = await page.locator('[data-sleeve-control="open"]').evaluate((el) => { const cs = getComputedStyle(el); return { height: el.getBoundingClientRect().height, border: cs.borderTopWidth, radius: cs.borderRadius, size: cs.fontSize, transform: cs.textTransform }; });
    expect(style).toEqual({ height: MODAL_CONTROL, border: '1px', radius: '0px', size: '11px', transform: 'uppercase' });
    await page.locator('[data-sleeve-control="turn"]').click();
    await page.locator('[data-sleeve][data-face="back"]:not([data-turning])').waitFor();
    expect(await controls(page), 'on the back').toEqual(['TURN OVER']);
  });

  /* Fails against an OPEN shown whenever any inside photo exists, or always: "absent, not present and inert". */
  test('with one leaf missing, OPEN is absent', async ({ page }) => {
    const id = await seedSleeve(page, ['gatefold_left']);
    await openSleeve(page, id, GRID_FORK, NO_SCROLL_HEIGHT);
    expect(await controls(page)).toEqual(['TURN OVER']);
  });
});

for (const [width, height] of [[390, 844], [GRID_FORK, NO_SCROLL_HEIGHT]] as const) {
  test.describe(`§M.4 and §M.5 at ${width} × ${height}: the opening`, () => {
    /* Fails against a modal with no opening; against a sleeve that moves left, or does not scale, or whose parts run on different curves; against a turn without perspective; and against the wall's ease in and out. */
    test('OPEN swings the front panel about the fold to become the left leaf while the sleeve moves right by half a square and scales, as one motion on an ease-out; the spread ends centred, INSIDE, with FOLD alone; FOLD returns it', async ({ page }) => {
      const id = await seedSleeve(page, ['gatefold_left', 'gatefold_right']);
      await openSleeve(page, id, width, height);
      const S = sleeveSquare(width, height);
      const T = spreadSquare(width, height);
      const closed = await box(page, '[data-sleeve]');
      const c = closed.left + closed.width / 2;
      expect(closed.width, 'the precondition: the closed sleeve is the closed square').toBe(S);

      const frames = await samplePress(page, 'open', 1000);
      const moving = frames.filter((f) => f.moving);
      expect(moving.length, 'frames sampled while it opens').toBeGreaterThanOrEqual(10);

      const eased: number[] = [];
      for (const f of moving) {
        const m = matrix(f.transform);
        expect(m[0] * m[0] + m[2] * m[2], `a rigid rotation at ${Math.round(f.t)}ms: ${f.transform}`).toBeCloseTo(1, 4);
        expect([m[1], m[4], m[5], m[6], m[9]].map((v) => Math.round(v * 1e4) / 1e4), 'about the vertical, nothing else').toEqual([0, 0, 1, 0, 0]);
        const d = (f.size as number) * TURN_PERSPECTIVE;
        expect(m[3], 'in perspective while it moves').toBeCloseTo(-m[2] / d, 5);
        const angle = (Math.atan2(-m[2], m[0]) * 180) / Math.PI;
        /* The front panel is hinged at its left edge and swings toward the reader; the left leaf is hinged at its right edge and lies down. */
        if (f.panel === 'front') { expect(angle).toBeLessThanOrEqual(0.01); expect(angle).toBeGreaterThan(-90.01); expect(f.origin.startsWith('0px'), `hinged at its left edge: ${f.origin}`).toBe(true); }
        else { expect(f.panel).toBe('left'); expect(angle).toBeGreaterThanOrEqual(-0.01); expect(angle).toBeLessThanOrEqual(90.01); expect(parseFloat(f.origin), `hinged at its right edge: ${f.origin}`).toBeCloseTo(f.size as number, 0); }
        const byRotation = (f.panel === 'front' ? -angle : 180 - angle) / 180;
        const byMove = ((f.foldX as number) - (c - S / 2)) / (S / 2);
        expect(byMove, `the move is on the rotation's value at ${Math.round(f.t)}ms`).toBeCloseTo(byRotation, 1);
        if (S !== T) expect((S - (f.size as number)) / (S - T), 'and so is the scale').toBeCloseTo(byRotation, 1);
        expect(Math.abs(byMove - byRotation), 'within two hundredths').toBeLessThan(0.02);
        expect(f.label, 'the label names the face toward the reader').toBe(f.panel === 'front' ? 'front' : 'inside');
        expect(f.rightShown, 'the inside right is in place beneath, uncovered as the panel swings').toBe(true);
        expect(f.opacity, 'no fade').toBe('1');
        eased.push(byRotation);
      }
      for (let i = 1; i < eased.length; i += 1) expect(eased[i], `frame ${i} has not gone back`).toBeGreaterThanOrEqual(eased[i - 1] - 0.005);
      expect(moving.filter((f, i) => i > 0 && f.panel !== moving[i - 1].panel).length, 'the panel changes once, edge-on').toBe(1);
      /* An ease-out: most of the motion is done early. A third of the way through the time it is about 0.70 done; the wall's ease would be 0.15. */
      const t0 = moving[0].t;
      const third = moving.findIndex((f) => f.t - t0 >= OPEN_MS / 3);
      expect(eased[third], `how far it has gone a third of the way through its ${OPEN_MS}ms`).toBeGreaterThan(0.55);
      const lasted = moving[moving.length - 1].t - t0;
      expect(lasted).toBeGreaterThan(OPEN_MS * 0.8);
      expect(lasted).toBeLessThan(OPEN_MS * 1.4);

      /* At rest, open: flat, the spread centred on the closed sleeve's centre, each leaf the spread's square, the column re-centred. */
      await page.locator('[data-spread]:not([data-opening])').waitFor();
      const left = await box(page, '[data-leaf="panel"]');
      const right = await box(page, '[data-leaf="right"]');
      expect([left.left, left.right, right.left, right.right].map((v) => Math.round(v * 10) / 10), 'the left leaf spans c − S to c, the right c to c + S').toEqual([c - T, c, c, c + T]);
      expect([left.width, left.height, right.width, right.height]).toEqual([T, T, T, T]);
      const stack = T + MODAL_LABEL_GAP + MODAL_LABEL_LINE + MODAL_LABEL_GAP + MODAL_CONTROL;
      expect(right.top, 'centred with its label and controls below the row').toBeCloseTo(MODAL_ROW + (height - MODAL_ROW - stack) / 2, 0);
      expect(left.top).toBe(right.top);
      expect(await page.locator('[data-leaf="panel"]').evaluate((el) => getComputedStyle(el).transform), 'flat at rest').toBe('none');
      expect(await page.locator('[data-leaf="panel"] img').getAttribute('src') === LEFT, 'the left leaf is the inside left').toBe(true);
      expect(await page.locator('[data-leaf="right"] img').getAttribute('src') === RIGHT, 'the right leaf is the inside right').toBe(true);
      expect(await page.locator('[data-leaf] img').evaluateAll((els) => els.map((el) => getComputedStyle(el).objectFit)), 'each fitted, never cropped').toEqual(['contain', 'contain']);
      await expect(page.locator('[data-face-label]')).toHaveText(/^inside$/i);
      expect(await controls(page), 'open, the control row shows FOLD alone').toEqual(['FOLD']);
      expect(await page.evaluate(() => document.activeElement?.getAttribute('data-sleeve-control')), 'focus is on a control in the row').toBe('fold');
      const label = await box(page, '[data-face-label]');
      expect(label.top, 'the label is 12 beneath the spread').toBeCloseTo(right.bottom + MODAL_LABEL_GAP, 0);

      /* Folding reverses it, to the square it left. */
      const folding = (await samplePress(page, 'fold', 1000)).filter((f) => f.moving);
      expect(folding.length).toBeGreaterThanOrEqual(10);
      expect(folding[0].panel, 'folding starts from the left leaf').toBe('left');
      expect(folding[folding.length - 1].panel, 'and ends on the front').toBe('front');
      await page.locator('[data-sleeve]:not([data-turning])').waitFor();
      await expect(page.locator('[data-spread]')).toHaveCount(0);
      expect(await box(page, '[data-sleeve]'), 'the closed sleeve is where and what it was').toEqual(closed);
      await expect(page.locator('[data-face-label]')).toHaveText(/^front$/i);
      expect(await controls(page)).toEqual(['TURN OVER', 'OPEN']);
      expect(await page.evaluate(() => document.activeElement?.getAttribute('data-sleeve-control')), 'focus returns to OPEN').toBe('open');
    });
  });
}

test.describe('§M.5: under reduced motion the spread appears at once', () => {
  /* Fails against an opening that ignores the setting. */
  test('OPEN shows the spread centred at its own size with no frame moving; FOLD returns at once', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const id = await seedSleeve(page, ['gatefold_left', 'gatefold_right']);
    await openSleeve(page, id, 390, 844);
    const T = spreadSquare(390, 844);
    const closed = await box(page, '[data-sleeve]');
    const frames = await samplePress(page, 'open', OPEN_MS * 1.5);
    expect(frames.length).toBeGreaterThanOrEqual(10);
    expect(frames.filter((f) => f.moving).length, 'frames moving').toBe(0);
    expect(frames.slice(2).every((f) => f.label === 'inside' && f.size === T && f.transform === 'none'), 'the spread, flat and INSIDE, by the third frame').toBe(true);
    const right = await box(page, '[data-leaf="right"]');
    expect(right.left, 'centred').toBeCloseTo(195, 1);
    const back = await samplePress(page, 'fold', OPEN_MS * 1.5);
    expect(back.filter((f) => f.moving).length).toBe(0);
    expect(await box(page, '[data-sleeve]')).toEqual(closed);
  });
});

test.describe('§M.1 with the gatefold open', () => {
  /* Fails against a modal that remembers the spread: closed and reopened, it is the closed front again. */
  test('CLOSE closes from the open spread, and the sleeve reopens closed, on its front', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const id = await seedSleeve(page, ['gatefold_left', 'gatefold_right']);
    await openSleeve(page, id, GRID_FORK, NO_SCROLL_HEIGHT);
    await page.locator('[data-sleeve-control="open"]').click();
    await page.locator('[data-spread]').waitFor();
    await page.locator('[data-sleeve-close]').click();
    await expect(page.locator('[data-sleeve-modal]')).toHaveCount(0);
    await page.getByRole('button', { name: 'Open the sleeve' }).click();
    await page.locator('[data-sleeve][data-face="front"]').waitFor();
    await expect(page.locator('[data-spread]')).toHaveCount(0);
  });
});

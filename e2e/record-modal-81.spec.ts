import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import sharp from 'sharp';
import { registerCleanup, trackArtist } from './cleanup';
import { seedImage } from './seed';
import { GRID_FORK, NO_SCROLL_HEIGHT } from '../src/app/records/[id]/band-geometry';
import { MODAL_CONTROL, MODAL_INSET, MODAL_LABEL_GAP, MODAL_LABEL_LINE, MODAL_ROW, sleeveSquare } from '../src/app/records/[id]/sleeve-modal';
import { TURN_MS, TURN_PERSPECTIVE } from '../src/app/records/[id]/sleeve-turn';

registerCleanup();

/**
 * Step 81, first unit: §M.1, where the modal opens and what it is.
 *
 * "The trigger is the displayed cover itself. It becomes a button whose
 * accessible name is 'Open the sleeve'. It adds no control to the page, so
 * the closed screen's composition does not change." "It covers the whole
 * viewport on opaque paper, with no dimming, shadow or rounded panel... Its
 * top row is 53, like the header's, with a hairline below it and CLOSE at
 * the right on the 18 inset." "Escape and CLOSE dismiss it, and focus
 * returns to the cover. Tab cycles within the modal while it is open."
 * "Opening it adds one history entry at the same URL... CLOSE and Escape
 * step back through that entry, so it never lingers."
 *
 * This unit builds the view and not what stands in it: the sleeve, its
 * faces and controls are the second unit's, the turn the third's.
 */

const PASSWORD = process.env.E2E_PASSWORD ?? 'test-password-for-e2e';
const COVER = join('test', 'fixtures', 'covers', 'cover-inside-1000x951.png');
const TRIGGER = { role: 'button', name: 'Open the sleeve' } as const;
const INSET = 18;
const ROW = 53;

type Rgb = number[];
const near = (a: Rgb, b: Rgb, tol = 6) => a.every((v, i) => Math.abs(v - b[i]) <= tol);

async function login(page: Page) {
  await page.goto('/login');
  await page.locator('form[data-hydrated="true"]').waitFor({ timeout: 15_000 });
  await page.getByLabel('Password').pressSequentially(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL('/');
}

const fixture = (file: string) => `data:image/png;base64,${readFileSync(join('test', 'fixtures', 'covers', file)).toString('base64')}`;

/** A record with the faces a test needs: a front fixture, and a back photograph or none. */
async function seedSleeve(page: Page, front: string, back: string | null): Promise<string> {
  const s = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const a = await page.request.post('/api/artists', { data: { name: `Modal81-${s}` } });
  const artistId = ((await a.json()) as { id: string }).id;
  trackArtist(artistId);
  const r = await page.request.post('/api/records', { data: { title: `Modal81 ${s}`, artistId } });
  expect(r.status()).toBe(201);
  const id = ((await r.json()) as { id: string }).id;
  await seedImage({ recordId: id, imageType: 'cover', url: fixture(front) });
  if (back !== null) await seedImage({ recordId: id, imageType: 'back', url: fixture(back) });
  return id;
}

async function seedRecord(page: Page, cover: boolean): Promise<string> {
  const s = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const a = await page.request.post('/api/artists', { data: { name: `Modal81-${s}` } });
  const artistId = ((await a.json()) as { id: string }).id;
  trackArtist(artistId);
  const r = await page.request.post('/api/records', { data: { title: `Modal81 ${s}`, artistId } });
  expect(r.status()).toBe(201);
  const id = ((await r.json()) as { id: string }).id;
  if (cover) await seedImage({ recordId: id, imageType: 'cover', url: `data:image/png;base64,${readFileSync(COVER).toString('base64')}` });
  return id;
}

/** The record page with its cover shown, which is when the trigger is live. */
async function openRecord(page: Page, id: string, width: number, height: number = NO_SCROLL_HEIGHT) {
  await page.setViewportSize({ width, height });
  await page.goto(`/records/${id}`);
  await page.locator('[data-cell="sleeve"] img[data-cover][data-cover-treatment]').waitFor({ timeout: 30_000 });
  await page.addStyleTag({ content: 'nextjs-portal{display:none!important}' });
}

const modal = (page: Page) => page.locator('[data-sleeve-modal]');
const focusIsOnTrigger = (page: Page) => page.evaluate(() => document.activeElement?.getAttribute('aria-label') === 'Open the sleeve');

test.beforeEach(async ({ page }) => login(page));

test.describe('§M.1: the trigger is the displayed cover, and the page’s composition does not change', () => {
  for (const width of [390, GRID_FORK]) {
    /* Fails against the page as built, where the cover is an image and nothing is named "Open the sleeve". */
    test(`at ${width} the cover is a button named “Open the sleeve”, on the cover’s own box, and the cover has not moved`, async ({ page }) => {
      const id = await seedRecord(page, true);
      await openRecord(page, id, width);
      const trigger = page.getByRole(TRIGGER.role, { name: TRIGGER.name });
      await expect(trigger).toHaveCount(1);
      const m = await page.evaluate(() => {
        const r = (el: Element) => { const b = el.getBoundingClientRect(); return [b.left, b.top, b.width, b.height].map((v) => Math.round(v * 100) / 100); };
        const img = document.querySelector('[data-cell="sleeve"] img[data-cover]') as HTMLElement;
        const cell = document.querySelector('[data-cell="sleeve"]') as HTMLElement;
        const button = img.closest('button') as HTMLElement | null;
        return { img: r(img), cell: r(cell), button: button === null ? null : r(button), cursor: button === null ? null : getComputedStyle(button).cursor };
      });
      expect(m.button, 'the button is the cover’s own box').toEqual(m.img);
      expect([m.img[0], m.img[1]], 'the cover is flush to its cell’s left and top, as before').toEqual([m.cell[0], m.cell[1]]);
      expect(m.img[2], 'and is the largest square its cell holds').toBeCloseTo(Math.min(m.cell[2], m.cell[3]), 1);
      expect(m.img[3]).toBeCloseTo(m.img[2], 1);
      expect(m.cursor, 'its sign on a pointer device').toBe('pointer');
    });
  }

  /* Fails against a trigger drawn for every record: the no-photo frame is not a way in to a sleeve with no photograph. */
  test('a record with no cover has no trigger', async ({ page }) => {
    const id = await seedRecord(page, false);
    await page.setViewportSize({ width: GRID_FORK, height: NO_SCROLL_HEIGHT });
    await page.goto(`/records/${id}`);
    await page.locator('[data-cell="sleeve"] [data-mark="coverFrame"]').waitFor({ timeout: 30_000 });
    await expect(page.getByRole(TRIGGER.role, { name: TRIGGER.name })).toHaveCount(0);
  });
});

test.describe('§M.1: the modal is a view of the object on opaque paper', () => {
  for (const [width, height] of [[390, 844], [GRID_FORK, NO_SCROLL_HEIGHT]] as const) {
    /* Fails against the page as built: nothing opens. */
    test(`at ${width} × ${height} it covers the whole viewport in paper, with a ${ROW} row, a hairline and CLOSE on the ${INSET} inset`, async ({ page }) => {
      const id = await seedRecord(page, true);
      await openRecord(page, id, width, height);
      const before = await page.evaluate(() => ({ url: location.href, entries: history.length }));
      await page.getByRole(TRIGGER.role, { name: TRIGGER.name }).click();
      await modal(page).waitFor();
      const m = await page.evaluate(() => {
        const rgb = (colour: string) => { const k = document.createElement('canvas'); k.width = 1; k.height = 1; const x = k.getContext('2d') as CanvasRenderingContext2D; x.fillStyle = colour; x.fillRect(0, 0, 1, 1); return Array.from(x.getImageData(0, 0, 1, 1).data); };
        const el = document.querySelector('[data-sleeve-modal]') as HTMLElement;
        const row = el.querySelector('[data-sleeve-row]') as HTMLElement;
        const close = el.querySelector('[data-sleeve-close]') as HTMLElement;
        const cs = getComputedStyle(el);
        const b = el.getBoundingClientRect(); const rb = row.getBoundingClientRect(); const cb = close.getBoundingClientRect();
        return {
          box: [b.left, b.top, b.width, b.height], window: [0, 0, window.innerWidth, window.innerHeight],
          ground: rgb(cs.backgroundColor), paper: rgb(getComputedStyle(document.body).backgroundColor),
          shadow: cs.boxShadow, radius: cs.borderRadius, opacity: cs.opacity,
          row: { top: rb.top, height: rb.height, rule: getComputedStyle(row).borderBottomWidth },
          close: { right: cb.right, height: cb.height, text: (close.textContent ?? '').trim(), centre: (cb.top + cb.bottom) / 2 },
          role: el.getAttribute('role'), modalAttr: el.getAttribute('aria-modal'),
          url: location.href, entries: history.length,
          focusInside: el.contains(document.activeElement),
        };
      });
      expect(m.box, 'it covers the whole viewport').toEqual(m.window);
      expect(m.ground[3], 'its ground is opaque').toBe(255);
      expect(m.ground, 'and is paper').toEqual(m.paper);
      expect({ shadow: m.shadow, radius: m.radius, opacity: m.opacity }, 'no shadow, no rounded panel, no dimming').toEqual({ shadow: 'none', radius: '0px', opacity: '1' });
      expect(m.row, `its top row is ${ROW}, a 52 row and its hairline`).toEqual({ top: 0, height: ROW, rule: '1px' });
      expect(m.close.text.toUpperCase()).toBe('CLOSE');
      expect(m.close.right, `CLOSE ends on the ${INSET} inset`).toBeCloseTo(width - INSET, 1);
      expect(m.close.height, 'at the control height').toBe(44);
      expect(m.close.centre, 'centred in the 52 row').toBeCloseTo(26, 1);
      expect({ role: m.role, modal: m.modalAttr }).toEqual({ role: 'dialog', modal: 'true' });
      expect(m.focusInside, 'focus has moved into it').toBe(true);
      expect(m.url, 'the address does not change').toBe(before.url);
      expect(m.entries, 'opening adds one history entry').toBe(before.entries + 1);

      /*
        The painted ground, not only the declared one: every point below the
        row and outside the sleeve's column reads as paper, so nothing of the
        page shows through. The first unit read the whole view, which was
        empty then; the sleeve, its label and its controls now stand in the
        middle of it, so their column's box is left out, and the test asserts
        that enough points remain to mean something.
      */
      await page.mouse.move(1, height - 1);
      const stack = await page.evaluate(() => {
        const r = (sel: string) => (document.querySelector(sel) as HTMLElement).getBoundingClientRect();
        const a = r('[data-sleeve]'); const c = r('[data-sleeve-controls]');
        return { left: Math.min(a.left, c.left) - 6, right: Math.max(a.right, c.right) + 6, top: a.top - 6, bottom: c.bottom + 6 };
      });
      const shot = await page.screenshot();
      const { data, info } = await sharp(shot).removeAlpha().raw().toBuffer({ resolveWithObject: true });
      const scale = info.width / width;
      let read = 0;
      for (let i = 0; i < 12; i += 1) for (let j = 0; j < 12; j += 1) {
        const cx = ((i + 0.5) / 12) * width;
        const cy = ROW + 2 + ((j + 0.5) / 12) * (height - ROW - 4);
        if (cx > stack.left && cx < stack.right && cy > stack.top && cy < stack.bottom) continue;
        read += 1;
        const x = Math.round(cx * scale);
        const y = Math.round(cy * scale);
        const at = (Math.min(info.height - 1, y) * info.width + Math.min(info.width - 1, x)) * 3;
        const p = [data[at], data[at + 1], data[at + 2]];
        expect(near(p, m.paper.slice(0, 3)), `the pixel at ${Math.round(cx)}, ${Math.round(cy)} is paper ${m.paper.slice(0, 3)}: ${p}`).toBe(true);
      }
      expect(read, 'points read outside the sleeve’s column').toBeGreaterThanOrEqual(24);
    });
  }
});

test.describe('§M.1: CLOSE, Escape and Back close it, and its history entry never lingers', () => {
  const ways: ReadonlyArray<readonly [string, (page: Page) => Promise<unknown>]> = [
    ['CLOSE', (page) => page.locator('[data-sleeve-close]').click()],
    ['Escape', (page) => page.keyboard.press('Escape')],
    ['Back', (page) => page.goBack()],
  ];
  for (const [name, close] of ways) {
    /* Fails against a modal that closes without stepping back through its entry: the Back that follows would reopen nothing and stay on the record, where it must leave for the collection. */
    test(`${name} closes it on the record page, focus returns to the cover, and the next Back leaves the record`, async ({ page }) => {
      const id = await seedRecord(page, true);
      /* Arrived from the collection, so there is somewhere for Back to go. */
      await page.goto('/?view=table');
      await openRecord(page, id, GRID_FORK);
      const entries = await page.evaluate(() => history.length);
      await page.getByRole(TRIGGER.role, { name: TRIGGER.name }).click();
      await modal(page).waitFor();
      await close(page);
      await expect(modal(page)).toHaveCount(0);
      await expect(page).toHaveURL(new RegExp(`/records/${id}$`));
      await expect.poll(() => focusIsOnTrigger(page), { message: 'focus returns to the cover' }).toBe(true);
      expect(await page.evaluate(() => history.length), 'the history is as long as it was after the one entry').toBe(entries + 1);
      /* Opened once and closed: one Back from here leaves the record. A lingering entry would need two. */
      await page.goBack();
      await expect(page).toHaveURL(/\/\?view=table$/);
    });
  }

  /* Fails against a modal that restores itself from its history entry. */
  test('a reload with it open returns to the record page with it closed', async ({ page }) => {
    const id = await seedRecord(page, true);
    await openRecord(page, id, GRID_FORK);
    await page.getByRole(TRIGGER.role, { name: TRIGGER.name }).click();
    await modal(page).waitFor();
    await page.reload();
    await page.locator('[data-cell="sleeve"] img[data-cover][data-cover-treatment]').waitFor({ timeout: 30_000 });
    await expect(modal(page)).toHaveCount(0);
    await expect(page).toHaveURL(new RegExp(`/records/${id}$`));
  });
});

test.describe('§M.1: the keyboard stays in the view, and the page beneath is held', () => {
  /* Fails against a view with no cycle: the fourth Tab lands on the page's header behind the paper. */
  test('Tab and Shift+Tab cycle within the modal, and the page beneath does not scroll', async ({ page }) => {
    const id = await seedRecord(page, true);
    await openRecord(page, id, 390, 844);
    const trigger = page.getByRole(TRIGGER.role, { name: TRIGGER.name });
    await trigger.focus();
    await page.keyboard.press('Enter');
    await modal(page).waitFor();
    const scrolled = await page.evaluate(() => window.scrollY);
    for (const key of ['Tab', 'Tab', 'Tab', 'Shift+Tab', 'Shift+Tab', 'Tab']) {
      await page.keyboard.press(key);
      expect(await page.evaluate(() => (document.querySelector('[data-sleeve-modal]') as HTMLElement).contains(document.activeElement)), `after ${key} focus is still inside`).toBe(true);
    }
    await page.mouse.move(195, 400);
    await page.mouse.wheel(0, 600);
    await page.waitForTimeout(200);
    expect(await page.evaluate(() => window.scrollY), 'the page beneath is held where it was').toBe(scrolled);
  });
});

test.describe('§M.1: the trigger works on touch', () => {
  test.use({ hasTouch: true });
  /* The tap test §M.1 names: a tap, not a click, on a touch device at 390. Fails against the page as built. */
  test('a tap on the cover opens the sleeve', async ({ page }) => {
    const id = await seedRecord(page, true);
    await openRecord(page, id, 390, 844);
    await page.locator('[data-cell="sleeve"] img[data-cover]').scrollIntoViewIfNeeded();
    const box = await page.locator('[data-cell="sleeve"] img[data-cover]').boundingBox();
    if (box === null) throw new Error('the cover has no box');
    await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
    await modal(page).waitFor({ timeout: 5_000 });
  });
});

/*
  Step 81, second unit: §M.4, §M.5's face label, and §M.6. The sleeve in the
  view, its faces fitted, its label and its controls. The turn's motion is
  the third unit's: here TURN OVER changes the face at once. The plain back
  is not asserted: its ground is held for Design, between A19's "stored
  spine colour" and the clamped field the wall draws.
*/

const FRAME = [43, 33, 24];
/* Each fixture's dimensions come from the fixtures' own manifest, which cover-fit-83 checks against the files. */
type Photo = { file: string; width: number; height: number };
const photos = JSON.parse(readFileSync(join('test', 'fixtures', 'covers', 'manifest.json'), 'utf8')) as Photo[];
const photo = (file: string): Photo => {
  const found = photos.find((p) => p.file === file);
  if (found === undefined) throw new Error(`no fixture ${file}`);
  return found;
};
const INSIDE = photo('cover-inside-1000x951.png');
const FAR = photo('cover-far-1200x900.png');
const PORTRAIT = photo('cover-outside-portrait-949x1000.png');

async function openSleeve(page: Page, id: string, width: number, height: number) {
  await openRecord(page, id, width, height);
  await page.getByRole(TRIGGER.role, { name: TRIGGER.name }).click();
  await modal(page).waitFor();
  await page.locator('[data-sleeve] img[data-sleeve-face]').evaluate((img) => (img as HTMLImageElement).decode());
  await page.mouse.move(1, height - 1);
}

const box = (page: Page, selector: string) => page.locator(selector).evaluate((el) => { const r = el.getBoundingClientRect(); return { left: r.left, top: r.top, width: r.width, height: r.height, right: r.right, bottom: r.bottom }; });

/** The square's inside, within its hairline, as pixels; and paper. */
async function readFace(page: Page) {
  const b = await box(page, '[data-sleeve]');
  const paper = await page.evaluate(() => { const k = document.createElement('canvas'); k.width = 1; k.height = 1; const x = k.getContext('2d') as CanvasRenderingContext2D; x.fillStyle = getComputedStyle(document.body).backgroundColor; x.fillRect(0, 0, 1, 1); return Array.from(x.getImageData(0, 0, 1, 1).data.slice(0, 3)); });
  const inner = b.width - 2;
  const shot = await page.screenshot({ clip: { x: b.left + 1, y: b.top + 1, width: inner, height: inner } });
  const { data, info } = await sharp(shot).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const k = info.width / inner;
  const at = (x: number, y: number): Rgb => { const px = Math.min(info.width - 1, Math.max(0, Math.round(x * k))); const py = Math.min(info.height - 1, Math.max(0, Math.round(y * k))); const i = (py * info.width + px) * 3; return [data[i], data[i + 1], data[i + 2]]; };
  return { inner, paper, at };
}

/** Fitted whole and centred: paper beyond each flank, the frame inside it, and the frame on the square's edge at each end. */
async function expectFitted(page: Page, photo: { width: number; height: number }, what: string) {
  const f = await readFace(page);
  const S = f.inner;
  const landscape = photo.width > photo.height;
  const band = (S - (S * Math.min(photo.width, photo.height)) / Math.max(photo.width, photo.height)) / 2;
  expect(band, `${what}: there is a band to read`).toBeGreaterThan(4);
  const end = (first: boolean, d: number) => (landscape ? f.at(first ? d : S - 1 - d, S / 2) : f.at(S / 2, first ? d : S - 1 - d));
  const flank = (first: boolean, d: number) => (landscape ? f.at(S / 2, first ? d : S - 1 - d) : f.at(first ? d : S - 1 - d, S / 2));
  for (const first of [true, false]) {
    const side = first ? 'first' : 'last';
    expect(near(flank(first, Math.min(3, band / 2)), f.paper, 10), `${what}: paper beyond the ${side} flank, ${flank(first, Math.min(3, band / 2))} against ${f.paper}`).toBe(true);
    expect(near(flank(first, band + 4), FRAME, 28), `${what}: the ${side} flank's frame is drawn, ${flank(first, band + 4)}`).toBe(true);
    expect(near(end(first, 4), FRAME, 28), `${what}: the ${side} end's frame is drawn, so nothing is cropped, ${end(first, 4)}`).toBe(true);
  }
}

test.describe('§M.4: the sleeve is a square, centred, the same size on every record, and every photo is fitted', () => {
  for (const [width, height] of [[390, 844], [GRID_FORK, NO_SCROLL_HEIGHT]] as const) {
    /* Fails against the first unit's view, which is empty; and, at the pixel read, against a face that crops as the page does: this fixture is inside §33's bound, so the page crops its ends away. */
    test(`at ${width} × ${height} the square is sleeveSquare’s, centred under the row with its label and controls beneath, and a photo the page crops is whole here`, async ({ page }) => {
      const id = await seedSleeve(page, INSIDE.file, null);
      await openSleeve(page, id, width, height);
      const S = sleeveSquare(width, height);
      const stack = S + MODAL_LABEL_GAP + MODAL_LABEL_LINE + MODAL_LABEL_GAP + MODAL_CONTROL;
      const sq = await box(page, '[data-sleeve]');
      expect({ width: sq.width, height: sq.height }, 'the largest square that fits').toEqual({ width: S, height: S });
      expect(sq.left, 'centred across the viewport').toBeCloseTo((width - S) / 2, 0);
      expect(sq.top, 'and, with its label and controls, down the space below the row').toBeCloseTo(MODAL_ROW + (height - MODAL_ROW - stack) / 2, 0);
      const edge = await page.locator('[data-sleeve]').evaluate((el) => { const cs = getComputedStyle(el); const row = getComputedStyle(document.querySelector('[data-sleeve-row]') as HTMLElement); return { widths: [cs.borderTopWidth, cs.borderRightWidth, cs.borderBottomWidth, cs.borderLeftWidth], colour: cs.borderTopColor, hairline: row.borderBottomColor, sizing: cs.boxSizing, radius: cs.borderRadius }; });
      expect(edge.widths, 'a 1px hairline marks the square’s edge').toEqual(['1px', '1px', '1px', '1px']);
      expect(edge.colour, 'in the hairline’s own colour').toBe(edge.hairline);
      expect({ sizing: edge.sizing, radius: edge.radius }).toEqual({ sizing: 'border-box', radius: '0px' });
      const label = await box(page, '[data-face-label]');
      const controls = await box(page, '[data-sleeve-controls]');
      expect(label.top, 'the label is 12 beneath the sleeve').toBeCloseTo(sq.bottom + MODAL_LABEL_GAP, 0);
      expect(label.height).toBe(MODAL_LABEL_LINE);
      expect(controls.top, 'and the controls 12 beneath the label').toBeCloseTo(label.bottom + MODAL_LABEL_GAP, 0);
      expect(controls.height).toBe(MODAL_CONTROL);
      expect(height - controls.bottom, 'with at least the 18 inset below').toBeGreaterThanOrEqual(MODAL_INSET - 0.5);
      expect(sq.top - MODAL_ROW, 'and above').toBeGreaterThanOrEqual(MODAL_INSET - 0.5);
      await expectFitted(page, INSIDE, 'the front');
    });
  }

  /* Fails against a square sized from the photograph. */
  test('a record with a 4:3 cover has the same square in the same place, and its photo is whole too', async ({ page }) => {
    const a = await seedSleeve(page, INSIDE.file, null);
    const b = await seedSleeve(page, FAR.file, null);
    await openSleeve(page, a, GRID_FORK, NO_SCROLL_HEIGHT);
    const first = await box(page, '[data-sleeve]');
    await openSleeve(page, b, GRID_FORK, NO_SCROLL_HEIGHT);
    expect(await box(page, '[data-sleeve]'), 'the same size on every record, and centred').toEqual(first);
    await expectFitted(page, FAR, 'the 4:3 front');
  });

  /* Fails against a square that follows the window. */
  test('the size is taken once on opening: resizing the window with it open does not change the square', async ({ page }) => {
    const id = await seedSleeve(page, INSIDE.file, null);
    await openSleeve(page, id, GRID_FORK, NO_SCROLL_HEIGHT);
    const S = sleeveSquare(GRID_FORK, NO_SCROLL_HEIGHT);
    await page.setViewportSize({ width: 1000, height: 700 });
    await page.waitForTimeout(300);
    expect(sleeveSquare(1000, 700), 'the precondition: a window whose own square differs').not.toBe(S);
    expect((await box(page, '[data-sleeve]')).width).toBe(S);
  });
});

test.describe('§M.5 and §M.6: the face label, and TURN OVER', () => {
  /* Fails against a view with no label and no control; and against a turn that moves or resizes the face, or crops the back. */
  test('the label reads FRONT, TURN OVER shows the newest back fitted in the same square and the label reads BACK, and focus stays on the control', async ({ page }) => {
    const id = await seedSleeve(page, INSIDE.file, PORTRAIT.file);
    await openSleeve(page, id, GRID_FORK, NO_SCROLL_HEIGHT);
    const label = page.locator('[data-face-label]');
    const turn = page.locator('[data-sleeve-control="turn"]');
    const type = await label.evaluate((el) => {
      const cs = getComputedStyle(el);
      const rgb = (colour: string) => { const k = document.createElement('canvas'); k.width = 1; k.height = 1; const x = k.getContext('2d') as CanvasRenderingContext2D; x.fillStyle = colour; x.fillRect(0, 0, 1, 1); return Array.from(x.getImageData(0, 0, 1, 1).data.slice(0, 3)); };
      return { size: cs.fontSize, transform: cs.textTransform, mono: /mono/i.test(cs.fontFamily), colour: rgb(cs.color), labelColour: rgb('oklch(0.44 0.008 70)'), live: el.getAttribute('aria-live') };
    });
    expect({ size: type.size, transform: type.transform, mono: type.mono, live: type.live }, '11px mono uppercase, announced politely').toEqual({ size: '11px', transform: 'uppercase', mono: true, live: 'polite' });
    expect(type.colour, 'in the label colour').toEqual(type.labelColour);
    await expect(label).toHaveText(/^front$/i);
    await expect(turn).toHaveText(/^turn over$/i);
    const front = await box(page, '[data-sleeve]');

    await turn.focus();
    await page.keyboard.press('Enter');
    await expect(label).toHaveText(/^back$/i);
    await expect(page.locator('[data-sleeve] img[data-sleeve-face="back"]')).toHaveCount(1);
    await page.locator('[data-sleeve] img[data-sleeve-face="back"]').evaluate((img) => (img as HTMLImageElement).decode());
    await expect(turn, 'it keeps its label on both faces').toHaveText(/^turn over$/i);
    expect(await page.evaluate(() => document.activeElement?.getAttribute('data-sleeve-control')), 'focus stays on the control that changed the face').toBe('turn');
    /* At rest: the third unit's turn moves the sleeve between its faces, and the claim is about where each face stands. */
    await page.locator('[data-sleeve]:not([data-turning])').waitFor();
    expect(await box(page, '[data-sleeve]'), 'the face does not change size or place across a turn').toEqual(front);
    await page.mouse.move(1, NO_SCROLL_HEIGHT - 1);
    await expectFitted(page, PORTRAIT, 'the back');

    await page.keyboard.press('Enter');
    await expect(label).toHaveText(/^front$/i);
    await expect(page.locator('[data-sleeve] img[data-sleeve-face="front"]')).toHaveCount(1);
  });

  /* Fails against a TURN OVER that is absent or inert where there is no back photograph. The plain back's ground is held and not asserted. */
  test('with no back photograph TURN OVER still turns: the label reads BACK and the front is not shown', async ({ page }) => {
    const id = await seedSleeve(page, INSIDE.file, null);
    await openSleeve(page, id, GRID_FORK, NO_SCROLL_HEIGHT);
    await page.locator('[data-sleeve-control="turn"]').click();
    await expect(page.locator('[data-face-label]')).toHaveText(/^back$/i);
    await expect(page.locator('[data-sleeve] img[data-sleeve-face="front"]')).toHaveCount(0);
  });
});

test.describe('§M.6: every control is §9.3’s, with its hover and its focus', () => {
  /* Fails against the first unit's view (no control beneath the sleeve), and against an OPEN drawn on a record whose gatefold does not open. */
  test('TURN OVER is a 44 box, 1px ink, no fill, no radius; OPEN and FOLD are absent', async ({ page }) => {
    const id = await seedSleeve(page, INSIDE.file, null);
    await openSleeve(page, id, GRID_FORK, NO_SCROLL_HEIGHT);
    const m = await page.locator('[data-sleeve-control="turn"]').evaluate((el) => {
      const cs = getComputedStyle(el);
      const rgb = (colour: string) => { const k = document.createElement('canvas'); k.width = 1; k.height = 1; const x = k.getContext('2d') as CanvasRenderingContext2D; x.fillStyle = colour; x.fillRect(0, 0, 1, 1); return Array.from(x.getImageData(0, 0, 1, 1).data); };
      return { height: el.getBoundingClientRect().height, border: [cs.borderTopWidth, cs.borderRightWidth, cs.borderBottomWidth, cs.borderLeftWidth], borderColour: rgb(cs.borderTopColor), ink: rgb(getComputedStyle(document.body).color), text: rgb(cs.color), fill: rgb(cs.backgroundColor)[3], radius: cs.borderRadius, sizing: cs.boxSizing, size: cs.fontSize, transform: cs.textTransform, mono: /mono/i.test(cs.fontFamily) };
    });
    expect(m.height).toBe(MODAL_CONTROL);
    expect(m.border).toEqual(['1px', '1px', '1px', '1px']);
    expect(m.borderColour, 'an ink box').toEqual(m.ink);
    expect(m.text, 'an ink label').toEqual(m.ink);
    expect({ fill: m.fill, radius: m.radius, sizing: m.sizing, size: m.size, transform: m.transform, mono: m.mono }).toEqual({ fill: 0, radius: '0px', sizing: 'border-box', size: '11px', transform: 'uppercase', mono: true });
    const names = await page.locator('[data-sleeve-modal] button').evaluateAll((els) => els.map((el) => (el.textContent ?? '').trim().toUpperCase()));
    expect(names.sort(), 'the modal’s controls, and no OPEN or FOLD').toEqual(['CLOSE', 'TURN OVER']);
  });

  for (const control of ['[data-sleeve-control="turn"]', '[data-sleeve-close]']) {
    /* The hover is read as computed style, which is the proxy reachable for it; the focus ring is read as pixels on all four sides. Fails against a control with neither. */
    test(`${control}: hover underlines the label 1px, 3 below the baseline (computed); keyboard focus paints a 2px ring on all four sides (pixels)`, async ({ page }) => {
      const id = await seedSleeve(page, INSIDE.file, null);
      await openSleeve(page, id, GRID_FORK, NO_SCROLL_HEIGHT);
      const el = page.locator(control);
      const line = () => el.evaluate((node) => { const cs = getComputedStyle(node); return { line: cs.textDecorationLine, thickness: cs.textDecorationThickness, offset: cs.textUnderlineOffset }; });
      expect((await line()).line, 'not underlined at rest').toBe('none');
      await el.hover();
      expect(await line(), 'hover').toEqual({ line: 'underline', thickness: '1px', offset: '3px' });
      await page.mouse.move(1, NO_SCROLL_HEIGHT - 1);

      const b = await box(page, control);
      /* Whole pixels, so the clip's own rounding cannot move a side's band off the ring. */
      const pad = 8;
      const x0 = Math.floor(b.left - pad), y0 = Math.max(0, Math.floor(b.top - pad));
      const clip = { x: x0, y: y0, width: Math.ceil(b.right + pad) - x0, height: Math.ceil(b.bottom + pad) - y0 };
      const read = async () => sharp(await page.screenshot({ clip })).removeAlpha().raw().toBuffer({ resolveWithObject: true });
      /* Pointer focus: a click on a control focuses it and draws no ring. CLOSE would close, so it is focused by script, which the browser treats as the pointer's kind here: not keyboard. */
      await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
      const rest = await read();
      /* Keyboard focus: Tab until this control holds it. */
      for (let i = 0; i < 4 && !(await el.evaluate((node) => node === document.activeElement && node.matches(':focus-visible'))); i += 1) await page.keyboard.press('Tab');
      expect(await el.evaluate((node) => node.matches(':focus-visible')), 'the keyboard is on it').toBe(true);
      const ring = await el.evaluate((node) => { const cs = getComputedStyle(node); return { width: cs.outlineWidth, style: cs.outlineStyle, offset: cs.outlineOffset }; });
      expect(ring).toEqual({ width: '2px', style: 'solid', offset: '2px' });
      const focused = await read();
      const k = rest.info.width / clip.width;
      const ox = (b.left - clip.x) * k, oy = (b.top - clip.y) * k, w = b.width * k, h = b.height * k, out = 6 * k;
      const changed = (x0: number, y0: number, x1: number, y1: number) => { let n = 0; for (let y = Math.max(0, Math.round(y0)); y < Math.min(rest.info.height, Math.round(y1)); y += 1) for (let x = Math.max(0, Math.round(x0)); x < Math.min(rest.info.width, Math.round(x1)); x += 1) { const i = (y * rest.info.width + x) * 3; if (Math.abs(rest.data[i] - focused.data[i]) + Math.abs(rest.data[i + 1] - focused.data[i + 1]) + Math.abs(rest.data[i + 2] - focused.data[i + 2]) > 30) n += 1; } return n; };
      const sides = { left: changed(ox - out, oy, ox - 1, oy + h), right: changed(ox + w + 1, oy, ox + w + out, oy + h), top: changed(ox, oy - out, ox + w, oy - 1), bottom: changed(ox, oy + h + 1, ox + w, oy + h + out) };
      /* A 2px ring along a side is two pixels deep for its whole length; three quarters of that allows for the corners and the fraction the box sits on. */
      expect(sides.left, 'the ring is painted down the left').toBeGreaterThan(1.5 * b.height * k);
      expect(sides.right, 'and the right').toBeGreaterThan(1.5 * b.height * k);
      expect(sides.top, 'and along the top').toBeGreaterThan(1.5 * b.width * k);
      expect(sides.bottom, 'and the bottom').toBeGreaterThan(1.5 * b.width * k);
    });
  }
});

/*
  Step 81, third unit: §M.5, the turn. "The turn is 180 degrees about the
  sleeve's vertical centre line." "Both are rigid rotations, re-projected
  every frame... corners are never interpolated." "Drawn in perspective
  while they move, and every face is flat and face-on at rest." "Under the
  reduced-motion setting, the turn... become[s] an immediate change of
  face, with no rotation and no fade."

  Every frame of a turn is sampled in the page: the sleeve's computed
  transform, the perspective it is seen in, its drawn box, the face and the
  label. The transform is the browser's own projection of one rotation, so
  reading it reads the motion; the drawn box is the check that the
  projection reached the screen, since a sleeve turning in perspective is
  drawn taller than itself at its near edge and one without is not.
*/

type TurnFrame = { t: number; transform: string; perspective: string; face: string | null; label: string; turning: boolean; width: number; height: number; top: number; opacity: string };

/** Presses TURN OVER and samples every animation frame until the sleeve has been at rest for three, or for `quietMs` where no turn is expected. */
const sampleTurn = (page: Page, quietMs: number) => page.evaluate(async (quiet) => {
  const sleeve = document.querySelector('[data-sleeve]') as HTMLElement;
  const stage = sleeve.parentElement as HTMLElement;
  const label = document.querySelector('[data-face-label]') as HTMLElement;
  const frames: Array<{ t: number; transform: string; perspective: string; face: string | null; label: string; turning: boolean; width: number; height: number; top: number; opacity: string }> = [];
  const started = performance.now();
  /* Focused first, as a press by keyboard or pointer leaves it: a scripted click alone does not move focus. */
  const control = document.querySelector('[data-sleeve-control="turn"]') as HTMLElement;
  control.focus();
  control.click();
  await new Promise<void>((resolve) => {
    let seen = false; let rest = 0;
    const tick = () => {
      const cs = getComputedStyle(sleeve); const r = sleeve.getBoundingClientRect();
      const turning = sleeve.hasAttribute('data-turning');
      frames.push({ t: performance.now() - started, transform: cs.transform, perspective: getComputedStyle(stage).perspective, face: sleeve.getAttribute('data-face'), label: (label.textContent ?? '').trim().toLowerCase(), turning, width: r.width, height: r.height, top: r.top, opacity: cs.opacity });
      seen = seen || turning; rest = seen && !turning ? rest + 1 : 0;
      const t = performance.now() - started;
      if ((seen && rest >= 3) || (!seen && t > quiet) || t > 6000) resolve(); else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  return frames;
}, quietMs) as Promise<TurnFrame[]>;

/** The rotation a computed transform holds: its sixteen numbers, or the identity. */
function matrix(transform: string): number[] {
  if (transform === 'none') return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  const n = transform.slice(transform.indexOf('(') + 1, -1).split(',').map(Number);
  return n.length === 16 ? n : [n[0], n[1], 0, 0, n[2], n[3], 0, 0, 0, 0, 1, 0, n[4], n[5], 0, 1];
}

test.describe('§M.5: the turn', () => {
  /* Fails against the second unit, where the face changes at once and no frame turns; against a turn drawn without perspective (the box is never taller than the square); and against a scale standing in for a rotation (the matrix is not a rotation's). */
  test('TURN OVER is one rigid half-turn about the vertical centre line, in perspective while it moves, the face and label changing edge-on, flat at rest', async ({ page }) => {
    const id = await seedSleeve(page, INSIDE.file, PORTRAIT.file);
    await openSleeve(page, id, GRID_FORK, NO_SCROLL_HEIGHT);
    const S = sleeveSquare(GRID_FORK, NO_SCROLL_HEIGHT);
    const still = await box(page, '[data-sleeve]');
    const centreY = still.top + still.height / 2;
    const frames = await sampleTurn(page, 1000);
    const moving = frames.filter((f) => f.turning);
    expect(moving.length, 'frames sampled while it turns').toBeGreaterThanOrEqual(10);

    /* First, what was drawn. The projection reached the screen: turned, the square is drawn narrower than itself, and its near edge taller. */
    expect(Math.min(...moving.map((f) => f.width)), 'drawn narrow near edge-on').toBeLessThan(S / 2);
    expect(Math.max(...moving.map((f) => f.height)), 'and taller than the square at its near edge, which only perspective does').toBeGreaterThan(S + 4);
    /* And alike above and below: the drawn box grows by the same amount past the square's top as past its bottom. */
    for (const f of moving) expect(Math.abs((f.top + f.height / 2) - centreY), `the turning sleeve stays centred on its own line at ${Math.round(f.t)}ms`).toBeLessThan(0.75);

    const angles: number[] = [];
    for (const f of moving) {
      const m = matrix(f.transform);
      /* A rotation about the vertical axis and nothing else: cos, 0, −sin / 0, 1, 0 / sin, 0, cos, with no translation. */
      expect(m[0] * m[0] + m[2] * m[2], `rigid at ${Math.round(f.t)}ms: ${f.transform}`).toBeCloseTo(1, 4);
      expect([m[1], m[4], m[5], m[6], m[9]].map((v) => Math.round(v * 1e4) / 1e4), 'no tilt, no vertical scale').toEqual([0, 0, 1, 0, 0]);
      expect(m[10]).toBeCloseTo(m[0], 4);
      expect(m[8]).toBeCloseTo(-m[2], 4);
      expect([m[12], m[13], m[14]], 'about its own centre line: it does not travel').toEqual([0, 0, 0]);
      expect([m[7], m[15]], 'and nothing else is in the projection').toEqual([0, 1]);
      /*
        Seen in perspective, from the sleeve's own centre: the transform is the rotation under one perspective at
        TURN_PERSPECTIVE sleeve-widths, whose two terms are sin / d and −cos / d. Held on the sleeve and not on the
        stage, so the vanishing point is the sleeve's centre and its top and bottom edges slope alike.
      */
      const d = S * TURN_PERSPECTIVE;
      expect(m[3], `perspective at ${Math.round(f.t)}ms`).toBeCloseTo(-m[2] / d, 6);
      expect(m[11]).toBeCloseTo(-m[0] / d, 6);
      expect(f.perspective, 'and none on the stage, whose centre is not the sleeve’s').toBe('none');
      expect(f.opacity, 'no fade').toBe('1');
      const angle = (Math.atan2(-m[2], m[0]) * 180) / Math.PI;
      angles.push(angle);
      if (f.face === 'front') expect(angle, 'the leaving face stands within 0 to 90').toBeGreaterThanOrEqual(-0.01);
      else expect(angle, 'the arriving face stands within −90 to 0, never seen from behind').toBeLessThanOrEqual(0.01);
      expect(f.label, 'the label names the face shown, in every frame').toBe(f.face);
    }
    /* One way only: the leaving face's angle rises to edge-on, the arriving face's rises from edge-on to flat. */
    const total = moving.map((f, i) => (f.face === 'front' ? angles[i] : 180 + angles[i]));
    for (let i = 1; i < total.length; i += 1) expect(total[i], `frame ${i} has not turned back`).toBeGreaterThanOrEqual(total[i - 1] - 0.01);
    const changes = moving.filter((f, i) => i > 0 && f.face !== moving[i - 1].face);
    expect(changes.length, 'the face changes once').toBe(1);
    const at = moving.indexOf(changes[0]);
    expect(total[at - 1], 'and does so edge-on: the frame before is past 60').toBeGreaterThan(60);
    expect(total[at], 'and the frame after short of 120').toBeLessThan(120);

    const lasted = moving[moving.length - 1].t - moving[0].t;
    expect(lasted, `it lasts about ${TURN_MS}ms`).toBeGreaterThan(TURN_MS * 0.8);
    expect(lasted).toBeLessThan(TURN_MS * 1.4);

    const rest = frames[frames.length - 1];
    expect({ transform: rest.transform, perspective: rest.perspective, face: rest.face, label: rest.label, width: rest.width, height: rest.height }, 'flat and face-on at rest, on the back').toEqual({ transform: 'none', perspective: 'none', face: 'back', label: 'back', width: S, height: S });
    expect(frames[0].face, 'it began on the front').toBe('front');
    expect(await page.evaluate(() => document.activeElement?.getAttribute('data-sleeve-control')), 'focus stays on the control').toBe('turn');
  });

  /* Fails against a turn that ignores the setting: frames turn. Passes against the second unit, whose change was always immediate; shown red against a build with the setting's check removed. */
  test('under reduced motion the face changes at once: no frame turns, none is in perspective, none fades', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const id = await seedSleeve(page, INSIDE.file, PORTRAIT.file);
    await openSleeve(page, id, GRID_FORK, NO_SCROLL_HEIGHT);
    expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches), 'the precondition: the setting is on').toBe(true);
    const frames = await sampleTurn(page, TURN_MS * 1.5);
    expect(frames.length, 'frames sampled').toBeGreaterThanOrEqual(10);
    expect(frames.filter((f) => f.turning).length, 'frames turning').toBe(0);
    expect([...new Set(frames.map((f) => `${f.transform} ${f.perspective} ${f.opacity}`))], 'every frame is flat, without perspective, at full strength').toEqual(['none none 1']);
    expect(frames.slice(2).every((f) => f.face === 'back' && f.label === 'back'), 'the back and its label by the third frame').toBe(true);
  });
});

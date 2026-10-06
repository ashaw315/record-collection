import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import sharp from 'sharp';
import { registerCleanup, trackArtist } from './cleanup';
import { seedImage } from './seed';
import { GRID_FORK, NO_SCROLL_HEIGHT } from '../src/app/records/[id]/band-geometry';

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

      /* The painted ground, not only the declared one: every point below the row reads as paper, so nothing of the page shows through or above. */
      await page.mouse.move(1, height - 1);
      const shot = await page.screenshot();
      const { data, info } = await sharp(shot).removeAlpha().raw().toBuffer({ resolveWithObject: true });
      const scale = info.width / width;
      for (let i = 0; i < 6; i += 1) for (let j = 0; j < 6; j += 1) {
        const x = Math.round(((i + 0.5) / 6) * width * scale);
        const y = Math.round((ROW + 2 + ((j + 0.5) / 6) * (height - ROW - 4)) * scale);
        const at = (Math.min(info.height - 1, y) * info.width + Math.min(info.width - 1, x)) * 3;
        const p = [data[at], data[at + 1], data[at + 2]];
        expect(near(p, m.paper.slice(0, 3)), `the pixel at ${Math.round(x / scale)}, ${Math.round(y / scale)} is paper ${m.paper.slice(0, 3)}: ${p}`).toBe(true);
      }
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

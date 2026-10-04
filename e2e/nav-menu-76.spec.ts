import { expect, test, type Page } from '@playwright/test';
import { registerCleanup, trackArtist } from './cleanup';

registerCleanup();

/**
 * Step 76: §G.5 and §G.8 -- the header sets on one row at every width, or it
 * becomes a menu.
 *
 * Widths measured on step 74's header before this was built (4 Oct): the
 * wordmark and five links set on one row from 584 on every screen; with the
 * record detail's slot (154.05, tracked .09em) from 762; the wordmark and the
 * control (CLOSE 39.61 + 18 a side = 75.61) from 271; the wordmark, control
 * and slot from 449. Each boundary is asserted on both sides.
 */

const PASSWORD = process.env.E2E_PASSWORD ?? 'test-password-for-e2e';
const MENU_BELOW = 584;
const SLOT_WITH_LINKS = 762;
const SLOT_WITH_CONTROL = 449;
const SECTIONS = ['Collection', 'Want list', 'Look up', 'Stats', 'Manage'];
const INK = 'oklch(0.19 0.008 60)';

async function login(page: Page) {
  await page.goto('/login');
  await page.locator('form[data-hydrated="true"]').waitFor({ timeout: 15_000 });
  await page.getByLabel('Password').pressSequentially(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL('/');
}

async function seedRecord(page: Page): Promise<string> {
  const s = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const a = await page.request.post('/api/artists', { data: { name: `Menu76-${s}` } });
  const artistId = ((await a.json()) as { id: string }).id;
  trackArtist(artistId);
  const r = await page.request.post('/api/records', { data: { title: `Menu76 ${s}`, artistId } });
  expect(r.status()).toBe(201);
  return ((await r.json()) as { id: string }).id;
}

async function open(page: Page, path: string, width: number, height = 900) {
  await page.setViewportSize({ width, height });
  await page.goto(path);
  await page.locator('[data-app-nav]').waitFor({ timeout: 20_000 });
  await page.evaluate(() => document.fonts.ready);
}

const control = (page: Page) => page.locator('[data-app-nav] [data-menu-control]');

/** What the header draws at this width: its height, whether links or control show, and the slot's place. */
const readForm = (page: Page) =>
  page.evaluate(() => {
    const header = document.querySelector('[data-app-nav]') as HTMLElement;
    const bar = (header.firstElementChild as HTMLElement).getBoundingClientRect();
    const shown = (el: Element | null) => el !== null && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
    const links = Array.from(header.querySelectorAll('nav[aria-label="Main"] a'));
    const ctl = header.querySelector('[data-menu-control]');
    const slot = header.querySelector('[data-slot="actions"]');
    return {
      height: Math.round(header.getBoundingClientRect().height),
      linksShown: links.length > 0 && links.every(shown),
      controlShown: shown(ctl),
      slotTop: slot === null ? null : slot.getBoundingClientRect().top - bar.top,
      overflow: (header.firstElementChild as HTMLElement).scrollWidth > (header.firstElementChild as HTMLElement).clientWidth + 0.5,
    };
  });

test.beforeEach(async ({ page }) => login(page));

test.describe('§G.8: one row, or a menu, at one width on every screen', () => {
  /* Fails against step 74's header, which wraps the links onto a second row below 584 and has no control. */
  test('links from 584 up; below it, the MENU control and no links; the header is 53 at every width', async ({ page }) => {
    for (const path of ['/', '/want-list', '/stats']) {
      for (const width of [320, 390, MENU_BELOW - 1, MENU_BELOW, 1000]) {
        await open(page, path, width);
        const f = await readForm(page);
        expect(f.height, `${path} at ${width}: 53`).toBe(53);
        expect(f.overflow, `${path} at ${width}: nothing overflows the row`).toBe(false);
        if (width < MENU_BELOW) {
          expect(f.controlShown, `${path} at ${width}: the control`).toBe(true);
          expect(f.linksShown, `${path} at ${width}: no links in the row`).toBe(false);
          await expect(control(page)).toHaveText('Menu');
        } else {
          expect(f.linksShown, `${path} at ${width}: the links`).toBe(true);
          expect(f.controlShown, `${path} at ${width}: no control`).toBe(false);
        }
      }
    }
  });

  /* Fails against step 74's header, which has no control to measure. */
  test('the control: 44 tall, a 1px ink box, as wide as CLOSE plus 18 a side in both states, right edge on the 18 inset, centred in the row', async ({ page }) => {
    await open(page, '/want-list', 390);
    const read = () =>
      page.evaluate(() => {
        const header = document.querySelector('[data-app-nav]') as HTMLElement;
        const bar = (header.firstElementChild as HTMLElement).getBoundingClientRect();
        const c = header.querySelector('[data-menu-control]') as HTMLElement;
        const r = c.getBoundingClientRect();
        const cs = getComputedStyle(c);
        const probe = document.createElement('span');
        probe.className = 'font-mono text-[11px] leading-none uppercase tracking-[0.12em] whitespace-nowrap';
        probe.style.position = 'absolute';
        probe.textContent = 'Close';
        document.body.appendChild(probe);
        const close = probe.getBoundingClientRect().width;
        probe.remove();
        const range = document.createRange();
        range.selectNodeContents(c);
        const label = range.getBoundingClientRect();
        const k = document.createElement('canvas'); k.width = 1; k.height = 1; const x = k.getContext('2d') as CanvasRenderingContext2D;
        x.fillStyle = cs.borderTopColor; x.fillRect(0, 0, 1, 1);
        return { top: r.top - bar.top, height: r.height, width: r.width, close, rightGap: bar.right - r.right, border: cs.borderTopWidth, borderPaint: Array.from(x.getImageData(0, 0, 1, 1).data.slice(0, 3)), radius: cs.borderTopLeftRadius, labelCentre: (label.left + label.right) / 2 - (r.left + r.right) / 2, text: (c.textContent ?? '').trim() };
      });
    const ink = await page.evaluate((c) => { const k = document.createElement('canvas'); k.width = 1; k.height = 1; const x = k.getContext('2d') as CanvasRenderingContext2D; x.fillStyle = c; x.fillRect(0, 0, 1, 1); return Array.from(x.getImageData(0, 0, 1, 1).data.slice(0, 3)); }, INK);
    const closed = await read();
    expect(closed.height, '44 tall').toBe(44);
    expect(closed.top, 'centred in the 52 row').toBe(4);
    expect(closed.width, 'CLOSE plus 18 a side').toBeCloseTo(closed.close + 36, 1);
    expect(closed.rightGap, 'right edge on the 18 inset').toBeCloseTo(18, 0);
    expect(closed.border, '1px').toBe('1px');
    expect(closed.borderPaint.every((v, i) => Math.abs(v - ink[i]) <= 1), `ink border ${closed.borderPaint} against ${ink}`).toBe(true);
    expect(closed.radius, 'no radius').toBe('0px');
    expect(Math.abs(closed.labelCentre), 'MENU centred').toBeLessThanOrEqual(0.75);
    expect(closed.text).toBe('Menu');
    await control(page).click();
    const opened = await read();
    expect(opened.text).toBe('Close');
    expect(opened.width, 'the same width open').toBeCloseTo(closed.width, 1);
  });

  /* Fails against step 74's header at 320, which wraps the links into four rows. */
  test('at 320 the wordmark and the control set on one row, 24 or more apart', async ({ page }) => {
    await open(page, '/want-list', 320);
    const m = await page.evaluate(() => {
      const header = document.querySelector('[data-app-nav]') as HTMLElement;
      const mark = (header.querySelector('[data-wordmark]') as HTMLElement).getBoundingClientRect();
      const c = (header.querySelector('[data-menu-control]') as HTMLElement).getBoundingClientRect();
      return { gap: c.left - mark.right, sameRow: Math.abs((c.top + c.bottom) / 2 - (mark.top + mark.bottom) / 2) <= 1 };
    });
    expect(m.sameRow, 'one row').toBe(true);
    expect(m.gap, 'at least 24 apart').toBeGreaterThanOrEqual(24);
  });
});

test.describe('§G.8: the open menu', () => {
  /* Fails against step 74's header: there is no control to open. */
  test('pushes the page down with five 44 rows in nav order, hairlines between and below, the current one underlined', async ({ page }) => {
    await open(page, '/want-list', 390);
    const mainBefore = await page.evaluate(() => (document.querySelector('main') as HTMLElement).getBoundingClientRect().top);
    await control(page).click();
    await expect(control(page)).toHaveAttribute('aria-expanded', 'true');
    const listId = await control(page).getAttribute('aria-controls');
    expect(listId, 'aria-controls names the list').toBeTruthy();
    const m = await page.evaluate((id) => {
      const list = document.getElementById(id as string) as HTMLElement;
      const bar = (document.querySelector('[data-app-nav] > div') as HTMLElement).getBoundingClientRect();
      const rows = Array.from(list.querySelectorAll('a')).map((a) => {
        const r = a.getBoundingClientRect();
        const range = document.createRange();
        range.selectNodeContents(a.firstChild as Node);
        const t = range.getBoundingClientRect();
        return { text: (a.textContent ?? '').trim(), height: r.height, top: r.top - bar.top, labelLeft: t.left - bar.left, border: getComputedStyle(a).borderBottomWidth, current: a.getAttribute('aria-current'), mark: a.querySelector('[data-current-mark]') !== null };
      });
      return { rows, main: (document.querySelector('main') as HTMLElement).getBoundingClientRect().top, listTop: list.getBoundingClientRect().top - bar.top, listHeight: list.getBoundingClientRect().height };
    }, listId);
    expect(m.rows.map((r) => r.text)).toEqual(SECTIONS);
    for (const r of m.rows) {
      expect(r.height, `${r.text}: 44`).toBe(44);
      expect(r.labelLeft, `${r.text}: label at the 18 inset`).toBeCloseTo(18, 0);
      expect(r.border, `${r.text}: a hairline below`).toBe('1px');
    }
    expect(m.listTop, 'directly below the 52 row').toBe(52);
    expect(m.rows.filter((r) => r.current === 'page').map((r) => [r.text, r.mark])).toEqual([['Want list', true]]);
    expect(m.main - mainBefore, 'the page moved down by the list').toBeCloseTo(m.listHeight, 0);
  });

  /* Fails against step 74's header: no control, so no keyboard to drive it. */
  test('Enter and Space toggle it; Escape closes it and returns focus to the control', async ({ page }) => {
    await open(page, '/want-list', 390);
    await control(page).focus();
    await page.keyboard.press('Enter');
    await expect(control(page)).toHaveAttribute('aria-expanded', 'true');
    await page.keyboard.press('Space');
    await expect(control(page)).toHaveAttribute('aria-expanded', 'false');
    await page.keyboard.press('Space');
    await expect(control(page)).toHaveAttribute('aria-expanded', 'true');
    await page.locator('[data-menu-list] a').first().focus();
    await page.keyboard.press('Escape');
    await expect(control(page)).toHaveAttribute('aria-expanded', 'false');
    expect(await page.evaluate(() => document.activeElement?.hasAttribute('data-menu-control') ?? false), 'focus is back on the control').toBe(true);
  });

  /* Fails against step 74's header: no control. */
  test('it stays open on scroll and on a click elsewhere, and a chosen link renders the next screen closed', async ({ page }) => {
    await open(page, '/want-list', 390, 500);
    await control(page).click();
    await page.mouse.wheel(0, 300);
    await page.waitForTimeout(200);
    await page.mouse.click(200, 480);
    await expect(control(page)).toHaveAttribute('aria-expanded', 'true');
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.locator('[data-menu-list] a', { hasText: 'Stats' }).click();
    await expect(page).toHaveURL(/\/stats$/);
    await expect(control(page)).toHaveAttribute('aria-expanded', 'false');
    await expect(page.locator('[data-menu-list]')).toHaveCount(0);
  });

  /* Fails against step 74's header: no menu to open. */
  test('the wall’s height variable follows the open menu', async ({ page }) => {
    await open(page, '/', 390);
    await control(page).click();
    await page.waitForTimeout(200);
    const m = await page.evaluate(() => ({ header: (document.querySelector('[data-app-nav]') as HTMLElement).getBoundingClientRect().height, variable: parseFloat(document.documentElement.style.getPropertyValue('--app-nav-height')) }));
    expect(m.header, 'the open header is taller than 53').toBeGreaterThan(53);
    expect(m.variable, 'and the variable says so').toBeCloseTo(m.header, 0);
  });
});

test.describe('§G.8: the record detail’s four forms, each boundary from both sides', () => {
  /* Fails against step 74's header: the slot took its own row everywhere below 1440 and the links wrapped below 584. */
  test('links and slot in line from 762; links with the slot below from 584; control and slot in line from 449; control with the slot below under it', async ({ page }) => {
    const id = await seedRecord(page);
    const cases: Array<[number, boolean, boolean]> = [
      /* width, links shown, slot in line */
      [1000, true, true],
      [SLOT_WITH_LINKS, true, true],
      [SLOT_WITH_LINKS - 1, true, false],
      [MENU_BELOW, true, false],
      [MENU_BELOW - 1, false, true],
      [SLOT_WITH_CONTROL, false, true],
      [SLOT_WITH_CONTROL - 1, false, false],
      [390, false, false],
    ];
    for (const [width, links, inline] of cases) {
      await open(page, `/records/${id}`, width);
      const f = await readForm(page);
      expect(f.linksShown, `${width}: links ${links ? 'shown' : 'in the menu'}`).toBe(links);
      expect(f.controlShown, `${width}: control ${links ? 'absent' : 'shown'}`).toBe(!links);
      expect(f.overflow, `${width}: nothing overflows`).toBe(false);
      if (inline) {
        expect(f.height, `${width}: one row, 53`).toBe(53);
      } else {
        expect(f.slotTop, `${width}: the slot on its own row below the 52`).toBeGreaterThanOrEqual(52);
        expect(f.height, `${width}: 53 and the slot's row`).toBeGreaterThan(53);
      }
    }
  });

  /* Fails against step 74's header: no menu. The slot is the record's, not the app's, so it stays out of the list and below it. */
  test('open at 390, the slot sits below the list, outside it', async ({ page }) => {
    const id = await seedRecord(page);
    await open(page, `/records/${id}`, 390);
    await control(page).click();
    const m = await page.evaluate(() => {
      const list = document.querySelector('[data-menu-list]') as HTMLElement;
      const slot = document.querySelector('[data-slot="actions"]') as HTMLElement;
      return { listBottom: list.getBoundingClientRect().bottom, slotTop: slot.getBoundingClientRect().top, inList: list.contains(slot) };
    });
    expect(m.inList, 'not in the menu').toBe(false);
    expect(m.slotTop, 'below the list').toBeGreaterThanOrEqual(m.listBottom - 0.5);
  });
});

test.describe('the links’ hit area is a 44 overlay, not the link’s box', () => {
  /**
   * Replaces nav-mobile's box measure. That spec read each link's own box,
   * which the 11px type made 11 tall; but the app's answer to hit size is an
   * overlay -- the record page's controls take theirs from a 44 ::before --
   * and a box measure cannot see an overlay, so it would fail against every
   * control the app already has. What a reader meets is where a tap lands, so
   * this taps 1px inside the 44 area's top and bottom and asks which link it
   * reached.
   */
  /* Fails against step 74's header, whose links had no overlay: a tap 16px above the type landed on the header, not the link. */
  test('a tap anywhere in the 44 around a link lands on that link', async ({ page }) => {
    await open(page, '/want-list', 1440);
    const m = await page.evaluate(() =>
      Array.from(document.querySelectorAll('[data-app-nav] nav[aria-label="Main"] a')).map((a) => {
        const r = a.getBoundingClientRect();
        const x = (r.left + r.right) / 2;
        const cy = (r.top + r.bottom) / 2;
        const hit = (y: number) => (document.elementFromPoint(x, y)?.closest('a')?.textContent ?? 'none').trim();
        return { text: (a.textContent ?? '').trim(), top: hit(cy - 21), bottom: hit(cy + 21), outside: hit(cy - 23) };
      }),
    );
    for (const l of m) {
      expect(l.top, `${l.text}: 21 above centre`).toBe(l.text);
      expect(l.bottom, `${l.text}: 21 below centre`).toBe(l.text);
      expect(l.outside, `${l.text}: 23 above centre is outside it`).not.toBe(l.text);
    }
  });
});

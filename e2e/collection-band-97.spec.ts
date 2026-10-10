import { expect, test, type Page } from '@playwright/test';
import { login } from './sign-in';

/**
 * Step 97a, §T.1 to §T.3: the table and grid take the shelf's band and the
 * record page's vocabulary.
 *
 * "What they share with the shelf is §W.24's search field and its row of
 * view names ... The views' own search field goes, and the band's takes its
 * place." The band is the two-row form at every width, since these views
 * have no rail (§T.1), and its search field takes the record page's title
 * measure, 443, wherever the window has it and the width less the 20 insets
 * where it has not (the coordinator's ruling of 8 Oct on §T.1).
 *
 * Read on the seeded seventeen. Counts that reach the target are measured
 * on the real collection by the survey sheet, not here.
 */
/*
  Ink, oklch(0.19 0.008 60), and the label colour, oklch(0.44 0.008 70). The
  browser reports a colour set by a class as lab() and one set inline as the
  oklch() it was written in; both spellings are the one colour.
*/
const INK = ['lab(6.18075 1.20374 2.12039)', 'oklch(0.19 0.008 60)'];
const LABEL_INK = ['lab(35.0433 0.937879 2.8959)', 'oklch(0.44 0.008 70)'];
const VIEWS = ['table', 'grid'] as const;
/*
  The widest window these read the two-row band at. It was 1440 until step
  113, where the band above the sidebar's fork (1054) became the sidebar's
  head: `sidebar-113.spec.ts` reads it there.
*/
const BAND_WIDE = 1024;

async function open(page: Page, view: (typeof VIEWS)[number], width: number, height = 900) {
  await page.setViewportSize({ width, height });
  await page.goto(`/?view=${view}`);
  await page.locator('[data-collection-band] #rail-search').waitFor({ timeout: 30_000 });
  await page.addStyleTag({ content: 'nextjs-portal{display:none!important}' });
}

test.beforeEach(async ({ page }) => login(page));

for (const view of VIEWS) {
  test.describe(`§T.1: the ${view} view takes the shelf's band`, () => {
    /* Fails against the built views, which carry a search field, a Search button and a switch of their own, and no band. */
    test('the band’s search field and view names are there, and the view’s own are gone', async ({ page }) => {
      await open(page, view, BAND_WIDE);
      const band = page.locator('[data-collection-band]');
      await expect(band.locator('#rail-search')).toBeVisible();
      await expect(band.getByRole('link', { name: 'Shelf', exact: true })).toBeVisible();
      await expect(band.getByRole('link', { name: view === 'table' ? 'Table' : 'Grid', exact: true })).toHaveAttribute('aria-current', 'page');
      await expect(page.locator('#collection-search')).toHaveCount(0);
      await expect(page.locator('main [role="group"][aria-label="View"]')).toHaveCount(0);
      /* §T.3 ruled no button on 8 Oct and withdrew that at step 113 (`T.3/search-no-button`): the glyph is the field's control. The no-JavaScript Apply stays hidden. */
      const buttons = await page.locator('main form[role="search"] button').evaluateAll((all) => all.map((b) => ({ text: (b.textContent ?? '').trim() || (b.getAttribute('aria-label') ?? ''), drawn: b.getBoundingClientRect().width > 1 })));
      expect(buttons).toEqual([{ text: 'Search', drawn: true }, { text: 'Apply', drawn: false }]);
    });

    for (const [width, field] of [[320, 280], [390, 350], [482, 442], [483, 443], [BAND_WIDE, 443]] as const) {
      /* Fails against a band that is a rail when wide, and against a field given the band's whole width: 1400 at 1440. */
      test(`at ${width} the band is two rows and the search field is ${field} wide at the 20 inset`, async ({ page }) => {
        await open(page, view, width);
        const m = await page.evaluate(() => {
          const box = (sel: string) => { const r = (document.querySelector(sel) as HTMLElement).getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width }; };
          const names = Array.from(document.querySelectorAll('[data-collection-band] ul[aria-label="View"] a')).map((a) => a.getBoundingClientRect());
          const add = Array.from(document.querySelectorAll('[data-collection-band] a')).find((a) => (a.textContent ?? '').trim() === 'Add record') as HTMLElement;
          return { field: box('[data-collection-band] #rail-search'), namesTop: Math.min(...names.map((r) => r.top)), nameTops: names.map((r) => Math.round(r.top)), nameLeft: names[0].left, add: add.getBoundingClientRect().toJSON() as { top: number; right: number; bottom: number }, names: names.map((r) => ({ left: r.left, right: r.right })), scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth };
        });
        expect(m.field.width, 'the field’s width').toBeCloseTo(field, 0);
        expect(m.field.left, 'at the left inset').toBeCloseTo(20, 0);
        expect(m.namesTop, 'the view names are a row beneath the field').toBeGreaterThanOrEqual(m.field.bottom);
        expect(new Set(m.nameTops).size, 'the three names are one row').toBe(1);
        expect(m.nameLeft, 'the names start at the left inset').toBeCloseTo(20, 0);
        expect(m.add.right, 'Add record ends at the right inset').toBeCloseTo(width - 20, 0);
        expect(m.add.top, 'Add record is on the names’ row').toBeLessThan(m.namesTop + 20);
        expect(m.scroll, 'and the page is no wider than the window').toBe(m.client);
      });
    }

    /* Fails against the built header: the count is a 15 line under the heading, and Add record is an oxblood button. */
    test('the count is an 11 label directly above the 40 heading, and Add record is one ink link in the band', async ({ page }) => {
      await open(page, view, BAND_WIDE);
      const m = await page.evaluate(() => {
        const type = (el: Element) => { const cs = getComputedStyle(el); return { size: cs.fontSize, color: cs.color, transform: cs.textTransform, family: cs.fontFamily.includes('Mono') || cs.fontFamily.includes('mono') }; };
        const h1 = document.querySelector('main h1') as HTMLElement;
        const count = document.querySelector('[data-collection-count]') as HTMLElement;
        /* The ones drawn: above the sidebar's fork the content column carries its own and the band's is not drawn, and here it is the other way. */
        const adds = Array.from(document.querySelectorAll('main a')).filter((a) => (a.textContent ?? '').trim() === 'Add record' && a.getClientRects().length > 0);
        const add = adds[0] as HTMLElement;
        return { heading: { text: h1.textContent, ...type(h1) }, count: { text: (count.textContent ?? '').trim(), ...type(count), next: count.nextElementSibling === h1, bottom: count.getBoundingClientRect().bottom, headingTop: h1.getBoundingClientRect().top }, adds: adds.length, add: { ...type(add), background: getComputedStyle(add).backgroundColor, inBand: add.closest('[data-collection-band]') !== null } };
      });
      expect(m.heading).toMatchObject({ text: 'Collection', size: '40px' });
      expect(INK, 'the heading is ink').toContain(m.heading.color);
      expect(m.count.text).toMatch(/^\d+ records?$/i);
      expect(m.count).toMatchObject({ size: '11px', transform: 'uppercase', family: true, next: true });
      expect(LABEL_INK, 'the count is the label colour').toContain(m.count.color);
      expect(m.count.bottom, 'small first, large beneath').toBeLessThanOrEqual(m.count.headingTop);
      expect(m.adds, 'one Add record').toBe(1);
      expect(m.add).toMatchObject({ size: '11px', background: 'rgba(0, 0, 0, 0)', inBand: true });
      expect(INK, `Add record is ink: ${m.add.color}`).toContain(m.add.color);
    });

    for (const width of [390, 1440]) {
      /* Fails against the built views: seven sizes, the muted grey, oxblood on the active chip and the button, and radii of 2, 2.4 and 3. */
      test(`at ${width} every drawn text is 40, 13 or 11, in ink or the label colour, and no corner is rounded`, async ({ page }) => {
        await open(page, view, width);
        const m = await page.evaluate(() => {
          const drawn = (el: Element) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 1 && r.height > 1 && cs.visibility !== 'hidden' && cs.clip !== 'rect(0px, 0px, 0px, 0px)'; };
          const sizes = new Map<string, string>();
          const colours = new Map<string, string>();
          const radii: string[] = [];
          const fills: string[] = [];
          for (const el of Array.from(document.querySelectorAll('main, main *'))) {
            if (!drawn(el)) continue;
            const cs = getComputedStyle(el);
            const what = `${el.tagName.toLowerCase()} "${(el.textContent ?? '').trim().slice(0, 24)}"`;
            if (cs.borderTopLeftRadius !== '0px' || cs.borderBottomRightRadius !== '0px') radii.push(`${what} ${cs.borderTopLeftRadius}`);
            if (cs.backgroundColor.includes('0.36 0.098 18')) fills.push(what);
            const own = Array.from(el.childNodes).some((n) => n.nodeType === Node.TEXT_NODE && (n.textContent ?? '').trim() !== '');
            /* The band's search field is §W.24's, typed at 16; it is the shelf's and not restated here. */
            if (!own && !(el instanceof HTMLSelectElement)) continue;
            if (el.id === 'rail-search') continue;
            if (!sizes.has(cs.fontSize)) sizes.set(cs.fontSize, what);
            if (!colours.has(cs.color)) colours.set(cs.color, what);
          }
          return { sizes: Object.fromEntries(sizes), colours: Object.fromEntries(colours), radii, fills };
        });
        expect(Object.keys(m.sizes).filter((s) => !['40px', '13px', '11px'].includes(s)).map((s) => `${s}: ${m.sizes[s]}`), 'sizes outside the three').toEqual([]);
        expect(Object.keys(m.colours).filter((c) => ![...INK, ...LABEL_INK].includes(c)).map((c) => `${c}: ${m.colours[c]}`), 'colours outside ink and the label colour').toEqual([]);
        expect(m.radii, 'rounded corners').toEqual([]);
        expect(m.fills, 'oxblood fills').toEqual([]);
      });
    }

    /* Fails against a band whose links have only their drawn boxes: 11 tall. Read by what a tap at each point reaches. */
    test(`each view name and Add record is tappable over 44, at 390 and at ${BAND_WIDE}`, async ({ page }) => {
      for (const width of [390, BAND_WIDE]) {
        await open(page, view, width);
        const reach = await page.evaluate(() => Array.from(document.querySelectorAll<HTMLElement>('[data-collection-band] ul[aria-label="View"] a, [data-collection-band] nav > a')).map((a) => {
          const r = a.getBoundingClientRect();
          const x = r.left + r.width / 2;
          const mid = r.top + r.height / 2;
          let hit = 0;
          for (let y = Math.round(mid - 30); y <= Math.round(mid + 30); y += 1) { const at = document.elementFromPoint(x, y); if (at !== null && (at === a || a.contains(at))) hit += 1; }
          return { name: (a.textContent ?? '').trim(), hit };
        }));
        expect(reach.map((r) => r.name), `at ${width}`).toEqual(['Shelf', 'Table', 'Grid', 'Add record']);
        for (const r of reach) expect(r.hit, `${r.name} at ${width}: rows of pixels a tap reaches`).toBeGreaterThanOrEqual(44);
      }
    });
  });
}

test.describe('§T.3: search is the band’s, and it is submitted', () => {
  /* Fails against a band whose form drops the view: the search would land on the shelf. */
  test('Enter in the band’s field searches and stays in the table view', async ({ page }) => {
    await open(page, 'table', 1440);
    await page.locator('#rail-search').fill('zzzz-no-such-record');
    await expect(page, 'nothing is searched as it is typed').toHaveURL(/\?view=table$/);
    await page.locator('#rail-search').press('Enter');
    await expect(page).toHaveURL(/view=table/);
    await expect(page).toHaveURL(/q=zzzz-no-such-record/);
    await expect(page.locator('[data-collection-count]')).toHaveText(/^0 of \d+ records$/i);
  });

  /* Fails against the built views, whose switch is not drawn below 640: the grid could not be reached on a phone. */
  test('the grid is reached from the table at 390 by the band’s view name', async ({ page }) => {
    await open(page, 'table', 390);
    await page.locator('[data-collection-band]').getByRole('link', { name: 'Grid', exact: true }).click();
    await expect(page).toHaveURL(/view=grid/);
    await expect(page.locator('[data-collection-band]').getByRole('link', { name: 'Grid', exact: true })).toHaveAttribute('aria-current', 'page');
  });
});

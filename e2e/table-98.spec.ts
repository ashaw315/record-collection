import { expect, test, type Page } from '@playwright/test';
import { registerCleanup, trackArtist, trackCreated } from './cleanup';
import { removeRecordsFor, seedRecords } from './seed';
import { login } from './sign-in';

registerCleanup();

/**
 * Step 98, §T.4: the table.
 *
 * "Rows are at least 44 tall and as tall as their content, with a hairline
 * between them and no fill. 44 is the floor, because a row is one link to
 * its record." Text left, figures right in tabular figures; 11 headers, the
 * sorted one in ink with §3's underline and an arrow; §T.5's Sort control
 * at every width, since Date bought and Artist have no header; the header
 * row stuck to the top of the viewport, the app's header having scrolled
 * away (§G.6, pinned by `nav-type-74`).
 *
 * Read on fixtures made here. Which columns survive at 390 and 320 on the
 * real collection is the sheet's to report.
 */
/* Ink is set inline on a sorted header, so it reads as written. */
const INK = 'oklch(0.19 0.008 60)';
const LABEL_INK = 'lab(35.0433 0.937879 2.8959)';
/* §W.27's surface one step below paper, oklch(0.731 0.004 80), as written inline. */
const SURFACE = 'oklch(0.731 0.004 80)';

type Fixture = { suffix: string; artistId: string; genreId: string; childId: string; ids: string[] };

async function seed(page: Page): Promise<Fixture> {
  const suffix = `t98${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
  const post = async (path: string, data: unknown) => {
    const response = await page.request.post(path, { data, failOnStatusCode: false });
    expect(response.status(), `${path} ${JSON.stringify(data)}`).toBe(201);
    const body = (await response.json()) as { id: string };
    trackCreated(path, body);
    return body;
  };
  const genre = await post('/api/genres', { name: `Beat-${suffix}` });
  const child = await post('/api/genres', { name: `Mersey-${suffix}`, parentGenreId: genre.id });
  const label = await post('/api/labels', { name: `Oriole-${suffix}` });
  const artist = await post('/api/artists', { name: `Faron-${suffix}` });
  trackArtist(artist.id);
  const a = await post('/api/records', { title: `Alpha ${suffix}`, artistId: artist.id, labelId: label.id, releaseYear: 1963, conditionMedia: 'VG+', purchasePrice: '12.50', genreIds: [child.id] });
  const b = await post('/api/records', { title: `Bravo ${suffix}`, artistId: artist.id, releaseYear: 1961, purchasePrice: '8.00' });
  const c = await post('/api/records', { title: `Charlie ${suffix}`, artistId: artist.id, releaseYear: 1965, purchasePrice: '110.00' });
  return { suffix, artistId: artist.id, genreId: genre.id, childId: child.id, ids: [a.id, b.id, c.id] };
}

async function open(page: Page, query: string, width = 1440, height = 800) {
  await page.setViewportSize({ width, height });
  await page.goto(`/?view=table${query}`);
  await page.locator('[data-collection-filters][data-hydrated="true"]').waitFor({ timeout: 30_000 });
  await page.locator('main table tbody tr').first().waitFor({ timeout: 30_000 });
  await page.addStyleTag({ content: 'nextjs-portal{display:none!important}' });
}

const titles = (page: Page) => page.locator('main table tbody tr').evaluateAll((rows) => rows.map((r) => (r.querySelector('a')?.textContent ?? '').trim()));

test.beforeEach(async ({ page }) => login(page));

/* Fails against the built rows: 57.5 tall with two lines, where the link is the title's text and the rest of the row goes nowhere. */
test('a row is at least 44, hairlined and unfilled, and the whole of it is one link to its record', async ({ page }) => {
  const f = await seed(page);
  await open(page, `&artistId=${f.artistId}&sort=title:asc`);
  const m = await page.locator('main table tbody tr').evaluateAll((rows) => rows.map((r) => {
    const cs = getComputedStyle(r);
    const box = r.getBoundingClientRect();
    return { height: box.height, links: r.querySelectorAll('a').length, fill: cs.backgroundColor, rule: getComputedStyle(r.querySelector('td') as HTMLElement).borderBottomWidth, right: box.right, mid: box.top + box.height / 2 };
  }));
  expect(m.length).toBe(3);
  for (const row of m) {
    expect(row.height, 'a row of title and artist is the floor exactly, its hairline included').toBe(44);
    expect(row.links, 'one link').toBe(1);
    expect(row.fill, 'no fill').toBe('rgba(0, 0, 0, 0)');
  }
  expect(m[0].rule, 'a hairline beneath a row').toBe('1px');
  /* The far end of the row, in the Paid column, well clear of the title's text. */
  await page.mouse.click(m[1].right - 12, m[1].mid);
  await expect(page).toHaveURL(new RegExp(`/records/${f.ids[1]}$`), { timeout: 20_000 });
});

/* Fails against the built cells: figures in a mono face with the grade right-aligned among them, and headers in the muted grey at 500. */
test('text is left and figures right in tabular figures, under 11 label headers', async ({ page }) => {
  const f = await seed(page);
  await open(page, `&artistId=${f.artistId}&sort=title:asc`);
  const m = await page.evaluate(() => {
    const heads = Array.from(document.querySelectorAll<HTMLElement>('main table thead th')).map((th) => { const cs = getComputedStyle(th); const inner = (th.querySelector('[data-sort-header], span') ?? th) as HTMLElement; const ics = getComputedStyle(inner); return { name: (th.textContent ?? '').replace(/[↑↓]/g, '').trim(), size: ics.fontSize, transform: ics.textTransform, align: cs.textAlign }; });
    const row = document.querySelector('main table tbody tr') as HTMLElement;
    const cells = Array.from(row.querySelectorAll<HTMLElement>('td')).map((td) => { const cs = getComputedStyle(td); return { text: (td.textContent ?? '').trim().slice(0, 12), align: cs.textAlign, numeric: cs.fontVariantNumeric, size: cs.fontSize }; });
    return { heads, cells };
  });
  expect(m.heads.map((h) => h.name)).toEqual(['Record', 'Label', 'Format', 'Year', 'Cond.', 'Paid']);
  for (const h of m.heads) expect(h, h.name).toMatchObject({ size: '11px', transform: 'uppercase' });
  expect(m.heads.map((h) => h.align), 'a header sits over its column’s edge').toEqual(['left', 'left', 'left', 'right', 'left', 'right']);
  expect(m.cells.map((c) => c.align)).toEqual(['left', 'left', 'left', 'right', 'left', 'right']);
  expect(m.cells[3].numeric, 'the year').toContain('tabular-nums');
  expect(m.cells[5].numeric, 'the price').toContain('tabular-nums');
  for (const c of m.cells) expect(c.size, c.text).toBe('13px');
});

/* Fails against headers that are only headings: nothing marks the sorted column and pressing one does nothing. */
test('a header is a sort control: the sorted one is ink, underlined, with its arrow, and pressing it sorts and then reverses', async ({ page }) => {
  const f = await seed(page);
  await open(page, `&artistId=${f.artistId}`);
  const header = (name: string) => page.locator('main table thead [data-sort-header]').filter({ hasText: name });
  const read = (name: string) => header(name).evaluate((el) => { const cs = getComputedStyle(el); const label = el.querySelector('[data-sort-name]') as HTMLElement; const ls = getComputedStyle(label); return { text: (el.textContent ?? '').trim(), colour: cs.color, line: ls.textDecorationLine, thickness: ls.textDecorationThickness, sorted: el.closest('th')?.getAttribute('aria-sort') ?? null }; });

  expect(await page.locator('main table thead [data-sort-header]').evaluateAll((all) => all.map((el) => (el.textContent ?? '').trim())), 'the three orders that have a column').toEqual(['Record', 'Year', 'Paid']);
  expect(await read('Year')).toEqual({ text: 'Year', colour: LABEL_INK, line: 'none', thickness: expect.any(String), sorted: null });

  await header('Year').click();
  await expect(page).toHaveURL(/sort=releaseYear%3Aasc|sort=releaseYear:asc/, { timeout: 15_000 });
  await expect.poll(() => titles(page)).toEqual([`Bravo ${f.suffix}`, `Alpha ${f.suffix}`, `Charlie ${f.suffix}`]);
  expect(await read('Year')).toEqual({ text: 'Year ↑', colour: INK, line: 'underline', thickness: '2px', sorted: 'ascending' });
  expect((await read('Paid')).colour, 'the others stay labels').toBe(LABEL_INK);

  await header('Year').click();
  await expect(page).toHaveURL(/sort=releaseYear(%3A|:)desc/, { timeout: 15_000 });
  await expect.poll(() => titles(page)).toEqual([`Charlie ${f.suffix}`, `Alpha ${f.suffix}`, `Bravo ${f.suffix}`]);
  expect(await read('Year')).toMatchObject({ text: 'Year ↓', sorted: 'descending' });

  await header('Paid').click();
  await expect(page).toHaveURL(/sort=purchasePrice(%3A|:)asc/, { timeout: 15_000 });
  await expect.poll(() => titles(page)).toEqual([`Bravo ${f.suffix}`, `Alpha ${f.suffix}`, `Charlie ${f.suffix}`]);
  expect((await read('Year')).sorted, 'one marked at a time').toBeNull();
});

for (const width of [390, 1440]) {
  /* Fails against the built select: 36 tall, "Sort: default", and no way to read the order from it without opening it. */
  test(`at ${width} the Sort control names the current order, is a 44 control, and reaches the two orders no header carries`, async ({ page }) => {
    const f = await seed(page);
    await open(page, `&artistId=${f.artistId}`, width);
    const control = page.locator('[data-sort-control]');
    await expect(control.locator('[data-sort-current]')).toHaveText('Sort · Default');
    expect(await control.evaluate((el) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el.querySelector('[data-sort-current]') as HTMLElement); return { height: r.height, size: cs.fontSize, transform: cs.textTransform }; })).toEqual({ height: 44, size: '11px', transform: 'uppercase' });
    /* The select lies over the whole control, so a tap anywhere on it opens the list. */
    /* Every one of its 44 rows of pixels: the control's own underline took the last, and a press there opened nothing (measured on the real collection, 43). */
    expect(await control.evaluate((el) => { const r = el.getBoundingClientRect(); let n = 0; for (let y = Math.round(r.top); y < Math.round(r.top) + 44; y += 1) if (document.elementFromPoint(r.left + r.width / 2, y)?.tagName === 'SELECT') n += 1; return n; })).toBe(44);

    await control.locator('select').selectOption('purchaseDate:desc');
    await expect(page).toHaveURL(/sort=purchaseDate(%3A|:)desc/, { timeout: 15_000 });
    await expect(control.locator('[data-sort-current]')).toHaveText('Sort · Date bought ↓');
    await control.locator('select').selectOption('artist:asc');
    await expect(control.locator('[data-sort-current]')).toHaveText('Sort · Artist ↑', { timeout: 15_000 });
    await expect(page.locator('main table thead th[aria-sort]'), 'no header claims an order it does not carry').toHaveCount(0);
  });
}

test.describe('with a page of fifty', () => {
  let artistId = '';
  test.beforeEach(async ({ page }) => {
    const suffix = `p98${Date.now().toString(36)}`;
    const artist = (await (await page.request.post('/api/artists', { data: { name: `Fifty-${suffix}` } })).json()) as { id: string };
    trackArtist(artist.id);
    artistId = artist.id;
    await seedRecords(artist.id, 'Row', suffix, 60);
  });
  test.afterEach(async () => { await removeRecordsFor(artistId); });

  for (const width of [390, 1440]) {
    /* Fails against the built table: its header scrolls away with the page, and its scrolling wrapper would stop any sticking. */
    test(`at ${width} the header row stays at the top of the viewport while the table scrolls, on paper`, async ({ page }) => {
      await open(page, `&artistId=${artistId}`, width, 800);
      const before = await page.locator('main table thead th').first().evaluate((th) => th.getBoundingClientRect().top);
      expect(before, 'it starts below the band, in the page').toBeGreaterThan(200);
      await page.evaluate(() => window.scrollTo(0, 1500));
      await page.waitForTimeout(150);
      const m = await page.evaluate(() => {
        const ths = Array.from(document.querySelectorAll<HTMLElement>('main table thead th'));
        const rows = Array.from(document.querySelectorAll<HTMLElement>('main table tbody tr'));
        const header = document.querySelector('[data-app-nav]') as HTMLElement;
        return { scrolled: window.scrollY, tops: ths.filter((th) => th.getBoundingClientRect().width > 0).map((th) => Math.round(th.getBoundingClientRect().top)), fills: ths.map((th) => getComputedStyle(th).backgroundColor), rowsAbove: rows.filter((r) => r.getBoundingClientRect().bottom < 0).length, appHeaderBottom: header.getBoundingClientRect().bottom, paper: getComputedStyle(document.body).backgroundColor };
      });
      expect(m.scrolled, 'the page did scroll').toBe(1500);
      expect(m.rowsAbove, 'rows have gone past the top').toBeGreaterThan(5);
      expect(m.appHeaderBottom, 'the app’s header has scrolled away (§G.6), so the row sticks at 0').toBeLessThanOrEqual(0);
      expect([...new Set(m.tops)], 'every header cell is at the top of the viewport').toEqual([0]);
      expect([...new Set(m.fills)], 'on paper, so the rows pass beneath it unseen').toEqual([m.paper]);
    });
  }

  /* Fails against a table wider than a phone, which the built one avoided only by scrolling inside a wrapper. */
  test('the table is no wider than the window at 390 and 320, with nothing scrolling inside it', async ({ page }) => {
    for (const width of [390, 320]) {
      await open(page, `&artistId=${artistId}`, width);
      const m = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth, table: (document.querySelector('main table') as HTMLElement).getBoundingClientRect().width, inner: Array.from(document.querySelectorAll('main *')).filter((el) => ['auto', 'scroll'].includes(getComputedStyle(el).overflowX)).length }));
      expect(m.scroll, `the page at ${width}`).toBe(m.client);
      expect(m.table, `the table at ${width}`).toBeLessThanOrEqual(width - 40 + 0.5);
      expect(m.inner, 'no scrolling box').toBe(0);
    }
  });
});

/* Fails against the built hover, which lifts a row to a surface lighter than paper, and against a ring drawn outside the row. */
test('under a pointer a row sinks to §W.27’s surface, and keyboard focus rings the row from inside', async ({ page }) => {
  const f = await seed(page);
  await open(page, `&artistId=${f.artistId}&sort=title:asc`);
  const row = page.locator('main table tbody tr').nth(1);
  await row.hover();
  await expect.poll(() => row.evaluate((r) => getComputedStyle(r).backgroundColor)).toBe(SURFACE);
  await page.mouse.move(5, 5);

  await row.locator('a').focus();
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Tab');
  const ring = await row.evaluate((r) => {
    const a = r.querySelector('a') as HTMLElement;
    const after = getComputedStyle(a, '::after');
    return { focused: document.activeElement === a, rowPosition: getComputedStyle(r).position, position: after.position, inset: [after.top, after.right, after.bottom, after.left], shadow: after.boxShadow, outline: getComputedStyle(a).outlineStyle };
  });
  expect(ring.focused).toBe(true);
  expect(ring).toMatchObject({ rowPosition: 'relative', position: 'absolute', inset: ['0px', '0px', '0px', '0px'], outline: 'none' });
  expect(ring.shadow, 'an ink ring drawn inside the row').toMatch(/inset/);
  expect(ring.shadow).toContain('2px');
});

/* Fails against a row held to 44: the reason a record matched, and the label and condition below 768, would be cut off. */
test('a row is as tall as its content: the match reason under a genre filter, and the label and condition line below 768', async ({ page }) => {
  const f = await seed(page);
  await open(page, `&artistId=${f.artistId}&genreId=${f.genreId}`);
  const wide = await page.locator('main table tbody tr').first().evaluate((r) => ({ height: r.getBoundingClientRect().height, text: r.textContent ?? '', clipped: r.scrollHeight > r.clientHeight + 1 }));
  expect(wide.text).toContain(`in Beat-${f.suffix} via Mersey-${f.suffix}`);
  expect(wide.height, 'taller than the floor, by its third line').toBeGreaterThan(44);
  expect(wide.clipped).toBe(false);

  await open(page, `&artistId=${f.artistId}&sort=title:asc`, 390);
  const narrow = await page.locator('main table tbody tr').first().evaluate((r) => ({ height: r.getBoundingClientRect().height, text: r.textContent ?? '' }));
  expect(narrow.text, 'the label and condition the narrow table drops as columns').toContain(`Oriole-${f.suffix} · VG+`);
  expect(narrow.height).toBeGreaterThan(44);
  const plain = await page.locator('main table tbody tr').nth(1).evaluate((r) => r.getBoundingClientRect().height);
  expect(plain, 'a row with no such line is still at least 44').toBeGreaterThanOrEqual(44);
});

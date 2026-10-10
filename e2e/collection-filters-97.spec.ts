import { expect, test, type Page } from '@playwright/test';
import { registerCleanup, trackArtist, trackCreated } from './cleanup';
import { login } from './sign-in';

registerCleanup();

/**
 * Step 97b, §T.3: "Filters are a disclosure, not a set of chips always
 * shown."
 *
 * Genre, Label, Store and Tag, in SPEC.md §10's order, one line each. Closed,
 * a line is its 11 label and the one option chosen, in ink, or nothing.
 * Pressed, it opens its options in a panel beneath its line, 44 a row with
 * a hairline between, the chosen one underlined, each with its count
 * right-aligned as an 11 label. One is open at a time; a second press or
 * Escape closes it. Single-valued, as the build and the address are.
 *
 * Step 101 superseded the push-down this step built (`T.3/push-down`): the
 * list is on a covering panel and the page does not move. Two tests here
 * asserted the push-down and were rewritten for the ruling, not to pass a
 * build: the one that read the list as in flow and the table as pushed
 * down, and the one that pressed a second filter's line while the first
 * was open, which the first's panel now covers when the second is below
 * it. Step 102 then put the panel beneath the last line
 * (`T.3/covers-own-line`), so that second test presses a line below the
 * open one again and reads that line as its own, and the first reads the
 * list beneath the last line and not Genre's, both for the ruling. The
 * panel's own claims are in `filter-panel-101.spec.ts`.
 *
 * Read on fixtures made here, among the seeded seventeen. What the lists
 * cost on the real collection is the survey sheet's to say.
 */
type Fixture = { suffix: string; artistId: string; genre: string; label: string; store: string; tag: string };

async function seed(page: Page): Promise<Fixture> {
  const suffix = `f97${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
  const post = async (path: string, data: unknown) => {
    const response = await page.request.post(path, { data, failOnStatusCode: false });
    expect(response.status(), `${path} ${JSON.stringify(data)}`).toBe(201);
    const body = (await response.json()) as { id: string };
    trackCreated(path, body);
    return body;
  };
  const genre = await post('/api/genres', { name: `Skiffle-${suffix}` });
  const label = await post('/api/labels', { name: `Pye-${suffix}` });
  const store = await post('/api/stores', { name: `Shop-${suffix}` });
  const tag = await post('/api/tags', { name: `tag-${suffix}` });
  const artist = await post('/api/artists', { name: `Donegan-${suffix}` });
  trackArtist(artist.id);
  await post('/api/records', { title: `Rock Island ${suffix}`, artistId: artist.id, labelId: label.id, storeId: store.id, genreIds: [genre.id], tagIds: [tag.id] });
  await post('/api/records', { title: `Cumberland ${suffix}`, artistId: artist.id, genreIds: [genre.id] });
  return { suffix, artistId: artist.id, genre: `Skiffle-${suffix}`, label: `Pye-${suffix}`, store: `Shop-${suffix}`, tag: `tag-${suffix}` };
}

async function open(page: Page, query: string, width = 1440) {
  await page.setViewportSize({ width, height: 900 });
  await page.goto(`/?view=table${query}`);
  await page.locator('[data-collection-filters][data-hydrated="true"]').waitFor({ timeout: 30_000 });
  await page.addStyleTag({ content: 'nextjs-portal{display:none!important}' });
}

const line = (page: Page, key: string) => page.locator(`[data-filter="${key}"]`);
const trigger = (page: Page, key: string) => line(page, key).locator('[data-filter-trigger]');
const options = (page: Page, key: string) => line(page, key).locator('[data-filter-option]');

test.beforeEach(async ({ page }) => login(page));

/* Fails against the built chips: four rows of every option, always shown, each scrolling sideways inside itself. */
test('closed, each filter is one line of its label and nothing else, in §10’s order, and no option is shown', async ({ page }) => {
  await seed(page);
  for (const width of [1440, 390]) {
    await open(page, '', width);
    const m = await page.evaluate(() => Array.from(document.querySelectorAll<HTMLElement>('[data-filter]')).map((el) => {
      const t = el.querySelector('[data-filter-trigger]') as HTMLElement;
      const label = t.querySelector('[data-filter-label]') as HTMLElement;
      const cs = getComputedStyle(label);
      return { key: el.dataset.filter, label: (label.textContent ?? '').trim(), size: cs.fontSize, transform: cs.textTransform, chosen: (t.querySelector('[data-filter-chosen]')?.textContent ?? '').trim(), expanded: t.getAttribute('aria-expanded'), height: t.getBoundingClientRect().height, options: el.querySelectorAll('[data-filter-option]').length };
    }));
    expect(m.map((f) => f.key), `at ${width}`).toEqual(['genreId', 'labelId', 'storeId', 'tagId']);
    expect(m.map((f) => f.label)).toEqual(['Genre', 'Label', 'Store', 'Tag']);
    for (const f of m) {
      expect(f, `${f.label} at ${width}`).toMatchObject({ size: '11px', transform: 'uppercase', chosen: '', expanded: 'false', options: 0 });
      expect(f.height, `${f.label}’s line is a 44 control`).toBe(44);
    }
    const tops = await page.evaluate(() => Array.from(document.querySelectorAll('[data-filter-trigger]')).map((t) => Math.round(t.getBoundingClientRect().top)));
    expect(tops, 'one line each, beneath one another').toEqual([...tops].sort((a, b) => a - b));
    expect(new Set(tops).size).toBe(4);
    expect(await page.evaluate(() => Array.from(document.querySelectorAll('main *')).filter((el) => el.scrollWidth > el.clientWidth + 1 && ['auto', 'scroll'].includes(getComputedStyle(el).overflowX) && el.tagName !== 'TABLE' && el.querySelector('table') === null).length), 'nothing scrolls sideways inside itself').toBe(0);
  }
});

/* Fails against rows under 44 and against counts set beside their names. Step 113: the list is in place beneath its own title and pushes the lines and the table down by its height; until then it covered what lay beneath the last line and the table stayed. */
test('pressed, a filter opens its options beneath its own title, 44 a row, counts right-aligned, and the table moves down by the container’s height', async ({ page }) => {
  const f = await seed(page);
  await open(page, '', 390);
  const tableTop = () => page.locator('main table').evaluate((t) => t.getBoundingClientRect().top + window.scrollY);
  const before = await tableTop();
  await trigger(page, 'genreId').click();
  await expect(trigger(page, 'genreId')).toHaveAttribute('aria-expanded', 'true');
  const m = await page.evaluate(() => {
    const el = document.querySelector('[data-filter="genreId"]') as HTMLElement;
    const t = (el.querySelector('[data-filter-trigger]') as HTMLElement).getBoundingClientRect();
    const rows = Array.from(el.querySelectorAll<HTMLElement>('[data-filter-option]')).map((o) => {
      const r = o.getBoundingClientRect();
      const count = o.querySelector('[data-filter-count]') as HTMLElement;
      const name = o.querySelector('[data-filter-name]') as HTMLElement;
      const cs = getComputedStyle(count);
      return { top: r.top, height: r.height, left: r.left, right: r.right, name: (name.textContent ?? '').trim(), nameLeft: name.getBoundingClientRect().left, count: (count.textContent ?? '').trim(), countRight: count.getBoundingClientRect().right, countSize: cs.fontSize, borderTop: getComputedStyle(o).borderTopWidth };
    });
    const lines = Array.from(document.querySelectorAll<HTMLElement>('[data-filter-trigger]'));
    return { lastBottom: lines[lines.length - 1].getBoundingClientRect().bottom, lines: lines.length, triggerBottom: t.bottom, triggerLeft: t.left, rows };
  });
  expect(m.rows.length, 'every genre the collection has').toBeGreaterThan(1);
  expect(m.rows[0].top, 'the first option is directly beneath its own title').toBeCloseTo(m.triggerBottom, 0);
  for (const [i, row] of m.rows.entries()) {
    expect(row.height, `${row.name}: a 44 row`).toBe(44);
    expect(row.borderTop, `${row.name}: a hairline above`).toBe('1px');
    expect(row.countSize, `${row.name}: its count is an 11 label`).toBe('11px');
    expect(row.count, `${row.name}: a count`).toMatch(/^\d+$/);
    expect(row.countRight, `${row.name}: counts align on the right`).toBeCloseTo(m.rows[0].countRight, 0);
    expect(row.countRight, 'at the row’s right edge').toBeCloseTo(row.right, 0);
    if (i > 0) expect(row.top, 'rows are adjacent').toBeCloseTo(m.rows[i - 1].top + 44, 0);
  }
  const ours = m.rows.find((row) => row.name === f.genre);
  expect(ours?.count, 'the count is what choosing it returns').toBe('2');
  const pushed = await page.locator('[data-filter-panel]').evaluate((p) => p.getBoundingClientRect().height);
  expect(pushed, 'the container has a height').toBeGreaterThan(0);
  expect((await tableTop()) - before, 'the table is down by the container’s height').toBeCloseTo(pushed, 0);
});

/* Fails against a build that leaves a list open when another is pressed, or that ignores Escape or the second press. */
test('one filter is open at a time; a second press closes it, and so does Escape, which returns focus to the line', async ({ page }) => {
  await seed(page);
  await open(page, '');
  /* Genre first and then Label, the line BELOW it: the container pushes it down and covers nothing, so every line can be pressed while one is open. */
  await trigger(page, 'genreId').click();
  await expect(options(page, 'genreId').first()).toBeVisible();
  const under = await trigger(page, 'labelId').evaluate((t) => { const r = t.getBoundingClientRect(); const el = document.elementFromPoint(r.left + 10, r.top + r.height / 2); return { onPanel: el?.closest('[data-filter-panel]') !== null, onLine: el?.closest('[data-filter-trigger]') === t }; });
  expect(under, 'Label’s line is not under Genre’s panel').toEqual({ onPanel: false, onLine: true });
  await trigger(page, 'labelId').click();
  await expect(options(page, 'labelId').first()).toBeVisible();
  await expect(options(page, 'genreId')).toHaveCount(0);
  await expect(trigger(page, 'genreId')).toHaveAttribute('aria-expanded', 'false');
  await trigger(page, 'labelId').click();
  await expect(options(page, 'labelId')).toHaveCount(0);

  await trigger(page, 'genreId').click();
  await page.keyboard.press('Escape');
  await expect(options(page, 'genreId')).toHaveCount(0);

  await trigger(page, 'labelId').click();
  await expect(options(page, 'labelId').first()).toBeVisible();

  await trigger(page, 'labelId').click();
  await expect(options(page, 'labelId')).toHaveCount(0);

  await trigger(page, 'storeId').click();
  await options(page, 'storeId').first().focus();
  await page.keyboard.press('Escape');
  await expect(options(page, 'storeId')).toHaveCount(0);
  await expect(trigger(page, 'storeId')).toBeFocused();
});

/* Fails against a build that marks the choice by a fill or a border, shows it nowhere when closed, or lets two stand. */
test('choosing an option filters, closes the list and names the choice on the line in ink; reopened, it alone is underlined; pressed again it clears', async ({ page }) => {
  const f = await seed(page);
  await open(page, `&artistId=${f.artistId}`);
  await trigger(page, 'labelId').click();
  await options(page, 'labelId').filter({ hasText: f.label }).click();
  await expect(page).toHaveURL(/labelId=/, { timeout: 15_000 });
  await expect(page.getByRole('link', { name: `Cumberland ${f.suffix}` })).toHaveCount(0);
  await expect(page.getByRole('link', { name: `Rock Island ${f.suffix}` })).toBeVisible();
  await expect(options(page, 'labelId')).toHaveCount(0);
  const chosen = line(page, 'labelId').locator('[data-filter-chosen]');
  await expect(chosen).toHaveText(f.label);
  expect(await chosen.evaluate((el) => ({ size: getComputedStyle(el).fontSize, colour: getComputedStyle(el).color }))).toEqual({ size: '11px', colour: 'lab(6.18075 1.20374 2.12039)' });

  await trigger(page, 'labelId').click();
  const marks = await options(page, 'labelId').evaluateAll((all) => all.map((o) => {
    const name = o.querySelector('[data-filter-name]') as HTMLElement;
    const cs = getComputedStyle(name);
    return { name: (name.textContent ?? '').trim(), pressed: o.getAttribute('aria-pressed'), line: cs.textDecorationLine, thickness: cs.textDecorationThickness, offset: cs.textUnderlineOffset };
  }));
  const underlined = marks.filter((o) => o.line === 'underline');
  expect(underlined, 'exactly the chosen one, by §3’s 2px underline 7 below the baseline').toEqual([{ name: f.label, pressed: 'true', line: 'underline', thickness: '2px', offset: '7px' }]);
  expect(marks.filter((o) => o.pressed === 'true').length).toBe(1);

  await options(page, 'labelId').filter({ hasText: f.label }).click();
  await expect(page).not.toHaveURL(/labelId=/, { timeout: 15_000 });
  await expect(line(page, 'labelId').locator('[data-filter-chosen]')).toHaveText('');
  await expect(page.getByRole('link', { name: `Cumberland ${f.suffix}` })).toBeVisible();
});

/* Fails against the built toggle and Clear, 16 and 16.5 tall, and against a Clear that leaves a filter standing. */
test('the no-release-year toggle and Clear filters are controls of 44, and Clear clears every filter', async ({ page }) => {
  const f = await seed(page);
  await open(page, `&artistId=${f.artistId}&yearFrom=1950`, 390);
  await trigger(page, 'genreId').click();
  await options(page, 'genreId').filter({ hasText: f.genre }).click();
  await expect(page).toHaveURL(/genreId=/, { timeout: 15_000 });
  const m = await page.evaluate(() => ({
    toggle: (document.querySelector('[data-filter-undated]') as HTMLElement).getBoundingClientRect().height,
    clear: (document.querySelector('[data-filter-clear]') as HTMLElement).getBoundingClientRect().height,
    clearText: (document.querySelector('[data-filter-clear]') as HTMLElement).textContent,
  }));
  expect(m.toggle, 'the toggle’s label').toBeGreaterThanOrEqual(44);
  expect(m.clear, 'Clear filters').toBeGreaterThanOrEqual(44);
  expect(m.clearText).toMatch(/^Clear all 3 filters$/);
  await page.locator('[data-filter-clear]').click();
  await expect(page).toHaveURL(/\?view=table$/, { timeout: 15_000 });
});

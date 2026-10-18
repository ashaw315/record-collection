import { expect, test, type Page } from '@playwright/test';
import { registerCleanup, trackArtist, trackCreated } from './cleanup';
import { FORK, RECORD_MINIMUM } from '../src/app/sidebar-layout';
import { login } from './sign-in';

/**
 * The Genre column (§T.4, T.4/genre-to-content): Genre 96 wide
 * wherever it draws, its 16 of padding included, names wrapping at their own spaces, each genre its own
 * element with the dot drawn between, Record taking the rest. What a
 * component render cannot see is asserted here: the width, the drawn dot,
 * and the genres on the second line below 768. Each fails against the
 * table as built, which has no Genre column.
 */
registerCleanup();

async function seed(page: Page) {
  const suffix = `g155${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
  const post = async (path: string, data: unknown) => {
    const response = await page.request.post(path, { data, failOnStatusCode: false });
    expect(response.status(), `${path} ${JSON.stringify(data)}`).toBe(201);
    const body = (await response.json()) as { id: string };
    trackCreated(path, body);
    return body;
  };
  const folk = await post('/api/genres', { name: `Folk, World, & Country ${suffix}` });
  const rock = await post('/api/genres', { name: `Rock ${suffix}` });
  const label = await post('/api/labels', { name: `Epic-${suffix}` });
  const artist = await post('/api/artists', { name: `Donovan-${suffix}` });
  trackArtist(artist.id);
  await post('/api/records', { title: `Hurdy ${suffix}`, artistId: artist.id, labelId: label.id, releaseYear: 1968, genreIds: [rock.id, folk.id] });
  await post('/api/records', { title: `Bare ${suffix}`, artistId: artist.id, releaseYear: 1969 });
  return suffix;
}

async function open(page: Page, width: number, suffix: string) {
  await page.setViewportSize({ width, height: 900 });
  await page.goto(`/?view=table&q=${suffix}&sort=title:asc`);
  await page.locator('[data-collection-filters][data-hydrated="true"]').waitFor({ timeout: 30_000 });
  await page.locator('main table tbody tr').first().waitFor({ timeout: 30_000 });
  await page.addStyleTag({ content: 'nextjs-portal{display:none!important}' });
  await page.evaluate(() => document.fonts.ready);
}

const read = (page: Page, suffix: string) =>
  page.evaluate((suffix) => {
    const heads = Array.from(document.querySelectorAll<HTMLElement>('main [data-collection-table] thead th'));
    const genreHead = heads.find((h) => h.textContent?.startsWith('Genre')) ?? null;
    /* By title, not position: the search is fuzzy, so a neighbour's records can stand among these. */
    const all = Array.from(document.querySelectorAll('main [data-collection-table] tbody tr'));
    const titled = (title: string) => {
      const tr = all.find((row) => row.querySelector('a')?.textContent === `${title} ${suffix}`);
      if (tr === undefined) throw new Error(`no row for ${title} ${suffix}`);
      return tr;
    };
    const rows = [titled('Bare'), titled('Hurdy')];
    const shown = (el: Element) => (el as HTMLElement).getClientRects().length > 0;
    const genres = (row: Element) =>
      Array.from(row.querySelectorAll<HTMLElement>('[data-genre]')).filter(shown).map((g) => ({ text: g.textContent, before: getComputedStyle(g, '::before').content, inColumn: g.closest('td') !== row.querySelector('td') }));
    return {
      record: heads[0].getBoundingClientRect().width,
      genre: genreHead === null || !shown(genreHead) ? null : genreHead.getBoundingClientRect().width,
      hurdy: genres(rows[1]),
      bare: genres(rows[0]),
      bareCell: rows[0].querySelectorAll('td')[1]?.textContent ?? null,
    };
  }, suffix);

test.beforeEach(async ({ page }) => {
  await login(page);
});

test('at the fork Genre is 96 wide, after Record, which keeps its floor; the dot is drawn between its names', async ({ page }) => {
  const suffix = await seed(page);
  await open(page, FORK, suffix);
  const r = await read(page, suffix);
  expect(r.genre, 'Genre draws at the fork, 96 wide').toBe(96);
  expect(r.record, 'Record keeps its stated minimum').toBeGreaterThanOrEqual(RECORD_MINIMUM);
  expect(r.hurdy.map((g) => g.text), 'each name whole, alphabetical, in the column').toEqual([`Folk, World, & Country ${suffix}`, `Rock ${suffix}`]);
  expect(r.hurdy.every((g) => g.inColumn)).toBe(true);
  expect(r.hurdy.map((g) => g.before), 'a spaced middle dot drawn before the second name only').toEqual(['none', '" · "']);
  expect(r.bare, 'a genreless record draws nothing').toEqual([]);
  expect(r.bareCell, 'and its cell is empty, no dash').toBe('');
});

for (const width of [390, 320]) {
  test(`at ${width} the genres leave with Label and set first on the second line`, async ({ page }) => {
    const suffix = await seed(page);
    await open(page, width, suffix);
    const r = await read(page, suffix);
    expect(r.genre, 'no Genre column').toBeNull();
    expect(r.hurdy.map((g) => g.text)).toEqual([`Folk, World, & Country ${suffix}`, `Rock ${suffix}`]);
    expect(r.hurdy.every((g) => !g.inColumn), 'on the Record cell’s second line').toBe(true);
    expect(r.hurdy.map((g) => g.before)).toEqual(['none', '" · "']);
    const line = await page.locator('main [data-collection-table] tbody tr').filter({ has: page.getByRole('link', { name: `Hurdy ${suffix}`, exact: true }) }).locator('td').first().locator('div.md\\:hidden').evaluate((d) => ({ first: d.firstElementChild?.hasAttribute('data-genre') ?? false, label: d.lastElementChild?.textContent ?? '', before: d.lastElementChild === null ? '' : getComputedStyle(d.lastElementChild, '::before').content }));
    expect(line.first, 'genres first').toBe(true);
    expect(line.label, 'then the label').toBe(`Epic-${suffix}`);
    expect(line.before, 'a dot between the genres and the label').toBe('" · "');
  });
}

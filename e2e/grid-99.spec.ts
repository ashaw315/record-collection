import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { registerCleanup, trackArtist } from './cleanup';
import { seedImage } from './seed';
import { login } from './sign-in';

registerCleanup();

/**
 * Step 99, §T.5: the grid.
 *
 * "Each record is its cover in a square, by §33's rule for the record page:
 * cropped to fill within the 95% bound, fitted beyond it, and held back
 * until its shape is known. A record with no cover shows the frame §6 and
 * §5.3 rule, at the square's size." Under each, the title in 13 ink and the
 * artist as an 11 label, with nothing else; the whole cell one link.
 * "Covers are 24 apart, inset 20 a side from the window, at least two to a
 * row, and as many as fit at 160 or wider."
 *
 * The cover fixtures are §33's own (`test/fixtures/covers`), whose ratios
 * `cover-fit-83` checks against the manifest before relying on them.
 */
const FIXTURES = join('test', 'fixtures', 'covers');
type Fixture = { file: string; expected: 'crop' | 'fit' };
const manifest = JSON.parse(readFileSync(join(FIXTURES, 'manifest.json'), 'utf8')) as Fixture[];
const dataUrl = (expected: 'crop' | 'fit') => {
  const f = manifest.find((entry) => entry.expected === expected);
  if (f === undefined) throw new Error(`no ${expected} fixture in the manifest`);
  return `data:image/png;base64,${readFileSync(join(FIXTURES, f.file)).toString('base64')}`;
};
const INK = 'lab(6.18075 1.20374 2.12039)';
const LABEL_INK = 'lab(35.0433 0.937879 2.8959)';

type Seeded = { suffix: string; artistId: string; crop: string; fit: string; bare: string };

/** Three records by one artist: a cover inside the bound, one beyond it, and none. `extra` more with no cover fill out the rows. */
async function seed(page: Page, extra = 0): Promise<Seeded> {
  const suffix = `g99${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
  const artist = (await (await page.request.post('/api/artists', { data: { name: `Grid Artist ${suffix}` } })).json()) as { id: string };
  trackArtist(artist.id);
  const make = async (title: string) => {
    const r = await page.request.post('/api/records', { data: { title: `${title} ${suffix}`, artistId: artist.id, releaseYear: 1970 } });
    expect(r.status()).toBe(201);
    return ((await r.json()) as { id: string }).id;
  };
  const crop = await make('A Crop');
  const fit = await make('B Fit');
  const bare = await make('C Bare');
  for (let i = 0; i < extra; i += 1) await make(`D Extra ${String(i).padStart(2, '0')}`);
  await seedImage({ recordId: crop, imageType: 'cover', url: dataUrl('crop') });
  await seedImage({ recordId: fit, imageType: 'cover', url: dataUrl('fit') });
  return { suffix, artistId: artist.id, crop, fit, bare };
}

async function open(page: Page, artistId: string, width: number) {
  await page.setViewportSize({ width, height: 800 });
  await page.goto(`/?view=grid&artistId=${artistId}&sort=title:asc`);
  await page.locator('[data-collection-grid] li').first().waitFor({ timeout: 30_000 });
  await page.addStyleTag({ content: 'nextjs-portal{display:none!important}' });
}

const cells = (page: Page) => page.evaluate(() => Array.from(document.querySelectorAll<HTMLElement>('[data-collection-grid] li')).map((li) => {
  const square = (li.querySelector('[data-grid-cover]') as HTMLElement).getBoundingClientRect();
  return { left: Math.round(square.left * 10) / 10, top: Math.round(square.top), width: Math.round(square.width * 10) / 10, height: Math.round(square.height * 10) / 10, right: Math.round(square.right * 10) / 10 };
}));

test.beforeEach(async ({ page }) => login(page));

/* Fails against the built grid: a card of facts per record, with no cover at all. */
test('each record is its cover in a square: cropped inside the bound, fitted beyond it, shown once its shape is known, and the frame where there is none', async ({ page }) => {
  const f = await seed(page);
  await open(page, f.artistId, 1440);
  await expect(page.locator('[data-collection-grid] img[data-cover-treatment]')).toHaveCount(2, { timeout: 30_000 });
  const m = await page.evaluate(() => Array.from(document.querySelectorAll<HTMLElement>('[data-collection-grid] li')).map((li) => {
    const square = li.querySelector('[data-grid-cover]') as HTMLElement;
    const img = square.querySelector('img');
    const box = square.getBoundingClientRect();
    const cs = img === null ? null : getComputedStyle(img);
    return { title: (li.querySelector('a')?.textContent ?? '').trim().split(' ').slice(0, 2).join(' '), square: Math.abs(box.width - box.height) < 0.6, treatment: img?.dataset.coverTreatment ?? null, fit: cs?.objectFit ?? null, visible: cs?.visibility ?? null, imgFills: img === null ? null : Math.abs(img.getBoundingClientRect().width - box.width) < 2, frame: square.dataset.gridCover, border: getComputedStyle(square).borderTopWidth };
  }));
  expect(m).toEqual([
    { title: 'A Crop', square: true, treatment: 'crop', fit: 'cover', visible: 'visible', imgFills: true, frame: 'photo', border: '0px' },
    { title: 'B Fit', square: true, treatment: 'fit', fit: 'contain', visible: 'visible', imgFills: true, frame: 'photo', border: '0px' },
    { title: 'C Bare', square: true, treatment: null, fit: null, visible: null, imgFills: null, frame: 'none', border: '1px' },
  ]);
});

/* Fails against a cover drawn before its photograph has loaded: it would paint cropped and then change, which §33 forbids. */
test('a cover is held back until its shape is known', async ({ page }) => {
  /*
    The photograph is a URL this test serves and holds, as `cover-wait-85`
    does for the record page. A first version tried to hold every image by
    its `src` setter; the server's markup sets the attribute and never
    calls it, so the hold did not take and the photographs loaded at once.
    The assertion on the waiting state is what showed that.
  */
  const f = await seed(page);
  const far = manifest.find((entry) => entry.file.includes('far'));
  if (far === undefined) throw new Error('no far fixture');
  const url = `/held-cover-99/${f.suffix}.png`;
  await seedImage({ recordId: f.bare, imageType: 'cover', url });
  let release: () => void = () => {};
  const opened = new Promise<void>((resolve) => { release = resolve; });
  let asked = 0;
  await page.route(`**${url}`, async (route) => { asked += 1; await opened; await route.fulfill({ contentType: 'image/png', body: readFileSync(join(FIXTURES, far.file)) }); });
  /* Not `open`: the page's load event waits for the photograph this test is holding. */
  await page.setViewportSize({ width: 1440, height: 800 });
  await page.goto(`/?view=grid&artistId=${f.artistId}&sort=title:asc`, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-collection-grid] img[data-cover-treatment]')).toHaveCount(2, { timeout: 30_000 });
  const held = page.locator('[data-collection-grid] li').nth(2).locator('img');
  expect(asked, 'the photograph was asked for and is being held').toBe(1);
  expect(await held.evaluate((img) => ({ treatment: (img as HTMLElement).dataset.coverTreatment ?? null, visibility: getComputedStyle(img).visibility })), 'not arrived, so not shown').toEqual({ treatment: null, visibility: 'hidden' });
  release();
  await expect(held).toHaveAttribute('data-cover-treatment', 'fit', { timeout: 30_000 });
  expect(await held.evaluate((img) => getComputedStyle(img).visibility)).toBe('visible');
});

/* Fails against the built card: year, format, label, condition and price under the title, and a link that is only the title's text. */
test('under a cover the title is 13 ink and the artist an 11 label, with nothing else, and the whole cell is one link', async ({ page }) => {
  const f = await seed(page);
  await open(page, f.artistId, 1440);
  const m = await page.locator('[data-collection-grid] li').first().evaluate((li) => {
    const title = li.querySelector('[data-grid-title]') as HTMLElement;
    const artist = li.querySelector('[data-grid-artist]') as HTMLElement;
    const [ts, as] = [getComputedStyle(title), getComputedStyle(artist)];
    const cover = (li.querySelector('[data-grid-cover]') as HTMLElement).getBoundingClientRect();
    return { text: (li.textContent ?? '').trim(), title: { text: (title.textContent ?? '').trim(), size: ts.fontSize, colour: ts.color }, artist: { text: (artist.textContent ?? '').trim(), size: as.fontSize, colour: as.color, transform: as.textTransform }, links: li.querySelectorAll('a').length, below: title.getBoundingClientRect().top >= cover.bottom && artist.getBoundingClientRect().top >= title.getBoundingClientRect().bottom, cover: { x: cover.left + cover.width / 2, y: cover.top + cover.height / 2 } };
  });
  expect(m.title).toEqual({ text: `A Crop ${f.suffix}`, size: '13px', colour: INK });
  expect(m.artist).toEqual({ text: `Grid Artist ${f.suffix}`, size: '11px', colour: LABEL_INK, transform: 'uppercase' });
  expect(m.text, 'nothing else in the cell').toBe(`A Crop ${f.suffix}Grid Artist ${f.suffix}`);
  expect(m.links).toBe(1);
  expect(m.below, 'title beneath the cover, artist beneath the title').toBe(true);
  /* The middle of the photograph, nowhere near the title's text. */
  await page.mouse.click(m.cover.x, m.cover.y);
  await expect(page).toHaveURL(new RegExp(`/records/${f.crop}$`), { timeout: 20_000 });
});

/* Fails against the built grid: one column at 390, and three at 1280 whatever the window holds. */
test('covers are 24 apart at the 20 inset: two of 163 at 390, two of 128 at 320', async ({ page }) => {
  const f = await seed(page, 3);
  for (const [width, size] of [[390, 163], [320, 128]] as const) {
    await open(page, f.artistId, width);
    const c = await cells(page);
    const first = c.filter((cell) => cell.top === c[0].top);
    expect(first.length, `covers in a row at ${width}`).toBe(2);
    expect(first[0].width, `a cover at ${width}`).toBeCloseTo(size, 0);
    expect(first[0].height).toBeCloseTo(size, 0);
    expect(first[0].left, 'the left inset').toBeCloseTo(20, 0);
    expect(first[1].right, 'the right inset').toBeCloseTo(width - 20, 0);
    expect(first[1].left - first[0].right, 'the gap').toBeCloseTo(24, 0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), 'the page is no wider than the window').toBe(0);
  }
});

/* Fails against fixed breakpoints: the count would change at 640 and 1024, where no 160 newly fits. */
test('one more cover joins a row at each width where another 160 and its 24 fit, from 568 to 1920', async ({ page }) => {
  const f = await seed(page, 9);
  /* n covers fit when the window less its insets holds n of 160 and n - 1 of 24: 184n + 16. */
  const changes = [3, 4, 5, 6, 7, 8, 9, 10].map((n) => ({ n, at: 184 * n + 16 }));
  expect(changes.map((c) => c.at)).toEqual([568, 752, 936, 1120, 1304, 1488, 1672, 1856]);
  const count = async (width: number) => {
    await page.setViewportSize({ width, height: 800 });
    await page.waitForTimeout(60);
    const c = await cells(page);
    return { n: c.filter((cell) => cell.top === c[0].top).length, width: c[0].width };
  };
  await open(page, f.artistId, 567);
  for (const { n, at } of changes) {
    const before = await count(at - 1);
    const after = await count(at);
    expect(before.n, `${at - 1}: one fewer`).toBe(n - 1);
    expect(after.n, `${at}: ${n} covers`).toBe(n);
    expect(after.width, `${at}: each exactly 160`).toBeCloseTo(160, 0);
  }
  expect((await count(1920)).n, 'at 1920').toBe(10);
});

/* Fails against a grid that drops the control: with no headers, nothing else names or changes the order. */
test('the grid keeps the Sort control, a 44 control naming the order', async ({ page }) => {
  const f = await seed(page);
  await open(page, f.artistId, 390);
  const control = page.locator('[data-sort-control]');
  await expect(control.locator('[data-sort-current]')).toHaveText('Sort · Title ↑');
  expect(await control.evaluate((el) => el.getBoundingClientRect().height)).toBe(44);
  await control.locator('select').selectOption('title:desc');
  await expect(page).toHaveURL(/sort=title(%3A|:)desc/, { timeout: 15_000 });
  await expect.poll(() => page.locator('[data-collection-grid] li [data-grid-title]').first().textContent()).toContain('C Bare');
});

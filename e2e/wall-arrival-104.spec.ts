import { expect, test, type Page } from '@playwright/test';
import { registerCleanup, trackArtist, trackCreated } from './cleanup';
import { login } from './sign-in';

registerCleanup();

/**
 * Step 104, §W.29: "Under a filter, the near view arrives on the first
 * matching record's shelf, by the collection's order, and where nothing
 * matches it arrives as it would unfiltered, on the occupied shelf." "A
 * filter applied while the near view is open moves it the same way." And
 * the empty shelf: "Where a filter or search matches nothing, the shelf
 * says so: one sentence in the label colour, centred over the arrival's
 * region, saying nothing matches, with CLEAR FILTERS beneath it as a §9.3
 * control... There is no figure... The sentence sits on paper over the
 * region and does not move with the pan."
 *
 * A filtered wall is the whole collection's (§W.12), so this seeds its own
 * and measures against it: sixty records besides, and three under a genre
 * of their own, whose place in the collection's order is READ from the
 * unfiltered wall and asserted to be past the first two shelves before
 * anything is claimed about where a filter arrives.
 */
type Fixture = { genreId: string; ids: string[]; word: string };

async function seed(page: Page): Promise<Fixture> {
  const suffix = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
  const post = async (path: string, data: unknown) => {
    const response = await page.request.post(path, { data, failOnStatusCode: false });
    expect(response.status(), `${path} ${JSON.stringify(data)}`).toBe(201);
    const body = (await response.json()) as { id: string };
    trackCreated(path, body);
    return body;
  };
  const filler = await post('/api/artists', { name: `Filler104-${suffix}` });
  trackArtist(filler.id);
  /* The wall's order is by genre, so the sixty are given one that sorts ahead of the three's. Their titles share nothing with the three's, since search is by likeness. */
  const ahead = await post('/api/genres', { name: `Aa104-${suffix}` });
  for (let i = 0; i < 60; i += 1) await post('/api/records', { title: `Ballast ${String(i).padStart(2, '0')}`, artistId: filler.id, genreIds: [ahead.id] });
  const genre = await post('/api/genres', { name: `Zz104-${suffix}` });
  const artist = await post('/api/artists', { name: `Zz104-${suffix}` });
  trackArtist(artist.id);
  /* All random: search is by likeness, and a word sharing a stem with another test's would match that test's records too. */
  const word = Array.from({ length: 14 }, () => 'bcdfghjklmnpqrstvwxz'[Math.floor(Math.random() * 20)]).join('');
  const ids: string[] = [];
  for (let i = 0; i < 3; i += 1) ids.push((await post('/api/records', { title: `${word} ${i}`, artistId: artist.id, genreIds: [genre.id] })).id);
  return { genreId: genre.id, ids, word };
}

async function near(page: Page, path: string) {
  await page.goto(path);
  await expect(page.locator('[data-wall="labelled"]')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('[data-wall-container][data-unmeasured]')).toHaveCount(0, { timeout: 10_000 });
  await page.addStyleTag({ content: 'nextjs-portal{display:none!important}' });
  await page.waitForTimeout(900);
}

/** The region's box and scroll, and the boxes of the matching seats that are drawn. */
const read = (page: Page, ids: string[]) =>
  page.evaluate((list) => {
    const el = document.querySelector('[data-region="wall"]') as HTMLElement;
    const r = el.getBoundingClientRect();
    const box = (q: string) => { const b = document.querySelector(q)?.getBoundingClientRect(); return b ? { left: b.left, top: b.top, right: b.right, bottom: b.bottom } : null; };
    return {
      region: { left: r.left, top: r.top, right: r.right, bottom: r.bottom },
      scroll: { left: Math.round(el.scrollLeft), top: Math.round(el.scrollTop) },
      seats: list.map((id) => ({ id, spine: box(`a[data-seat="${id}"] [data-spine]`), top: box(`a[data-seat="${id}"] [data-face="top"]`), order: Number(document.querySelector(`a[data-seat="${id}"]`)?.getAttribute('tabindex') ?? 0) })),
      drawn: document.querySelectorAll('a[data-seat]').length,
      footprints: document.querySelectorAll('[data-footprint]').length,
    };
  }, ids);

type Read = Awaited<ReturnType<typeof read>>;
const inRegion = (m: Read, index: number) => {
  const s = m.seats[index];
  return s.spine !== null && s.top !== null && s.spine.left >= m.region.left - 1 && s.spine.right <= m.region.right + 1 && s.spine.top >= m.region.top - 1 && s.spine.bottom <= m.region.bottom + 1 && s.top.top >= m.region.top - 1;
};

test.beforeEach(async ({ page }) => {
  await login(page);
  await page.setViewportSize({ width: 1440, height: 900 });
});

/* Fails against an arrival on the collection's first seat: the matching records are shelves below the region. */
test('under a filter the near view arrives on the first matching record’s shelf', async ({ page }) => {
  const f = await seed(page);
  await near(page, '/');
  const whole = await read(page, f.ids);
  const first = [...whole.seats].sort((a, b) => a.order - b.order)[0];
  expect(first.order, `the precondition: the first match is past the first two shelves of the collection’s order, at seat ${first.order}`).toBeGreaterThan(40);
  expect(inRegion(whole, whole.seats.indexOf(first)), 'the precondition: unfiltered, the wall opens on its first shelf and that record is not in the region').toBe(false);

  await near(page, `/?genreId=${f.genreId}`);
  const m = await read(page, f.ids);
  expect(m.drawn, 'only the three matches are seated').toBe(3);
  expect(m.footprints, 'and the rest of the collection is emptied seats, still placed').toBeGreaterThanOrEqual(77);
  const index = m.seats.findIndex((s) => s.id === first.id);
  expect(inRegion(m, index), `the first match by the collection’s order is in the region with its top face uncut: ${JSON.stringify(m.seats[index])} in ${JSON.stringify(m.region)}`).toBe(true);
});

/* Fails against a wall that keeps its place when the filter changes under it: the search matches three records nobody can see. */
test('a search applied while the near view is open moves it to the first match, and clearing it returns to the unfiltered arrival', async ({ page }) => {
  const f = await seed(page);
  await near(page, '/');
  const start = await read(page, f.ids);
  await page.locator('#rail-search').fill(f.word);
  await page.locator('#rail-search').press('Enter');
  await expect(page).toHaveURL(new RegExp(`q=${f.word}`), { timeout: 15_000 });
  await expect(page.locator('a[data-seat]')).toHaveCount(3, { timeout: 15_000 });
  await page.waitForTimeout(900);
  const m = await read(page, f.ids);
  const first = [...m.seats].sort((a, b) => a.order - b.order)[0];
  expect(inRegion(m, m.seats.indexOf(first)), 'the first match is in the region').toBe(true);
  expect(m.scroll, 'and the wall has moved to it').not.toEqual(start.scroll);

  await page.locator('#rail-search').fill('');
  await page.locator('#rail-search').press('Enter');
  await expect(page.locator('[data-footprint]')).toHaveCount(0, { timeout: 15_000 });
  await page.waitForTimeout(900);
  expect((await read(page, f.ids)).scroll, 'cleared, it is back where the unfiltered wall arrives').toEqual(start.scroll);
});

/* Fails against a shelf that draws its emptied seats and says nothing: it reads as a fault. */
test('where nothing matches, the wall arrives as unfiltered and the shelf says so, with CLEAR FILTERS that restores it', async ({ page }) => {
  const f = await seed(page);
  await near(page, '/');
  const whole = await read(page, f.ids);
  await expect(page.locator('[data-shelf-empty]'), 'unfiltered, there is no such sentence').toHaveCount(0);

  await near(page, `/?genreId=${f.genreId}&q=zzzz-no-such-record-104`);
  const m = await read(page, f.ids);
  expect(m.drawn, 'the precondition: nothing is seated').toBe(0);
  expect(m.footprints, 'and every seat is still drawn, emptied').toBeGreaterThanOrEqual(80);
  expect(m.scroll, 'it arrives where the unfiltered wall does').toEqual(whole.scroll);

  const empty = page.locator('[data-shelf-empty]');
  await expect(empty).toBeVisible();
  const look = async () => empty.evaluate((el) => {
    const region = (document.querySelector('[data-region="wall"]') as HTMLElement).getBoundingClientRect();
    const sentence = el.querySelector('[data-shelf-empty-sentence]') as HTMLElement;
    const control = el.querySelector('[data-shelf-empty-clear]') as HTMLElement;
    const s = sentence.getBoundingClientRect(); const c = control.getBoundingClientRect(); const box = el.getBoundingClientRect();
    const sc = getComputedStyle(sentence); const cc = getComputedStyle(control);
    return {
      text: (sentence.textContent ?? '').trim(), colour: sc.color,
      offCentreX: Math.round((box.left + box.right) / 2 - (region.left + region.right) / 2), offCentreY: Math.round((box.top + box.bottom) / 2 - (region.top + region.bottom) / 2),
      sentence: [Math.round(s.left), Math.round(s.top)], controlBelow: c.top >= s.bottom,
      control: { text: (control.textContent ?? '').trim(), height: c.height, border: cc.borderTopWidth, borderColour: cc.borderTopColor, colour: cc.color, size: cc.fontSize, transform: cc.textTransform, fill: cc.backgroundColor, radius: cc.borderTopLeftRadius },
      figures: el.querySelectorAll('svg, img, canvas').length,
    };
  });
  const at = await look();
  expect(at.text, 'one sentence saying nothing matches').toMatch(/^[^.]*\bmatch(es)?\b[^.]*\.$/i);
  expect(['lab(35.0433 0.937879 2.8959)', 'oklch(0.44 0.008 70)'], `in the label colour: ${at.colour}`).toContain(at.colour);
  expect({ x: at.offCentreX, y: at.offCentreY }, 'centred over the region').toEqual({ x: 0, y: 0 });
  expect(at.controlBelow, 'CLEAR FILTERS beneath it').toBe(true);
  expect(at.control.text).toMatch(/^clear filters$/i);
  expect(at.control).toMatchObject({ height: 44, border: '1px', size: '11px', transform: 'uppercase', fill: 'rgba(0, 0, 0, 0)', radius: '0px' });
  expect(['lab(6.18075 1.20374 2.12039)', 'oklch(0.19 0.008 60)'], 'a §9.3 control: ink box').toContain(at.control.borderColour);
  expect(['lab(6.18075 1.20374 2.12039)', 'oklch(0.19 0.008 60)'], 'ink label').toContain(at.control.colour);
  expect(at.figures, 'no figure').toBe(0);

  /* "Does not move with the pan": the wall is panned and the sentence is where it was. */
  await page.locator('[data-region="wall"]').evaluate((el) => el.scrollBy(60, 120));
  await expect.poll(async () => (await read(page, f.ids)).scroll.top).toBeGreaterThan(m.scroll.top);
  expect((await look()).sentence, 'panned, the sentence has not moved').toEqual(at.sentence);

  await empty.locator('[data-shelf-empty-clear]').click();
  await expect(page).not.toHaveURL(/genreId|q=/, { timeout: 15_000 });
  await expect(page.locator('[data-footprint]')).toHaveCount(0, { timeout: 15_000 });
  await expect(page.locator('[data-shelf-empty]')).toHaveCount(0);
  await page.waitForTimeout(900);
  expect((await read(page, f.ids)).scroll, 'and the wall is at the unfiltered arrival').toEqual(whole.scroll);
});

/* Fails against a sentence drawn only in the near view: a phone's shelf is the far view (§W.24) and would show an emptied object and nothing else. */
test('at 390, where the shelf is the far view, the sentence and CLEAR FILTERS are there too', async ({ page }) => {
  const f = await seed(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/?genreId=${f.genreId}&q=zzzz-no-such-record-104`);
  await expect(page.locator('[data-wall="overview"]')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('[data-shelf-empty] [data-shelf-empty-sentence]')).toBeVisible();
  await expect(page.locator('[data-shelf-empty] [data-shelf-empty-clear]')).toBeVisible();
});

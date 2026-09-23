import { expect, test, type Page } from '@playwright/test';
import { registerCleanup, trackArtist } from './cleanup';
import { GRID_FORK, NO_SCROLL_HEIGHT } from '../src/app/records/[id]/band-geometry';
import { WORST, type IdentityExtreme } from '../src/app/records/[id]/identity-extremes';

registerCleanup();

/**
 * **§27: no pressing fact is clipped on the collection's real worst title.**
 *
 * §9.2's clip is for ornament, which carries no data. A pressing line cut by
 * `overflow-hidden` is a fact rendered shorter (§6) — the app confidently
 * misleading rather than obviously broken. This seeds the worst case the
 * shared extremes module names and asserts that every fact in the pressing
 * block ends inside the cell's content box.
 *
 * It reports the margin as a number rather than a pass, because the case is
 * a hair either way: after §27's deletion the short-label case fits by 0.4px
 * once the genres run collapses, and the long-label case is 16px over after
 * the collapse has fired. Whether a further height term exists is Design's to
 * rule; this test says what the cell does today.
 */
const PASSWORD = process.env.E2E_PASSWORD ?? 'test-password-for-e2e';

async function login(page: Page) {
  await page.goto('/login');
  await page.locator('form[data-hydrated="true"]').waitFor({ timeout: 15_000 });
  await page.getByLabel('Password').pressSequentially(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL('/');
}

/** Seeds one of the extremes, suffixing every NAMED thing so parallel specs cannot collide. */
export async function seedExtreme(page: Page, extreme: IdentityExtreme): Promise<string> {
  const suffix = `x${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
  const post = async (path: string, data: unknown) => {
    const r = await page.request.post(path, { data, failOnStatusCode: false });
    /* Pressings are shared and found-or-created (§4), so the same catalogue posted twice is a 200 the second time. */
    expect([200, 201], `${path} returned ${r.status()}`).toContain(r.status());
    return r.json();
  };
  const artist = await post('/api/artists', { name: `${extreme.artist} ${suffix}` });
  trackArtist(artist.id);
  const label = await post('/api/labels', { name: `${extreme.label} ${suffix}` });
  const genreIds: string[] = [];
  for (const name of extreme.genres) genreIds.push((await post('/api/genres', { name: `${name} ${suffix}` })).id);
  const pressing = await post('/api/pressings', {
    catalogNumber: extreme.catalogNumber,
    yearPressed: extreme.yearPressed,
    countryPressed: extreme.countryPressed,
  });
  const format = await post('/api/formats', { name: `${extreme.format} ${suffix}` });
  const record = await post('/api/records', {
    title: extreme.title,
    artistId: artist.id,
    labelId: label.id,
    genreIds,
    pressingId: pressing.id,
    formatId: format.id,
    releaseYear: extreme.releaseYear,
  });
  return record.id as string;
}

test('§27: every pressing fact ends inside the cell on the collection’s worst title', async ({ page }) => {
  await login(page);
  const id = await seedExtreme(page, WORST);
  await page.setViewportSize({ width: GRID_FORK, height: NO_SCROLL_HEIGHT });
  await page.goto(`/records/${id}`);
  await page.locator('[data-cell="identity"] [data-field="title"]').waitFor({ timeout: 20_000 });
  await page.waitForTimeout(400);

  const m = await page.evaluate(() => {
    const cell = document.querySelector('[data-cell="identity"] [data-cell="identity"]') ?? document.querySelector('[data-cell="identity"]')!;
    const cs = getComputedStyle(cell);
    const inner = cell.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
    const contentBottom = cell.getBoundingClientRect().bottom - parseFloat(cs.paddingBottom);
    const content = cell.querySelector('[data-track="content"]')!;
    const track = cell.querySelector('[data-track="ornament"]')!.getBoundingClientRect();
    const facts = Array.from(cell.querySelectorAll('[data-block="pressing"] [data-field]')).map((el) => ({
      field: el.getAttribute('data-field') ?? '?',
      cut: +(el.getBoundingClientRect().bottom - contentBottom).toFixed(1),
    }));
    return {
      inner: Math.round(inner),
      needed: content.scrollHeight,
      ornament: +track.height.toFixed(1),
      margin: +(inner - content.scrollHeight - track.height).toFixed(1),
      collapsed: cell.querySelector('[data-field="genre-count"]') !== null,
      facts,
    };
  });

  console.log(`§27 worst title: margin ${m.margin}px (needed ${m.needed} + ornament ${m.ornament} against ${m.inner}), run ${m.collapsed ? 'collapsed' : 'listed'}`);

  expect(m.facts.length, 'the pressing block carries facts').toBeGreaterThan(0);
  for (const fact of m.facts) {
    expect(fact.cut, `${fact.field} ends inside the cell (positive = clipped by that many px)`).toBeLessThanOrEqual(0);
  }
});

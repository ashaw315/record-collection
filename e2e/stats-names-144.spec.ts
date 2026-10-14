import { expect, test, type Page } from '@playwright/test';
import sharp from 'sharp';
import { registerCleanup, trackArtist } from './cleanup';
import { login } from './sign-in';

/* The record and its artist removed after the test (e2e/cleanup.ts); the label and the store stay, as stats.spec's do. */
registerCleanup();

/**
 * **Stats' names paint the whole outside ring** (§T.6, Design, 14 Oct):
 * "Stats' names, labels and stores take the outside ring: each link is its
 * own clipper and the wrapper's classes move off it, so both bands paint,
 * the ellipsis falls inside the ring, and no exception reaches them."
 *
 * Read from the pixels, because the ring's rule (`globals.css`) and the
 * computed outline both say the ring is there while a wrapper's sideways
 * clip removes its left band: step 144's survey found it painted 0 of the
 * 32 pixels of the band, which is why the names were held. The probe that
 * costed the fix (14 Oct, bare browser) is this test on the real page: a
 * short name and a long one, the 2px band 4 to 2 left of the link's box
 * and the one 2 to 4 right of it, counted for ink over the box's height.
 * The long name is the first genre's link given a long text, since the
 * test database's names are short.
 *
 * Also guarded: the name's baseline. An inline block whose overflow is
 * `hidden` takes its bottom edge as its baseline and lifts the name 8px
 * off the count's; `clip` keeps the text's baseline (the probe's four
 * variants). Fails against the hold (`data-ring-held`, no ring at all),
 * against the wrapper clipping (left band 0), and against `overflow-hidden`
 * on the link (the baseline).
 */
const INK = 300; /* r+g+b below this is ink; paper is near 765, the ring var(--foreground) near 0. */

async function focusByKeyboard(page: Page, selector: string) {
  /* Focus the stop before it by script, then Tab: keyboard modality makes the stop :focus-visible, which element.focus() does not. */
  await page.evaluate((sel) => {
    const target = document.querySelector<HTMLElement>(sel);
    if (target === null) throw new Error(`no ${sel}`);
    const all = Array.from(document.querySelectorAll<HTMLElement>('a[href], button, input, select, textarea, summary, [tabindex]')).filter((el) => el.tabIndex >= 0 && el.getClientRects().length > 0);
    const i = all.indexOf(target);
    if (i < 1) throw new Error(`${sel} is first or not tabbable`);
    all[i - 1].focus();
  }, selector);
  await page.keyboard.press('Tab');
  expect(await page.evaluate((sel) => { const el = document.activeElement; return el !== null && el === document.querySelector(sel) && el.matches(':focus-visible'); }, selector), `${selector} focused by the keyboard`).toBe(true);
}

/** Ink pixels in the ring's left and right bands beside the link's box, of the pixels each band holds; plus the clip's and the baseline's readings. */
async function readRing(page: Page, selector: string) {
  const m = await page.locator(selector).first().evaluate((el) => {
    const r = el.getBoundingClientRect();
    const wrap = (el.parentElement as HTMLElement).getBoundingClientRect();
    const textRect = (node: Element) => { const range = document.createRange(); range.selectNodeContents(node); return range.getClientRects()[0]; };
    const row = el.closest('li, [data-testid^="genre-row-"]') as HTMLElement;
    const count = Array.from(row.querySelectorAll<HTMLElement>('span')).find((s) => s !== el.parentElement && /\d/.test(s.textContent ?? '') && s.getClientRects().length > 0 && !s.contains(el)) as HTMLElement;
    return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, wrapRight: wrap.right, cut: el.scrollWidth > el.clientWidth, nameBottom: textRect(el).bottom, countBottom: textRect(count).bottom };
  });
  const clip = { x: Math.floor(m.left) - 8, y: Math.floor(m.top) - 2, width: Math.ceil(m.right - m.left) + 16, height: Math.ceil(m.bottom - m.top) + 4 };
  const shot = await page.screenshot({ clip });
  const { data, info } = await sharp(shot).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const scale = info.width / clip.width;
  const ink = (x0: number, x1: number) => {
    let n = 0; let of = 0;
    for (let y = Math.round((m.top - clip.y) * scale); y < Math.round((m.bottom - clip.y) * scale); y += 1)
      for (let x = Math.round((x0 - clip.x) * scale); x < Math.round((x1 - clip.x) * scale); x += 1) {
        const i = (y * info.width + x) * 3; of += 1;
        if (data[i] + data[i + 1] + data[i + 2] < INK) n += 1;
      }
    return { n, of };
  };
  return { left: ink(m.left - 4, m.left - 2), right: ink(m.right + 2, m.right + 4), cut: m.cut, inside: m.right <= m.wrapRight + 0.5, baseline: Math.abs(m.nameBottom - m.countBottom) };
}

const GENRE = '[data-testid^="genre-row-"] a[href]';

async function post(page: Page, path: string, data: unknown) {
  const response = await page.request.post(path, { data, failOnStatusCode: false });
  expect(response.status(), `${path} ${JSON.stringify(data)}`).toBe(201);
  return response.json() as Promise<{ id: string }>;
}
/* Longer than the widest column this runs at: at 1280 the genre column held a hundred characters uncut. */
const LONG = 'A genre name long enough to be cut by the ellipsis at every width this runs at, and then some more, '.repeat(4);

for (const width of [390, 1280]) test(`stats’ names at ${width}: each name, label and store link paints both bands of the outside ring, a long name is cut inside its ring, and the name keeps the count’s baseline`, async ({ page }) => {
  await login(page);
  /* The test database seeds no store, so one record carries a label and a store of this test's own; the genre is the seed's first. */
  const suffix = `s${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
  const artist = await post(page, '/api/artists', { name: `Ring-${suffix}` });
  trackArtist(artist.id);
  const label = await post(page, '/api/labels', { name: `Label-${suffix}` });
  const store = await post(page, '/api/stores', { name: `Store-${suffix}` });
  await post(page, '/api/records', { title: `Ring ${suffix}`, artistId: artist.id, labelId: label.id, storeId: store.id });
  const NAMES: Array<[string, string]> = [
    ['a genre', GENRE],
    ['a label', `[data-testid="by-label"] a[href$="labelId=${label.id}"]`],
    ['a store', `[data-testid="by-store"] a[href$="storeId=${store.id}"]`],
  ];
  await page.setViewportSize({ width, height: 844 });
  await page.goto('/stats');
  await page.locator(GENRE).first().waitFor({ timeout: 30_000 });
  await page.evaluate(() => document.fonts.ready);
  const bad: string[] = [];
  for (const [what, selector] of NAMES) {
    const present = await page.locator(selector).count();
    expect(present, `${what} on stats, in the test database`).toBeGreaterThan(0);
    await focusByKeyboard(page, selector);
    const r = await readRing(page, selector);
    if (r.left.n < r.left.of * 0.8) bad.push(`${what}: left band ${r.left.n} of ${r.left.of}`);
    if (r.right.n < r.right.of * 0.8) bad.push(`${what}: right band ${r.right.n} of ${r.right.of}`);
    if (r.baseline > 2) bad.push(`${what}: the name's text bottom is ${r.baseline.toFixed(1)} from the count's`);
  }
  /* The long name: the first genre's link, its text replaced; the ellipsis falls inside the link, so the right band paints beside the cut. */
  await page.locator(GENRE).first().evaluate((el, text) => { el.textContent = text; }, LONG);
  await focusByKeyboard(page, GENRE);
  const long = await readRing(page, GENRE);
  if (!long.cut) bad.push('long: the link does not cut the name itself');
  if (!long.inside) bad.push('long: the link runs past its wrapper');
  if (long.left.n < long.left.of * 0.8) bad.push(`long: left band ${long.left.n} of ${long.left.of}`);
  if (long.right.n < long.right.of * 0.8) bad.push(`long: right band ${long.right.n} of ${long.right.of}`);
  if (long.baseline > 2) bad.push(`long: the name's text bottom is ${long.baseline.toFixed(1)} from the count's`);
  expect(bad).toEqual([]);
});

import { expect, test, type Page } from '@playwright/test';
import { registerCleanup, trackArtist } from './cleanup';
import { removeRecordsFor, seedRecords } from './seed';
import { login } from './sign-in';
import { wallMeasured } from './wall-measured';

/**
 * Step 156, a race found by the gate on 7553762 (27 Oct), and Design's ruling
 * on it: a zoom is not a navigation for §P.2. "An answer already drawn ends
 * with the view it was drawn in, and the new view starts with none", and in
 * both directions the record stays last-served.
 *
 * Measured first, five runs at 1440 on the build before the fix: the cell drew
 * at 135 to 161ms, and 50 to 65ms later the zoom's address committed, the
 * control remounted and the cell was gone, in the same frame every time. So a
 * press as the zoom landed was answered and then wiped.
 */
registerCleanup();
test.beforeEach(async ({ page }) => login(page));

type Frame = { t: number; far: boolean; drawn: number; same: boolean };

async function sample(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as { __frames: Frame[]; __control: Element | null };
    const drawn = (el: Element) => (el as HTMLElement).getClientRects().length > 0;
    w.__control = Array.from(document.querySelectorAll('[data-pick-control]')).find(drawn) ?? null;
    w.__frames = [];
    const t0 = performance.now();
    const tick = () => {
      const control = Array.from(document.querySelectorAll('[data-pick-control]')).find(drawn) ?? null;
      const f = {
        t: Math.round(performance.now() - t0),
        far: /[?&]wall=far/.test(location.search),
        drawn: Array.from(document.querySelectorAll('[data-pick-answer]')).filter(drawn).length,
        same: control !== null && control === w.__control,
      };
      const last = w.__frames[w.__frames.length - 1];
      if (last === undefined || last.far !== f.far || last.drawn !== f.drawn || last.same !== f.same) w.__frames.push(f);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

test('a press as the zoom out lands keeps its answer: the cell stays drawn and the control is not remounted, at 1440', async ({ page }) => {
  test.setTimeout(180_000);
  const suffix = `zr156${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
  const artist = (await (await page.request.post('/api/artists', { data: { name: `Race-${suffix}` } })).json()) as { id: string };
  trackArtist(artist.id);
  await seedRecords(artist.id, 'Race', suffix, 2);
  const runs: string[] = [];
  try {
    for (let run = 0; run < 5; run++) {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto(`/?artistId=${artist.id}`);
      await wallMeasured(page);
      await sample(page);
      await page.getByTestId('wall-zoom-out').click();
      /* As soon as the far view shows, with nothing waited for: the reader's press, not the test's. */
      await page.locator('[data-wall="overview"]').filter({ visible: true }).waitFor({ timeout: 30_000 });
      await page.locator('[data-pick-control] button').filter({ visible: true }).click();
      await page.waitForTimeout(3_000);
      const frames = await page.evaluate(() => (window as unknown as { __frames: Frame[] }).__frames);
      expect(frames.length, 'the precondition: frames were recorded').toBeGreaterThan(0);
      expect(frames.some((f) => f.far), 'the precondition: the zoom landed in the address').toBe(true);
      const last = frames[frames.length - 1];
      expect.soft({ cell: last?.drawn, same: last?.same }, `run ${run + 1}: after the zoom landed`).toEqual({ cell: 1, same: true });
      runs.push(frames.map((f) => `${f.t}ms ${f.far ? 'far' : 'near'} cell:${f.drawn} ${f.same ? 'same' : 'REMOUNTED'}`).join(' → '));
    }
  } finally {
    await removeRecordsFor(artist.id);
  }
  test.info().annotations.push(...runs.map((description, i) => ({ type: `run ${i + 1}`, description })));
});

/** The drawn control's button: a bare `/` carries two copies and a media query hides one. */
const press = (page: Page) => page.locator('[data-pick-control] button').filter({ visible: true }).click();
const cellTitle = (page: Page) =>
  page.evaluate(() => {
    const drawn = (el: Element) => (el as HTMLElement).getClientRects().length > 0;
    const cells = Array.from(document.querySelectorAll('[data-pick-answer]')).filter(drawn);
    return cells.length === 0 ? null : cells.map((c) => c.querySelector('[data-grid-title]')?.textContent ?? '').join('|');
  });
async function zoomOut(page: Page) {
  await page.getByTestId('wall-zoom-out').click();
  await expect(page).toHaveURL(/[?&]wall=far/);
  await page.locator('[data-wall="overview"]').filter({ visible: true }).waitFor({ timeout: 30_000 });
}
async function zoomIn(page: Page) {
  await page.locator('[data-run]').filter({ visible: true }).first().click();
  await expect(page).not.toHaveURL(/[?&]wall=far/);
  await page.locator('[data-wall="labelled"]').filter({ visible: true }).waitFor({ timeout: 30_000 });
}
/*
  A pool of two and a draw left to chance would pass half the time with the
  last-served rule lost on the zoom, so the draw is pinned at each end of the
  pool in turn: with the rule lost, one of the two serves the record again.
*/
const DRAWS = [0, 0.999];
const pin = (page: Page, draw: number) => page.evaluate((r) => { Math.random = () => r; }, draw);

async function twoRecords(page: Page): Promise<string> {
  const suffix = `zr156${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
  const artist = (await (await page.request.post('/api/artists', { data: { name: `Race-${suffix}` } })).json()) as { id: string };
  trackArtist(artist.id);
  await seedRecords(artist.id, 'Race', suffix, 2);
  return artist.id;
}

test('a far view’s answer ends with the far view: zoom in, no cell; zoom out again, still none; the next ask serves the other record', async ({ page }) => {
  test.setTimeout(180_000);
  const artistId = await twoRecords(page);
  try {
    for (const draw of DRAWS) {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto(`/?artistId=${artistId}`);
      await wallMeasured(page);
      await zoomOut(page);
      await pin(page, draw);
      await press(page);
      await expect.poll(() => cellTitle(page), { timeout: 10_000 }).not.toBeNull();
      const first = await cellTitle(page);
      await zoomIn(page);
      expect(await cellTitle(page), `draw ${draw}: the near view starts with no answer`).toBeNull();
      await zoomOut(page);
      expect(await cellTitle(page), `draw ${draw}: zooming out again does not bring the answer back`).toBeNull();
      await pin(page, draw);
      await press(page);
      await expect.poll(() => cellTitle(page), { timeout: 10_000 }).not.toBeNull();
      expect(await cellTitle(page), `draw ${draw}: the record stayed last-served across the zooms`).not.toBe(first);
    }
  } finally {
    await removeRecordsFor(artistId);
  }
});

test('a record the pick pulled on the near view stays last-served when the reader zooms out: the far view’s ask serves the other', async ({ page }) => {
  test.setTimeout(180_000);
  const artistId = await twoRecords(page);
  try {
    for (const draw of DRAWS) {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto(`/?artistId=${artistId}`);
      await wallMeasured(page);
      await press(page);
      await expect.poll(() => page.locator('[data-wall-container]').getAttribute('data-phase'), { timeout: 30_000 }).toBe('landed');
      const pulled = await page.locator('[data-pulled]').getAttribute('data-pulled');
      const listed = (await (await page.request.get(`/api/records?artistId=${artistId}&pageSize=100`)).json()) as { data: Array<{ id: string; title: string }> };
      const pulledTitle = listed.data.find((row) => row.id === pulled)?.title ?? null;
      expect(pulledTitle, 'the precondition: the pulled record is one of the two').not.toBeNull();
      await zoomOut(page);
      await pin(page, draw);
      await press(page);
      await expect.poll(() => cellTitle(page), { timeout: 10_000 }).not.toBeNull();
      const served = (await cellTitle(page)) ?? '';
      expect(served.length, 'the precondition: a titled cell').toBeGreaterThan(0);
      expect(served, `draw ${draw}: the far view served the record pulled on the near view`).not.toBe(pulledTitle);
    }
  } finally {
    await removeRecordsFor(artistId);
  }
});

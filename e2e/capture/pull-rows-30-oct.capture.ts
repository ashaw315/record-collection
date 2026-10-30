import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { login } from '../sign-in';
import { registerCleanup, trackArtist, trackRecord } from '../cleanup';
import { wallAtRest } from '../wall-ready';

/**
 * **A pull from each shelf, measured frame by frame (the coordinator, 30 Oct:
 * Adam reports the pull wrong mainly on the top shelf).** At 1440 by 900, on
 * the local dev server with no covers, at 22 and at 43 records. For each row:
 * the moving record's box, the scroll and the frame on every animation frame,
 * and stills. Written to `docs/captures/pull-rows-30-oct/`. Run with CAPTURE=1
 * --project=capture.
 */
const OUT = join('docs', 'captures', 'pull-rows-30-oct');
registerCleanup();

/* The gesture on a frozen clock, so a still is the moment it is named for. The moving box is on screen; the scroll is the wall's own region. */
const read = (page: Page) => page.evaluate(() => {
  const landing = document.querySelector('[data-pulled] [data-landing]')?.getBoundingClientRect();
  const region = document.querySelector('[data-region="wall"]') as HTMLElement | null;
  const svg = document.querySelector('[data-pulled]')?.closest('svg');
  return { x: landing?.x, y: landing?.y, w: landing?.width, h: landing?.height, top: region?.scrollTop, left: region?.scrollLeft, maxTop: region === null ? null : region.scrollHeight - region.clientHeight, viewBox: svg?.getAttribute('viewBox') };
});

for (const count of [22, 43]) {
  test(`a pull from each shelf at ${count} records`, async ({ page }) => {
    test.skip(process.env.CAPTURE !== '1', 'A capture tool: run with CAPTURE=1');
    test.setTimeout(240_000);
    mkdirSync(OUT, { recursive: true });
    await page.setViewportSize({ width: 1440, height: 900 });
    await login(page);
    const artist = await page.request.post('/api/artists', { data: { name: `Rows-${count}-${Date.now().toString(36)}` } });
    const artistId = ((await artist.json()) as { id: string }).id;
    trackArtist(artistId);
    /* The whole wall, no filter: a filter only empties seats, so the seventeen and any other record would hold theirs. */
    const total = () => page.evaluate(() => document.querySelectorAll('a[data-seat]').length);
    await page.goto('/');
    await wallAtRest(page);
    const already = await total();
    for (let i = already; i < count; i += 1) {
      const record = await page.request.post('/api/records', { data: { title: `Rows ${String(i).padStart(2, '0')}`, artistId } });
      trackRecord(((await record.json()) as { id: string }).id);
    }
    const result: Record<string, unknown> = { count, viewport: '1440x900' };
    await page.clock.install();
    const open = async () => {
      await page.goto('/');
      await wallAtRest(page);
    };
    await open();
    const rows = await page.evaluate(() => {
      /* Seats paint in sort order, not fill order: `data-seat-order` is the fill. */
      const seats = [...document.querySelectorAll('a[data-seat]')].map((a) => ({ id: a.getAttribute('data-seat'), order: Number(a.getAttribute('data-seat-order')) }));
      return seats.sort((a, b) => a.order - b.order);
    });
    result.seats = rows.length;
    expect(rows.length, 'the wall holds exactly this many records').toBe(count);
    /* Seat order is top row first: the row of a seat is its place in the fill, four rows of perShelf. */
    const per = Math.max(20, Math.ceil(count / 4));
    const inRow = (r: number) => rows.slice(r * per, (r + 1) * per);
    for (let r = 0; r < 4; r += 1) {
      const seats = inRow(r);
      result[`row${r}Seats`] = seats.length;
      if (seats.length === 0) continue;
      const seat = seats[Math.min(seats.length - 1, 1)];
      await open();
      const spine = page.locator(`a[data-seat="${seat.id}"] [data-spine]`).first();
      await spine.scrollIntoViewIfNeeded();
      await wallAtRest(page);
      const rest = { ...(await read(page)), seatY: await spine.evaluate((el) => Math.round(el.getBoundingClientRect().y)) };
      await page.clock.pauseAt(new Date(Date.now() + 1000));
      await spine.click({ force: true });
      const frames: unknown[] = [];
      for (let ms = 0; ms <= 1800; ms += 100) {
        frames.push({ ms, ...(await read(page)) });
        if (ms % 300 === 0) await page.screenshot({ path: join(OUT, `rows${count}-row${r}-${String(ms).padStart(4, '0')}ms.png`) });
        await page.clock.runFor(100);
      }
      result[`row${r}`] = { seat, rest, frames };
      await page.clock.resume();
    }
    writeFileSync(join(OUT, `rows${count}.json`), JSON.stringify(result));
    expect(result.seats).toBeGreaterThan(0);
  });
}

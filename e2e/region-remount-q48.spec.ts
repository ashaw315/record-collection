import { expect, test, type Page } from '@playwright/test';
import { registerCleanup, trackArtist } from './cleanup';
import { seedRecords } from './seed';
import { login } from './sign-in';
import { settled } from './wall-settle';

registerCleanup();

/**
 * **Q48: does the wall's region survive a zoom-in, and does the reader's view
 * survive with it?** On 6 Nov a repeat of wall-settle:78 under dev read the
 * region as absent mid-render ("no region"), with Next's dev indicator
 * "Rendering…" and the zoom-in's URL push (`?shelf=N`) fetching a server
 * payload around it. Read as that render remounting the region, unverified.
 * The claim that matters is not "the region is found" but "the reader's view
 * does not reset" (the coordinator, 6 Nov), so this samples every animation
 * frame from before the zoom-in's click to four seconds after its landing:
 * the region present, the same element (a remount is a new one), its scroll,
 * the landing count and the URL. After the landing nothing in this test moves
 * the view and nothing else seeds at one worker, so any change of scroll, or
 * of element, with no further landing, is the product moving the reader.
 */
const suffix = () => `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

type Frame = { t: number; present: boolean; same: boolean; left: number; top: number; limitX: number; limitY: number; landings: number; url: string };

/*
  A frame moved the reader when its scroll is not where it was put AND not at the scroller's limit on that axis at
  that frame. At four workers another worker's seed or cleanup changes the wall's extent (§W.12 sizes it by the whole
  collection) and the scroller re-clamps a view at its edge; that is the platform's clamp, not the product, and the
  first version of this test would have failed on it at a gate as wall-settle:78 did.
*/
const unclamped = (f: Frame, left: number, top: number) => (f.left !== left && f.left !== f.limitX) || (f.top !== top && f.top !== f.limitY);

async function sample(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as { __q48?: Frame[]; __q48el?: Element | null; __q48stop?: boolean };
    w.__q48 = [];
    w.__q48el = null;
    w.__q48stop = false;
    const t0 = performance.now();
    const tick = () => {
      const el = document.querySelector('[data-region="wall"]') as HTMLElement | null;
      if (el !== null && w.__q48el === null && document.querySelector('[data-wall="labelled"]') !== null) w.__q48el = el;
      w.__q48?.push({
        t: Math.round(performance.now() - t0),
        present: el !== null,
        same: el !== null && el === w.__q48el,
        left: el === null ? -1 : Math.round(el.scrollLeft),
        top: el === null ? -1 : Math.round(el.scrollTop),
        limitX: el === null ? -1 : el.scrollWidth - el.clientWidth,
        limitY: el === null ? -1 : el.scrollHeight - el.clientHeight,
        landings: (window as unknown as { __landings?: number }).__landings ?? 0,
        url: location.search,
      });
      if (!w.__q48stop) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

test('a zoom-in keeps the wall’s region and the reader’s view: no remount, no scroll change after the landing', async ({ page }) => {
  await login(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  const artist = await page.request.post('/api/artists', { data: { name: `Q48-${suffix()}` } });
  const artistId = (await artist.json()).id as string;
  trackArtist(artistId);
  await seedRecords(artistId, 'Q48', suffix(), 240);
  await page.goto(`/?artistId=${artistId}`);
  await expect(page.locator('[data-wall="labelled"]')).toBeVisible({ timeout: 30_000 });
  await page.getByTestId('wall-zoom-out').click();
  await expect(page.locator('[data-wall="overview"]')).toBeVisible();
  await page.evaluate(() => { (window as unknown as { __landings?: number }).__landings = 0; });
  await sample(page);
  await page.locator('[data-run]').first().click();
  await expect(page.locator('[data-wall="labelled"]')).toBeVisible();
  const at = await settled(page, 1);
  await page.waitForTimeout(4000);
  const frames = await page.evaluate(() => { const w = window as unknown as { __q48: Frame[]; __q48stop: boolean }; w.__q48stop = true; return w.__q48; });
  const landedAt = frames.findIndex((f) => f.landings >= 1);
  const after = frames.slice(landedAt);
  const absent = after.filter((f) => !f.present);
  const remounted = after.filter((f) => f.present && !f.same);
  const moved = after.filter((f) => f.present && f.landings === 1 && unclamped(f, at.write.left, at.write.top));
  const urls = [...new Set(frames.map((f) => f.url))];
  test.info().annotations.push({ type: 'q48', description: JSON.stringify({ frames: frames.length, landedAtMs: frames[landedAt]?.t, write: [at.write.left, at.write.top], absent: absent.length, remounted: remounted.length, moved: moved.length, firstMoved: moved[0] ?? null, firstAbsent: absent[0] ?? null, urls }) });
  expect(landedAt, 'the landing was seen').toBeGreaterThanOrEqual(0);
  expect(absent, 'the region is present on every frame after the landing').toEqual([]);
  expect(remounted, 'and it is the same element: no remount').toEqual([]);
  expect(moved, 'and the reader’s view is where the landing wrote it').toEqual([]);

  /*
    Then the reader scrolls (the failing repeat scrolled 240 down before its second wait, and its trace fetched
    a `?shelf=N` the zoom alone does not explain): after a reader's own scroll the region stays the same element
    and the view stays where the reader put it, for four seconds.
  */
  await sample(page);
  await page.evaluate(() => { (window as unknown as { __q48el?: Element | null }).__q48el = document.querySelector('[data-region="wall"]'); });
  const put = await page.evaluate(() => { const el = document.querySelector('[data-region="wall"]') as HTMLElement; el.scrollTop += 240; return { left: Math.round(el.scrollLeft), top: Math.round(el.scrollTop) }; });
  await page.waitForTimeout(4000);
  const later = await page.evaluate(() => { const w = window as unknown as { __q48: Frame[]; __q48stop: boolean }; w.__q48stop = true; return w.__q48; });
  const settledLater = later.filter((f) => f.t > 100);
  const absentLater = settledLater.filter((f) => !f.present);
  const remountedLater = settledLater.filter((f) => f.present && !f.same);
  const movedLater = settledLater.filter((f) => f.present && unclamped(f, put.left, put.top));
  test.info().annotations.push({ type: 'q48-scroll', description: JSON.stringify({ frames: later.length, put: [put.left, put.top], absent: absentLater.length, remounted: remountedLater.length, moved: movedLater.length, firstMoved: movedLater[0] ?? null, firstAbsent: absentLater[0] ?? null, urls: [...new Set(later.map((f) => f.url))] }) });
  expect(absentLater, 'after the reader’s scroll the region is present on every frame').toEqual([]);
  expect(remountedLater, 'and it is the same element').toEqual([]);
  expect(movedLater, 'and the view stays where the reader put it').toEqual([]);
});

import { mkdirSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { registerCleanup, trackArtist } from '../cleanup';
import { seedRecords } from '../seed';
import { login } from '../sign-in';
import { wallMeasured } from '../wall-measured';

/**
 * **Q4, for Adam: the re-roll, about 2.5 seconds, as a video from the build
 * (the coordinator, 6 Nov).** A pool of three on the near view at 1440 × 900;
 * SURPRISE ME pulls one, SURPRISE ME again puts it back and pulls another in
 * sequence (§P.3, pick-pull-156). The figure from the constants is 2462ms,
 * return plus pull; the question is whether that reads right, which a still
 * cannot show. Written to `docs/captures/reroll-q4/` as a webm named by the
 * window. Run with CAPTURE=1 --project=capture, against the build
 * (E2E_SERVER=build), since the motion is the artifact's.
 */
const OUT = join('docs', 'captures', 'reroll-q4');
registerCleanup();

async function poolOf(page: Page, count: number): Promise<string> {
  const suffix = `q4${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
  const artist = (await (await page.request.post('/api/artists', { data: { name: `Reroll-${suffix}` } })).json()) as { id: string };
  trackArtist(artist.id);
  await seedRecords(artist.id, 'Reroll', suffix, count);
  return artist.id;
}

const press = (page: Page) => page.locator('[data-pick-control]').filter({ visible: true }).getByRole('button', { name: /surprise me/i }).click();
const settledOut = async (page: Page) => {
  await expect.poll(() => page.locator('[data-wall-container]').getAttribute('data-phase'), { timeout: 30_000 }).toBe('landed');
  await expect.poll(() => page.locator('[data-pulled]').count(), { timeout: 30_000 }).toBe(1);
};

test('the re-roll at 1440 × 900, on video', async ({ browser }) => {
  test.skip(process.env.CAPTURE !== '1', 'A capture tool: run with CAPTURE=1');
  mkdirSync(OUT, { recursive: true });
  const [width, height] = [1440, 900];
  const context = await browser.newContext({ viewport: { width, height }, recordVideo: { dir: OUT, size: { width, height } } });
  const page = await context.newPage();
  await login(page);
  const artistId = await poolOf(page, 3);
  await page.goto(`/?artistId=${artistId}`);
  await wallMeasured(page);
  await page.waitForTimeout(800);
  await press(page);
  await settledOut(page);
  await page.waitForTimeout(1200);
  const t0 = Date.now();
  await press(page);
  await expect.poll(async () => (await page.locator('[data-pulled]').getAttribute('data-pulled').catch(() => null)) ?? '', { timeout: 30_000 }).not.toBe('');
  await settledOut(page);
  const elapsed = Date.now() - t0;
  await page.waitForTimeout(1200);
  const video = page.video();
  await context.close();
  if (video === null) throw new Error('no recording was made');
  renameSync(await video.path(), join(OUT, `reroll-${width}x${height}-measured-${elapsed}ms-of-2462ms.webm`));
});

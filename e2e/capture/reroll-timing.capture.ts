import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { registerCleanup, trackArtist } from '../cleanup';
import { seedRecords } from '../seed';
import { login } from '../sign-in';
import { wallMeasured } from '../wall-measured';

/**
 * **Q4's 3006 against 2462, timed inside the page (the coordinator, 8 Nov: is the 544 a uniform slowdown or a
 * stall?).** Q4's figure was taken in Node around a click and two `expect.poll`s, whose intervals step 100, 250, 500
 * and 1000ms, so it held the instrument as well as the motion. Here a recorder in the page keeps every animation
 * frame's time and the wall's `data-phase` (rest · swing · finish · landed · return), and a capture-phase listener
 * keeps the press's time, so each leg of the re-roll is timed by the page's own clock: the press to the return's
 * first frame, the return (RETURN_MS 861.5 by the constants), the gap until the queued pull's first frame, and the
 * pull to landed (OUT_MS 1600). A stall shows as one long frame interval; a slowdown as every leg long.
 *
 *     CAPTURE=1 E2E_SERVER=build npx playwright test --project=capture reroll-timing
 *
 * Five re-rolls without video and five with, since Q4 was recorded with video on. Writes
 * docs/measurements/reroll-q4/<stamp>.jsonl.
 */
registerCleanup();

const RECORDER = `window.__rr = { frames: [], presses: [] };
document.addEventListener('click', function (e) { if (e.target && e.target.closest && e.target.closest('[data-pick-control]')) window.__rr.presses.push(performance.now()); }, true);
(function tick(now) { var c = document.querySelector('[data-wall-container]'); if (c) window.__rr.frames.push([Math.round(now * 10) / 10, c.getAttribute('data-phase')]); requestAnimationFrame(tick); })(0);`;

async function poolOf(page: Page, count: number): Promise<string> {
  const suffix = `rt${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
  const artist = (await (await page.request.post('/api/artists', { data: { name: `Reroll-${suffix}` } })).json()) as { id: string };
  trackArtist(artist.id);
  await seedRecords(artist.id, 'Reroll', suffix, count);
  return artist.id;
}
const press = (page: Page) => page.locator('[data-pick-control]').filter({ visible: true }).getByRole('button', { name: /surprise me/i }).click();
const landed = (page: Page) => expect.poll(() => page.locator('[data-wall-container]').getAttribute('data-phase'), { timeout: 30_000 }).toBe('landed');

type Legs = { video: boolean; run: number; pressToReturn: number; ret: number; gap: number; pull: number; total: number; longestFrame: number; longestAt: string; frames: number };

/** The legs from the frames after the second press: phase changes on the page's clock. */
function legs(frames: Array<[number, string]>, pressAt: number): Omit<Legs, 'video' | 'run'> {
  const after = frames.filter(([t]) => t >= pressAt);
  const first = (phase: string, from = 0) => after.findIndex(([, p], i) => i >= from && p === phase);
  const r0 = first('return');
  /* A re-roll passes through no "rest": the queued pull begins in the commit that drops the returned record. So the return ends at its first frame in any other phase. */
  const rest = after.findIndex(([, p], i) => i > r0 && p !== 'return');
  const s0 = first('swing', rest);
  const l0 = first('landed', s0);
  if ([r0, rest, s0, l0].some((i) => i < 0)) throw new Error(`a phase never came: return ${r0}, rest ${rest}, swing ${s0}, landed ${l0}`);
  let longestFrame = 0; let longestAt = '';
  for (let i = 1; i <= l0; i += 1) {
    const d = after[i][0] - after[i - 1][0];
    if (d > longestFrame) { longestFrame = d; longestAt = `${after[i - 1][1]}→${after[i][1]} at +${Math.round(after[i][0] - pressAt)}ms`; }
  }
  const at = (i: number) => after[i][0];
  return { pressToReturn: at(r0) - pressAt, ret: at(rest) - at(r0), gap: at(s0) - at(rest), pull: at(l0) - at(s0), total: at(l0) - pressAt, longestFrame, longestAt, frames: l0 + 1 };
}

test('Q4: the re-roll’s legs on the page’s own clock, five runs without video and five with', async ({ browser }) => {
  test.skip(process.env.CAPTURE !== '1', 'A measurement tool: run with CAPTURE=1');
  test.setTimeout(600_000);
  const out: Legs[] = [];
  for (const video of [false, true]) {
    const dir = join('test-results', 'reroll-timing-video');
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, ...(video ? { recordVideo: { dir, size: { width: 1440, height: 900 } } } : {}) });
    const page = await context.newPage();
    await login(page);
    await page.addInitScript(RECORDER);
    const artistId = await poolOf(page, 3);
    await page.goto(`/?artistId=${artistId}`);
    await wallMeasured(page);
    await page.waitForTimeout(800);
    await press(page);
    await landed(page);
    for (let run = 1; run <= 5; run += 1) {
      await page.waitForTimeout(1200);
      await press(page);
      await expect.poll(() => page.locator('[data-wall-container]').getAttribute('data-phase'), { timeout: 30_000 }).toBe('return');
      await landed(page);
      await page.waitForTimeout(300);
      const { frames, presses } = (await page.evaluate('window.__rr')) as { frames: Array<[number, string]>; presses: number[] };
      const l = { video, run, ...legs(frames, presses[presses.length - 1]) };
      out.push(l);
      console.log(`${video ? 'video   ' : 'no video'} run ${run}: press→return ${l.pressToReturn.toFixed(1)}  return ${l.ret.toFixed(1)} (861.5)  gap ${l.gap.toFixed(1)}  pull ${l.pull.toFixed(1)} (1600)  total ${l.total.toFixed(1)} (2461.5)  longest frame ${l.longestFrame.toFixed(1)} (${l.longestAt})`);
    }
    await context.close();
  }
  const dir = join('docs', 'measurements', 'reroll-q4');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${new Date().toISOString().replace(/[:.]/g, '-')}.jsonl`), `${out.map((l) => JSON.stringify(l)).join('\n')}\n`);
});

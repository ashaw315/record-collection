import { expect, test, type Page } from '@playwright/test';
import { registerCleanup, trackArtist } from './cleanup';
import { removeRecordsFor, seedRecords } from './seed';
import { login } from './sign-in';
import { wallMeasured } from './wall-measured';

/**
 * §W's open question (27 Oct): with a record out on the near view, what does
 * the wall do when the reader zooms out, and again when they zoom back in?
 * §P.2 rules that the pick holds no pulled state across a zoom; the motion is
 * §W's, and no §W sentence covers it.
 *
 * MEASURED, NOT RULED. The coordinator rules from this report. It records
 * frame by frame, for a record pulled by its spine and one pulled by the
 * pick, and asserts only that it recorded something. When §W rules, the
 * ruling's assertion goes here and the name changes with it.
 */
registerCleanup();
test.beforeEach(async ({ page }) => login(page));

type Frame = { t: number; view: string; phase: string; out: string };

async function sample(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as { __frames: Frame[]; __mark: string };
    const drawn = (el: Element | null) => el !== null && (el as HTMLElement).getClientRects().length > 0;
    w.__frames = [];
    w.__mark = 'pulled';
    const t0 = performance.now();
    const tick = () => {
      const f = {
        t: Math.round(performance.now() - t0),
        view: `${drawn(document.querySelector('[data-wall="overview"]')) ? 'far' : drawn(document.querySelector('[data-wall="labelled"]')) ? 'near' : 'none'}${/[?&]wall=far/.test(location.search) ? '(url far)' : ''}`,
        phase: document.querySelector('[data-wall-container]')?.getAttribute('data-phase') ?? '',
        out: Array.from(document.querySelectorAll('[data-pulled]')).map((el) => (drawn(el) ? 'drawn' : 'undrawn')).join(',') || 'none',
      };
      const last = w.__frames[w.__frames.length - 1];
      if (last === undefined || last.view !== f.view || last.phase !== f.phase || last.out !== f.out) w.__frames.push({ ...f, t: f.t });
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}
const mark = (page: Page, label: string) => page.evaluate((l) => { (window as unknown as { __frames: Array<Frame | { t: number; mark: string }> }).__frames.push({ t: -1, mark: l }); }, label);

for (const source of ['spine', 'pick'] as const) {
  test(`measured, not ruled: a record out by its ${source}, the reader zooms out and back in, at 1440`, async ({ page }) => {
    test.setTimeout(120_000);
    const suffix = `zo156${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
    const artist = (await (await page.request.post('/api/artists', { data: { name: `Zoom-${suffix}` } })).json()) as { id: string };
    trackArtist(artist.id);
    await seedRecords(artist.id, 'Zoom', suffix, 2);
    try {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto(`/?artistId=${artist.id}`);
      await wallMeasured(page);
      if (source === 'spine') await page.locator('a[data-seat] [data-spine]').first().click();
      else await page.locator('[data-pick-control] button').filter({ visible: true }).click();
      await expect.poll(() => page.locator('[data-wall-container]').getAttribute('data-phase'), { timeout: 30_000 }).toBe('landed');
      await sample(page);
      await mark(page, 'zoom out pressed');
      const zoom = page.getByTestId('wall-zoom-out');
      const reachable = await zoom.isVisible();
      await zoom.click({ timeout: 5_000 }).catch(async (e: Error) => mark(page, `zoom out NOT clickable: ${e.message.split('\n')[0]}`));
      await page.waitForTimeout(2_500);
      await mark(page, 'zoom in by the run');
      await page.locator('[data-run]').filter({ visible: true }).first().click({ timeout: 5_000 }).catch(async (e: Error) => mark(page, `run NOT clickable: ${e.message.split('\n')[0]}`));
      await page.waitForTimeout(2_500);
      const frames = await page.evaluate(() => (window as unknown as { __frames: Array<Frame | { t: number; mark: string }> }).__frames);
      expect(frames.length, 'the precondition: frames were recorded').toBeGreaterThan(1);
      test.info().annotations.push({ type: `zoom-out control visible with the record out`, description: String(reachable) });
      test.info().annotations.push({ type: 'frames', description: frames.map((f) => ('mark' in f ? `[${f.mark}]` : `${f.t}ms ${f.view} ${f.phase} out:${f.out}`)).join(' → ') });
    } finally {
      await removeRecordsFor(artist.id);
    }
  });
}

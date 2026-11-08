import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { registerCleanup, trackArtist } from '../cleanup';
import { seedRecords } from '../seed';
import { login } from '../sign-in';

/**
 * **Two readings of Q3's captures, measured (the coordinator and Design, 8 Nov).**
 *
 * 1. SURPRISE ME was underlined in every answer capture and in none without. The control is `hover:underline`, and
 *    the far-view sheet presses it and then takes the answer shot with the pointer still on it. Here the computed
 *    `text-decoration-line` is read after the press with the pointer where the click left it, and again after the
 *    pointer leaves the page. The instrument is checked first on the answer it must give: hovered, `underline`;
 *    left, `none`.
 * 2. With an answer drawn the band host's shelf looked lighter in grey. The far drawing's lines are 1 unit wide in
 *    its own viewBox with no non-scaling stroke, so they thin as the drawing shrinks. Here the drawing's screen
 *    scale (its CTM) and so the 1-unit stroke's screen width are read with and without an answer, with the drawing's
 *    computed opacity and filter, which a dimming would change.
 *
 *     CAPTURE=1 E2E_SERVER=build npx playwright test --project=capture hover-and-scale
 *
 * At 1044 × 768, the band host, on a seeded pool. Writes docs/measurements/hover-scale/<stamp>.json.
 */
registerCleanup();

const control = (page: Page) => page.locator('[data-pick-control]').filter({ visible: true }).getByRole('button', { name: /surprise me/i });
const decoration = (page: Page) => control(page).evaluate((el) => getComputedStyle(el).textDecorationLine);
const drawing = (page: Page) =>
  page.locator('[data-wall="overview"]').filter({ visible: true }).evaluate((svg) => {
    const ctm = (svg as SVGSVGElement).getScreenCTM();
    const box = svg.getBoundingClientRect();
    let opacity = 1;
    let filter = 'none';
    for (let el: Element | null = svg; el !== null; el = el.parentElement) {
      const style = getComputedStyle(el);
      opacity *= Number(style.opacity);
      if (style.filter !== 'none') filter = style.filter;
    }
    return { scale: ctm === null ? null : Math.round(ctm.a * 1000) / 1000, height: Math.round(box.height * 10) / 10, opacity, filter };
  });

test('SURPRISE ME’s underline after a press, and the far drawing’s scale with and without an answer, at 1044 × 768', async ({ page }) => {
  test.skip(process.env.CAPTURE !== '1', 'A measurement tool: run with CAPTURE=1');
  test.setTimeout(180_000);
  await login(page);
  await page.setViewportSize({ width: 1044, height: 768 });
  const suffix = `hs${Date.now().toString(36)}`;
  const artist = (await (await page.request.post('/api/artists', { data: { name: `HoverScale-${suffix}` } })).json()) as { id: string };
  trackArtist(artist.id);
  await seedRecords(artist.id, 'HoverScale', suffix, 30);
  await page.goto(`/?artistId=${artist.id}`);
  await page.locator('[data-wall-container]:not([data-unmeasured])').waitFor({ timeout: 30_000 });
  await page.locator('[data-wall="overview"]').filter({ visible: true }).waitFor({ timeout: 30_000 });
  await page.evaluate(() => document.fonts.ready);
  await page.mouse.move(0, 0);

  /* The instrument, on answers it must give. */
  await control(page).hover();
  const hoveredCheck = await decoration(page);
  await page.mouse.move(0, 0);
  const leftCheck = await decoration(page);
  expect(hoveredCheck, 'the instrument reads a hover').toBe('underline');
  expect(leftCheck, 'the instrument reads no hover').toBe('none');

  const without = await drawing(page);
  await control(page).click();
  await page.locator('[data-pick-answer]').filter({ visible: true }).waitFor({ timeout: 10_000 });
  await page.waitForTimeout(1500);
  const afterPress = await decoration(page);
  const withAnswer = await drawing(page);
  await page.mouse.move(0, 0);
  const afterLeaving = await decoration(page);

  const out = {
    window: '1044x768',
    instrument: { hovered: hoveredCheck, left: leftCheck },
    surpriseMe: { afterPressPointerOnIt: afterPress, afterPointerLeft: afterLeaving },
    drawing: { without, withAnswer, strokeScreenWidth: { without: without.scale, withAnswer: withAnswer.scale } },
  };
  console.log(JSON.stringify(out, null, 1));
  const dir = join('docs', 'measurements', 'hover-scale');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${new Date().toISOString().replace(/[:.]/g, '-')}.json`), `${JSON.stringify(out, null, 1)}\n`);
});

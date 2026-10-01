import { expect, test, type Page } from '@playwright/test';
import { GRID_FORK, NO_SCROLL_HEIGHT } from '../src/app/records/[id]/band-geometry';
import { registerCleanup, trackArtist } from './cleanup';

registerCleanup();

/**
 * **§54 (step 62): the record with no cover is ink, flat.** "§5.3 stands as
 * written: with no cover, every one of §5.1's marks is ink, flat and at
 * full strength, and tint and shade have no role... The 0.55 alpha goes,
 * and so does every opacity on this record: the Plane's fallback of ink at
 * 0.14 too... the corner triangle and the quarter-disc in Images are absent
 * from the page on this record... each draws at ink, by the same rules that
 * place it on every other record. §49's tint field is not drawn."
 *
 * The probe page's `nocover` case is the extremes fixture's no-cover record
 * (the seeded seventeen all carry a spine colour, which is how this case
 * went unseen for eighteen days). §5.1's eight by name, at 1440 × 900 and
 * 390, with a full-page capture of each.
 */
const INK = 'oklch(0.19 0.008 60)';
const GREY = 'oklch(0.74 0.004 80)';
const PASSWORD = process.env.E2E_PASSWORD ?? 'test-password-for-e2e';

async function login(page: Page) {
  await page.goto('/login');
  await page.locator('form[data-hydrated="true"]').waitFor({ timeout: 15_000 });
  await page.getByLabel('Password').pressSequentially(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL('/');
}

test('§54: on the extremes fixture’s no-cover record every frame mark is ink at full strength and nothing is at an opacity -- at 1440 × 900 and 390, captured', async ({ page }) => {
  test.setTimeout(120_000);
  await login(page);
  const bad: string[] = [];
  for (const [w, h] of [[GRID_FORK, NO_SCROLL_HEIGHT], [390, 844]] as const) {
    await page.setViewportSize({ width: w, height: h });
    await page.goto('/wall/probe/page8a?case=nocover');
    await page.getByTestId('record-page-8a').waitFor({ timeout: 20_000 });
    await page.addStyleTag({ content: 'nextjs-portal{display:none!important}' });
    await page.waitForTimeout(600);
    const m = await page.evaluate(({ INK, GREY }) => {
      const R = (el: Element) => el.getBoundingClientRect();
      const drawn = (el: Element | null) => el !== null && el.getClientRects().length > 0 && R(el).width > 0 && R(el).height > 0;
      const bg = (el: Element | null) => (el ? getComputedStyle(el).backgroundColor : null);
      const out: string[] = [];
      const year = document.querySelector('[data-mark="releaseYearField"]'); if (bg(year) !== INK) out.push(`release-year field ${bg(year)}`);
      const bar = document.querySelector('[data-mark="sleeveBar"]'); if (!drawn(bar) || bg(bar) !== INK) out.push(`sleeve bar ${drawn(bar)} ${bg(bar)}`);
      const edge = document.querySelector('[data-mark="journalEdge"]'); if (!edge || getComputedStyle(edge).borderRightColor !== INK) out.push(`journal edge ${edge ? getComputedStyle(edge).borderRightColor : 'absent'}`);
      const disc = document.querySelector('[data-testid="construction-still"] [data-mark="disc"]'); if (!disc || getComputedStyle(disc).fill !== INK) out.push(`disc ${disc ? getComputedStyle(disc).fill : 'absent'}`);
      for (const f of Array.from(document.querySelectorAll('[data-testid="construction-still"] [data-face]'))) { const fill = getComputedStyle(f).fill; const step = f.getAttribute('data-step'); if (step === 'grey' ? fill !== GREY : fill !== INK) out.push(`face ${step} ${fill}`); }
      const arc = document.querySelector<HTMLElement>('[data-mark="provenanceArc"]'); if (!arc) out.push('provenance arc absent'); else if (bg(arc) !== INK) out.push(`provenance arc ${bg(arc)}`);
      /* The quarter-disc in Images and the region's triangle live in the route's lower region, which the probe page does not render; they are asserted on a seeded no-cover record below. The upper air's triangle (§37, 960 to 1439) is the probe's. */
      const tris = Array.from(document.querySelectorAll('[data-flat="triangle"]')).filter(drawn); for (const t of tris) if (bg(t) !== INK) out.push(`triangle ${bg(t)}`);
      if (document.querySelector('[data-mark="identityField"]')) out.push('a tint field is served');
      /* The rule, not the constant: no element on the page carries ink at any alpha. The still's shadow footprints (polygons with no face) are ink at 0.05, 0.09 and 0.2 on EVERY record, a drawing device and not one of §5.1's marks; excluded, and reported to Design with step 62. */
      for (const el of Array.from(document.querySelectorAll('*'))) { if (el.matches('[data-testid="construction-still"] polygon:not([data-face])')) continue; const cs = getComputedStyle(el); for (const v of [cs.backgroundColor, cs.fill, cs.borderRightColor, cs.color]) if (v.startsWith('oklch(0.19 0.008 60 /')) { out.push(`${el.tagName.toLowerCase()}[${el.getAttribute('data-mark') ?? el.getAttribute('data-flat') ?? el.getAttribute('data-cell') ?? ''}] at ${v}`); break; } }
      return { out, triangleDrawn: tris.length, arcState: arc?.getAttribute('data-plane') ?? null };
    }, { INK, GREY });
    if (w === GRID_FORK && m.arcState !== 'drawn') bad.push(`${GRID_FORK}: the provenance arc is ${m.arcState}, not drawn`);
    for (const o of m.out) bad.push(`${w}×${h}: ${o}`);
    await page.screenshot({ path: `docs/captures/step62-no-cover-${w}x${h}-ink.png`, fullPage: true });
    console.log(`  §54 NO COVER @${w}×${h}: triangles drawn ${m.triangleDrawn}, arc ${m.arcState}, ${m.out.length} findings`);
  }
  expect(bad, `§54 not met:\n  ${bad.join('\n  ')}`).toEqual([]);
});

async function post(page: Page, path: string, data: unknown) {
  const response = await page.request.post(path, { data, failOnStatusCode: false });
  expect(response.status(), `${path}`).toBe(201);
  return response.json();
}

/**
 * The two marks the probe page cannot host: the quarter-disc §53 rehoused in
 * Images and the region's triangle beside Journal are in the route's lower
 * region, so a no-cover record is made through the API (no image, no spine
 * colour) and read on the real route. The upper air's triangle is §37's,
 * from 960 to 1439, so it is read at 1000.
 */
test('§54: on a seeded no-cover record the quarter-disc in Images and the triangles draw at ink, by their usual placement', async ({ page }) => {
  test.setTimeout(120_000);
  await login(page);
  const suffix = `nc-${Date.now()}`;
  const artist = await post(page, '/api/artists', { name: `No Cover ${suffix}` });
  trackArtist(artist.id as string);
  const record = await post(page, '/api/records', { title: `Unphotographed ${suffix}`, artistId: artist.id });
  const bad: string[] = [];
  for (const [w, h, expectTriangleIn] of [[GRID_FORK, NO_SCROLL_HEIGHT, 'region'], [1000, NO_SCROLL_HEIGHT, 'upper-air'], [390, 844, null]] as const) {
    await page.setViewportSize({ width: w, height: h });
    await page.goto(`/records/${record.id}`);
    await page.locator('[data-region="extended-grid"]').waitFor({ timeout: 20_000 });
    await page.waitForTimeout(500);
    const m = await page.evaluate(({ INK }) => {
      const R = (el: Element) => el.getBoundingClientRect();
      const drawn = (el: Element | null) => el !== null && el.getClientRects().length > 0 && R(el).width > 0 && R(el).height > 0;
      const bg = (el: Element | null) => (el ? getComputedStyle(el).backgroundColor : null);
      const quarter = document.querySelector('[data-section="images"] [data-flat="quarterDisc"]');
      const region = document.querySelector('[data-region="extended-grid"] [data-cell="air"] [data-flat="triangle"]');
      const upper = document.querySelector('[data-upper-air] [data-flat="triangle"]');
      const field = document.querySelector('[data-mark="identityField"]');
      return { quarter: { drawn: drawn(quarter), bg: bg(quarter) }, region: { drawn: drawn(region), bg: bg(region) }, upper: { drawn: drawn(upper), bg: bg(upper) }, field: field !== null, ink: INK };
    }, { INK });
    const where = `${w}×${h}`;
    if (!m.quarter.drawn || m.quarter.bg !== INK) bad.push(`${where}: the quarter-disc in Images is ${m.quarter.drawn ? m.quarter.bg : 'not drawn'}`);
    if (expectTriangleIn === 'region' && (!m.region.drawn || m.region.bg !== INK)) bad.push(`${where}: the region's triangle is ${m.region.drawn ? m.region.bg : 'not drawn'}`);
    if (expectTriangleIn === 'upper-air' && (!m.upper.drawn || m.upper.bg !== INK)) bad.push(`${where}: the upper air's triangle is ${m.upper.drawn ? m.upper.bg : 'not drawn'}`);
    if (m.field) bad.push(`${where}: a tint field is served`);
    console.log(`  §54 SEEDED NO COVER @${where}: quarter-disc ${m.quarter.drawn ? m.quarter.bg : 'not drawn'}; region triangle ${m.region.drawn ? m.region.bg : 'not drawn'}; upper-air triangle ${m.upper.drawn ? m.upper.bg : 'not drawn'}`);
  }
  expect(bad, `§54 not met on the route:\n  ${bad.join('\n  ')}`).toEqual([]);
});

import { expect, test, type Page } from '@playwright/test';
import { registerCleanup, trackArtist } from './cleanup';
import { GRID_FORK, NO_SCROLL_HEIGHT, BANDS } from '../src/app/records/[id]/band-geometry';
import { STEP_GAP } from '../src/app/records/[id]/title-steps';

registerCleanup();
const PASSWORD = process.env.E2E_PASSWORD ?? 'test-password-for-e2e';
async function login(page: Page) {
  await page.goto('/login');
  await page.locator('form[data-hydrated="true"]').waitFor({ timeout: 15_000 });
  await page.getByLabel('Password').pressSequentially(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL('/');
}
async function post(page: Page, path: string, data: unknown) { return (await page.request.post(path, { data })).json(); }

type Ladder = { supply: number; below: number; steps: Array<{ size: number; lines: number; demand: number }>; chosen: number };

async function ladderOf(page: Page): Promise<Ladder> {
  const raw = await page.locator('[data-title-step]').getAttribute('data-ladder');
  expect(raw, 'the ladder published its measurement').not.toBeNull();
  return JSON.parse(raw as string) as Ladder;
}

/**
 * **§33's ladder, checked on the arithmetic it publishes.**
 *
 * "The title takes the largest step whose demand, with 24px of gap, is within
 * the cell's supply, set in at most three lines." The component writes what it
 * measured -- supply, the block below, and each step's lines and demand -- so
 * the choice can be asserted rather than trusted. Before this existed the
 * ladder read the block below as 0 and chose steps that overflowed the cell
 * by 46px and collapsed the genres run; the two specs that lost the field
 * were the only evidence.
 */
test('the chosen step’s demand plus the gap is within supply, and the run survives (§33)', async ({ page }) => {
  await login(page);
  const suffix = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
  /* A wrapping artist and a genres run: the two things the demand once missed. */
  const artist = await post(page, '/api/artists', { name: `Discharge-${suffix}` });
  trackArtist(artist.id as string);
  const genre = await post(page, '/api/genres', { name: `UK82-${suffix}` });
  const record = await post(page, '/api/records', { title: `Hear Nothing ${suffix}`, artistId: artist.id, releaseYear: 1982, genreIds: [genre.id] });

  await page.setViewportSize({ width: GRID_FORK, height: NO_SCROLL_HEIGHT });
  await page.goto(`/records/${record.id}`);
  await page.locator('[data-title-step][data-ladder]').waitFor({ timeout: 20_000 });
  await page.waitForTimeout(500);

  const ladder = await ladderOf(page);
  const chosen = ladder.steps.find((s) => s.size === ladder.chosen);
  expect(chosen, 'the chosen step was one it measured').toBeDefined();
  expect(ladder.below, 'the block below the title is in the demand').toBeGreaterThan(0);
  /*
    **`below` is what the cell holds besides the title, measured off the
    page, not the ladder's own claim.** The ladder once summed the TITLE
    BLOCK's other children -- the 17px eyebrow -- and never the pressing
    block, so it read 485 of 511 at 96 on a three-line title that rendered at
    588. The line cap hid it: every step that overflowed also set in four
    lines. With the cap withdrawn (§33) the measurement has to be right.
  */
  const rendered = await page.evaluate(() => {
    const outer = (el: Element) => { const b = el.getBoundingClientRect(); const s = getComputedStyle(el); return b.height + parseFloat(s.marginTop) + parseFloat(s.marginBottom); };
    const holder = document.querySelector('[data-title-step]')!;
    const track = holder.closest('[data-track="content"]')!;
    const cell = holder.closest<HTMLElement>('[data-cell="identity-content"]')!;
    const others = Array.from(track.querySelectorAll('*')).filter((el) => el.parentElement === track || el.parentElement === holder.parentElement).filter((el) => el !== holder && el !== holder.parentElement);
    return { below: others.reduce((sum, el) => sum + outer(el), 0), holder: outer(holder), overflows: cell.scrollHeight > cell.clientHeight };
  });
  expect(ladder.below, `the ladder's below (${ladder.below}) is the rendered eyebrow plus pressing block (${rendered.below.toFixed(1)})`).toBeCloseTo(rendered.below, 0);
  expect(chosen!.demand, `the chosen step's demand (${chosen!.demand}) is what the cell renders (${(rendered.holder + rendered.below).toFixed(1)})`).toBeCloseTo(rendered.holder + rendered.below, -1);
  expect(rendered.overflows, 'nothing overflows the cell').toBe(false);
  expect(chosen!.demand + STEP_GAP, `step ${ladder.chosen}: demand ${chosen!.demand} + ${STEP_GAP} within supply ${ladder.supply}`).toBeLessThanOrEqual(ladder.supply);
  /* And it is the LARGEST that fits: every larger step fails one of the two conditions. */
  for (const s of ladder.steps.filter((s) => s.size > ladder.chosen)) {
    /* §33: height is the only constraint; the line count is no longer capped. */
    expect(s.demand + STEP_GAP > ladder.supply, `step ${s.size} was rightly refused on height (lines ${s.lines}, demand ${s.demand})`).toBe(true);
  }

  /* The consequences on the page: the cell holds, and the genres run is not collapsed. */
  const cellH = await page.locator('[data-cell="identity"]').evaluate((el) => el.getBoundingClientRect().height);
  expect(cellH, 'the identity cell fits the band').toBeLessThanOrEqual(BANDS.identity);
  await expect(page.locator('[data-field="genres"]'), 'the run is present: the ladder cannot force the give order').toHaveCount(1);
  await expect(page.locator('[data-field="genres"]')).toContainText(`UK82-${suffix}`);
});

/**
 * **§33's worked example does not survive a correct demand, and this test
 * follows the rule rather than the example.**
 *
 * §33: "under this rule it is expected at 144 in three lines", because Code
 * had reported 144 "fitting on height with 59px to spare". That 59 came from
 * the ladder that read the block below the title as 0. Measured with the
 * block in the demand, on the emptiest fixture that carries this title:
 *
 *   supply 510 (the content track, 546 less 18 + 18 padding)
 *   144: three lines, demand 503 -- 503 + 24 = 527, refused by 17px
 *   120: two lines, demand 308 -- chosen
 *
 * On a record with a real pressing block the block is larger, so 144 is
 * further off. The rule -- largest step whose demand with 24px of gap is
 * within supply, at most three lines -- gives 120, and that is what is
 * asserted. The expectation in §33 is reported to Design as derived from a
 * wrong number, not as a defect in the rule.
 */
test('Loss Of Life takes 120: 144 sets in three lines but fails on height once the block is counted (§33)', async ({ page }) => {
  await login(page);
  const a = await post(page, '/api/artists', { name: 'MGMT' });
  const artistId = (a.id ?? a.error?.existingId) as string;
  trackArtist(artistId);
  const record = await post(page, '/api/records', { title: 'Loss Of Life', artistId, releaseYear: 2024 });
  await page.setViewportSize({ width: GRID_FORK, height: NO_SCROLL_HEIGHT });
  await page.goto(`/records/${record.id}`);
  await page.locator('[data-title-step][data-ladder]').waitFor({ timeout: 20_000 });
  await page.waitForTimeout(500);
  const ladder = await ladderOf(page);
  const at144 = ladder.steps.find((s) => s.size === 144);
  const at120 = ladder.steps.find((s) => s.size === 120);
  expect(at144?.lines, '144 sets in three lines').toBe(3);
  expect(at144!.demand + STEP_GAP, '…but its demand with the gap exceeds supply').toBeGreaterThan(ladder.supply);
  expect(at120?.lines).toBe(2);
  expect(at120!.demand + STEP_GAP).toBeLessThanOrEqual(ladder.supply);
  expect(ladder.chosen, 'so the largest step that fits is 120').toBe(120);
});

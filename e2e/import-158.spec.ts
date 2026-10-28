import { expect, test, type Page } from '@playwright/test';
import { registerCleanup, trackArtist } from './cleanup';
import { seedMatchCandidate } from './seed';
import { login } from './sign-in';
import { pointerIs } from './hit-area';
import { expectLabelControl, read } from './type-read';
import { collectionReportFromFixtures, reportAllSkipped } from '../test/fixtures/discogs/collection-report';

/**
 * Step 158, §T.6 (Design, 28 Oct): "The Discogs import stands on Manage as
 * a section of its own between hairlines, below the duplicate review and
 * above the section names. ... Its control is IMPORT FROM DISCOGS, a §9.3
 * label, as ADD RECORD is. While the import runs it reads IMPORTING… at the
 * label's drawn width, as SEARCHING… keeps SEARCH DISCOGS's, and it cannot
 * be pressed again. The report is drawn in the same section, beneath the
 * control, and a later import replaces it in the same place. It is three
 * lines in the order the import reports ... each with its count. Each
 * line's list opens on §T.1's + and starts closed ... A part with nothing
 * in it keeps its line with its count of 0 and no +. Below 640 the section
 * takes the column's full width, and the label wraps at 44 a line under a
 * coarse pointer."
 *
 * The route is answered here: the import runs on the server against
 * Discogs, which no test reaches (CLAUDE.md §2), and the server side is
 * held by the integration tests. The report answered is Adam's nine through
 * the real mapping, from the committed fixtures. Runs on chromium (1280,
 * fine) and mobile (390, coarse).
 */
registerCleanup();

const ROUTE = '**/api/discogs/import-collection';
const json = (body: unknown, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(body) });

const geometry = (page: Page) => page.evaluate(() => {
  const box = (el: Element | null) => { if (el === null) return null; const b = el.getBoundingClientRect(); const cs = getComputedStyle(el); return { top: b.top, bottom: b.bottom, left: b.left, width: b.width, borderTop: cs.borderTopWidth, borderBottom: cs.borderBottomWidth, borderLeft: cs.borderLeftWidth, fill: cs.backgroundColor, lineHeight: cs.lineHeight }; };
  const frame = document.querySelector('[data-screen-frame]') as HTMLElement;
  const fcs = getComputedStyle(frame);
  return {
    review: box(document.querySelector('[data-testid="match-review"]')),
    section: box(document.querySelector('[data-testid="discogs-import"]')),
    names: box(document.querySelector('nav[aria-label="Resource"]')),
    control: box(document.querySelector('[data-import-control]')),
    column: frame.getBoundingClientRect().width - parseFloat(fcs.paddingLeft) - parseFloat(fcs.paddingRight),
  };
});

test('IMPORT FROM DISCOGS: a §9.3 label in a section between hairlines below the review and above the section names; IMPORTING… at its drawn width and unpressable while the import runs; three lines with counts, lists closed and opening on +, the empty part at 0 with no +; a later import replaces the report', async ({ page }) => {
  const width = page.viewportSize()?.width ?? 1280;
  const pointer = await pointerIs(page);
  await login(page);
  const suffix = `i158${Date.now().toString(36)}`;
  const pair = await seedMatchCandidate({ name: `Import ${suffix}`, importedMbid: `mbid-${suffix}` });
  trackArtist(pair.importedId);
  trackArtist(pair.localId);

  const first = collectionReportFromFixtures();
  const second = reportAllSkipped(first);
  let calls = 0;
  let release: (() => void) | undefined;
  await page.route(ROUTE, async (route) => {
    calls += 1;
    if (calls === 1) await new Promise<void>((resolve) => { release = resolve; });
    await route.fulfill(json(calls === 1 ? first : second));
  });

  await page.goto('/manage');
  await expect(page.getByTestId('match-review')).toBeVisible({ timeout: 15_000 });
  await page.evaluate(() => document.fonts.ready);

  const before = await geometry(page);
  expect(before.section, 'the section is drawn').not.toBeNull();
  expect.soft(before.section, `${width}: a section between hairlines, no box, no fill`).toMatchObject({ borderTop: '1px', borderBottom: '1px', borderLeft: '0px', fill: 'rgba(0, 0, 0, 0)' });
  expect.soft(before.section?.top, `${width}: below the duplicate review`).toBeGreaterThanOrEqual(before.review?.bottom ?? Infinity);
  expect.soft(before.section?.bottom, `${width}: above the section names`).toBeLessThanOrEqual((before.names?.top ?? -Infinity) + 0.5);
  if (width < 640) expect.soft(before.section?.width, `${width}: the column's full width`).toBeCloseTo(before.column, 0);

  const control = page.locator('[data-import-control]');
  const [resting] = await read(page, '[data-import-control]');
  expectLabelControl(resting, `${width}: IMPORT FROM DISCOGS`);
  /* The reading shown; the control's whole text also holds the reading reserved beneath it. */
  const reading = control.locator('[data-import-reading]');
  await expect(reading).toHaveText('Import from Discogs');
  expect.soft(resting.height, `${width}: a label keeps its 44 line under both pointers`).toBe(44);
  if (pointer === 'coarse') expect.soft(before.control?.lineHeight, `${width}: wraps at 44 a line under a coarse pointer`).toBe('44px');
  expect(page.locator('[data-import-report]')).toHaveCount(0);

  await control.click();
  await expect(reading).toHaveText('Importing…');
  await expect(control).toBeDisabled();
  const running = await geometry(page);
  expect(running.control?.width, `${width}: IMPORTING… at the label's drawn width`).toBeCloseTo(before.control?.width ?? -1, 1);
  if (release === undefined) throw new Error('the route was not reached');
  release();

  const lines = page.locator('[data-import-line]');
  await expect(lines).toHaveCount(3);
  await expect(reading).toHaveText('Import from Discogs');
  await expect(control).toBeEnabled();
  await expect(lines.nth(0).locator('[data-import-summary]')).toHaveText(/^9 came in/);
  await expect(lines.nth(1).locator('[data-import-summary]')).toHaveText(/^0 skipped as already held/);
  await expect(lines.nth(2).locator('[data-import-summary]')).toHaveText(/^9 imported blank/);
  /* Closed: the lists are not shown, and the empty part has no mark. */
  await expect(lines.nth(0).locator('[data-import-items]')).toBeHidden();
  await expect(lines.nth(2).locator('[data-import-items]')).toBeHidden();
  await expect(lines.nth(0).locator('svg')).toHaveCount(1);
  await expect(lines.nth(1).locator('svg')).toHaveCount(0);
  await expect(lines.nth(2).locator('svg')).toHaveCount(1);
  /* The section names stay in view beneath a closed report. */
  const closed = await geometry(page);
  expect.soft(closed.names?.top, `${width}: the section names below the report`).toBeGreaterThanOrEqual(closed.section?.bottom ?? Infinity);

  /* Opens on the +. */
  await lines.nth(0).locator('[data-import-summary]').click();
  const items = lines.nth(0).locator('[data-import-items] li');
  await expect(items).toHaveCount(9);
  await expect(items.first()).toHaveText('Astrid Sonne — Great Doubt');
  await expect(lines.nth(0).locator('svg [data-mark-line="down"]')).toBeHidden();

  /* A later import replaces the report in the same place. */
  await control.click();
  await expect(lines.nth(1).locator('[data-import-summary]')).toHaveText(/^9 skipped as already held/);
  await expect(lines.nth(0).locator('[data-import-summary]')).toHaveText(/^0 came in/);
  await expect(page.locator('[data-import-report]')).toHaveCount(1);
  await expect(lines.nth(0).locator('svg')).toHaveCount(0);
  expect(calls).toBe(2);
});

test('what fails is said: a refused request as an alert in the section, a failed item named beneath the lines', async ({ page }) => {
  await login(page);
  const report = collectionReportFromFixtures();
  let calls = 0;
  await page.route(ROUTE, async (route) => {
    calls += 1;
    if (calls === 1) await route.fulfill(json({ error: { message: 'The Discogs token carries no username.', code: 'DISCOGS_NO_USERNAME' } }, 502));
    else await route.fulfill(json({ ...report, imported: report.imported.slice(1), failed: [{ releaseId: 29613763, reason: 'Discogs answered 500' }] }));
  });
  await page.goto('/manage');
  const control = page.locator('[data-import-control]');
  await control.click();
  await expect(page.getByTestId('discogs-import').getByRole('alert')).toHaveText('The Discogs token carries no username.');
  await expect(page.locator('[data-import-report]')).toHaveCount(0);
  await expect(control).toBeEnabled();
  await control.click();
  await expect(page.locator('[data-import-line]').nth(0).locator('[data-import-summary]')).toHaveText(/^8 came in/);
  await expect(page.getByTestId('discogs-import').getByRole('alert')).toHaveText('1 could not be imported: release 29613763 (Discogs answered 500).');
});

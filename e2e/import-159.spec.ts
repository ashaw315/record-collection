import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { registerCleanup, trackArtist } from './cleanup';
import { removeImportRuns, seedImportRun, seedMatchCandidate } from './seed';
import { login } from './sign-in';
import { pointerIs } from './hit-area';
import { INK, LABEL_INK, expectLabelControl, read } from './type-read';
import { collectionReportFromFixtures, reportAllSkipped } from '../test/fixtures/discogs/collection-report';

/**
 * Step 159, §T.6 (Design, 28 Oct, the rebuild of step 158's section): "The
 * report is four lines in one form, each release on exactly one of them:
 * what came in complete, what came in with a field blank, what was skipped
 * as already held, and what failed, each with its count. ... the four
 * counts add up to what Discogs holds ... A run that fails as a whole ...
 * draws no lines. It takes the section's one failure line in the reserved
 * slot, as look up's credential line does, and the last report stays
 * beneath it ... The report survives leaving Manage, and shows the last
 * run's lines on return, beneath a line naming when that run finished. ...
 * Before any run there is no report, only the control."
 *
 * The route is answered here: the import runs on the server against
 * Discogs, which no test reaches (CLAUDE.md §2), and the server side is
 * held by the integration tests, where the add-up is also asserted on the
 * real database. The report answered is Adam's nine through the real
 * mapping, from the committed fixtures. The return is shown from a run row
 * seeded as the route stores one. Runs on chromium (1280, fine) and mobile
 * (390, coarse).
 */
registerCleanup();
/* One table of runs shared by the two tests: in order on one worker, or the survival test's seeded row is drawn in the first test's "before any run". */
test.describe.configure({ mode: 'serial' });
test.afterEach(async () => { await removeImportRuns(); });

const ROUTE = '**/api/discogs/import-collection';
const json = (body: unknown, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(body) });
/** Discogs' own count of the collection, from its page, not from anything the import or the page computed. */
const DISCOGS_HOLDS = (JSON.parse(readFileSync('test/fixtures/discogs/collection-page-1.json', 'utf8')) as { pagination: { items: number } }).pagination.items;
const FINISHED = '2026-10-28T21:05:00.000Z';

const geometry = (page: Page) => page.evaluate(() => {
  const box = (el: Element | null) => { if (el === null) return null; const b = el.getBoundingClientRect(); const cs = getComputedStyle(el); return { top: b.top, bottom: b.bottom, left: b.left, width: b.width, borderTop: cs.borderTopWidth, borderBottom: cs.borderBottomWidth, borderLeft: cs.borderLeftWidth, fill: cs.backgroundColor, lineHeight: cs.lineHeight }; };
  const frame = document.querySelector('[data-screen-frame]') as HTMLElement;
  const fcs = getComputedStyle(frame);
  return {
    review: box(document.querySelector('[data-testid="match-review"]')),
    section: box(document.querySelector('[data-testid="discogs-import"]')),
    names: box(document.querySelector('nav[aria-label="Resource"]')),
    control: box(document.querySelector('[data-import-control]')),
    status: box(document.querySelector('[data-import-status]')),
    column: frame.getBoundingClientRect().width - parseFloat(fcs.paddingLeft) - parseFloat(fcs.paddingRight),
  };
});

/** The same ink by its channels: the mobile project's engine writes the lab values with one more decimal than the desktop's. */
const sameInk = (colour: string, inks: string[]) => {
  const channels = (css: string) => (css.match(/-?[\d.]+/g) ?? []).map(Number);
  const got = channels(colour);
  return inks.some((ink) => { const want = channels(ink); return want.length === got.length && want.every((v, i) => Math.abs(v - got[i]) < 0.01); });
};

const counts = async (page: Page) => {
  const texts = await page.locator('[data-import-line] [data-import-summary]').allTextContents();
  return texts.map((t) => Number(/^(\d+)/.exec(t.trim())?.[1]));
};

test('the import on Manage: before any run only the control and the reserved slot; a run draws the four lines in the drawn order, disjoint, adding up to what Discogs holds, closed and opening on +; a failed item is a line; a run that fails as a whole takes the slot and leaves the last report; a later run replaces it', async ({ page }) => {
  const width = page.viewportSize()?.width ?? 1280;
  const pointer = await pointerIs(page);
  await login(page);
  const suffix = `i159${Date.now().toString(36)}`;
  const pair = await seedMatchCandidate({ name: `Import ${suffix}`, importedMbid: `mbid-${suffix}` });
  trackArtist(pair.importedId);
  trackArtist(pair.localId);
  /* "Before any run there is no report": the table is shared, so a run another spec or project seeded is cleared first. The gate runs one project at a time; two at once can still cross here. */
  await removeImportRuns();

  const first = collectionReportFromFixtures();
  const withFailure = { ...first, imported: first.imported.slice(1), failed: [{ releaseId: 29613763, title: 'Great Doubt', artist: 'Astrid Sonne', reason: 'Discogs answered 500' }] };
  const allSkipped = reportAllSkipped(first);
  let calls = 0;
  let release: (() => void) | undefined;
  await page.route(ROUTE, async (route) => {
    calls += 1;
    if (calls === 1) await new Promise<void>((resolve) => { release = resolve; });
    if (calls === 3) return route.fulfill(json({ error: { message: 'The Discogs token carries no username.', code: 'DISCOGS_NO_USERNAME' } }, 502));
    const report = calls === 1 ? first : calls === 2 ? withFailure : allSkipped;
    return route.fulfill(json({ report, finishedAt: FINISHED }));
  });

  await page.goto('/manage');
  await expect(page.getByTestId('match-review')).toBeVisible({ timeout: 15_000 });
  await page.evaluate(() => document.fonts.ready);

  /* Before any run: the control, the slot reserved and empty, no report. */
  const before = await geometry(page);
  expect(before.section, 'the section is drawn').not.toBeNull();
  expect.soft(before.section, `${width}: a section between hairlines, no box, no fill`).toMatchObject({ borderTop: '1px', borderBottom: '1px', borderLeft: '0px', fill: 'rgba(0, 0, 0, 0)' });
  expect.soft(before.section?.top, `${width}: below the duplicate review`).toBeGreaterThanOrEqual(before.review?.bottom ?? Infinity);
  expect.soft(before.section?.bottom, `${width}: above the section names`).toBeLessThanOrEqual((before.names?.top ?? -Infinity) + 0.5);
  if (width < 640) expect.soft(before.section?.width, `${width}: the column's full width`).toBeCloseTo(before.column, 0);
  await expect(page.locator('[data-import-report]')).toHaveCount(0);
  await expect(page.locator('[data-import-status]')).toHaveText('');
  expect.soft(before.status?.top, `${width}: the slot is reserved before any run`).toBeGreaterThan(0);

  const control = page.locator('[data-import-control]');
  const reading = control.locator('[data-import-reading]');
  const [resting] = await read(page, '[data-import-control]');
  expectLabelControl(resting, `${width}: IMPORT FROM DISCOGS`);
  await expect(reading).toHaveText('Import from Discogs');
  expect.soft(resting.height, `${width}: a label keeps its 44 line under both pointers`).toBe(44);
  if (pointer === 'coarse') expect.soft(before.control?.lineHeight, `${width}: wraps at 44 a line under a coarse pointer`).toBe('44px');

  /* The run: IMPORTING… at the drawn width, unpressable. */
  await control.click();
  await expect(reading).toHaveText('Importing…');
  await expect(control).toBeDisabled();
  const running = await geometry(page);
  expect(running.control?.width, `${width}: IMPORTING… at the label's drawn width`).toBeCloseTo(before.control?.width ?? -1, 1);
  if (release === undefined) throw new Error('the route was not reached');
  release();

  /* The four lines in the drawn order, disjoint, adding up to Discogs' count. */
  const lines = page.locator('[data-import-line]');
  await expect(lines).toHaveCount(4);
  await expect(reading).toHaveText('Import from Discogs');
  await expect(control).toBeEnabled();
  expect(await lines.evaluateAll((els) => els.map((el) => el.getAttribute('data-import-line')))).toEqual(['complete', 'blank', 'skipped', 'failed']);
  await expect(lines.nth(0).locator('[data-import-summary]')).toHaveText(/^4 came in complete/);
  await expect(lines.nth(1).locator('[data-import-summary]')).toHaveText(/^5 came in with a field blank/);
  await expect(lines.nth(2).locator('[data-import-summary]')).toHaveText(/^0 skipped as already held/);
  await expect(lines.nth(3).locator('[data-import-summary]')).toHaveText(/^0 failed/);
  expect((await counts(page)).reduce((n, c) => n + c, 0), `${width}: the four counts add up to what Discogs holds`).toBe(DISCOGS_HOLDS);
  await expect(page.locator('[data-import-when]')).toHaveText(/^Last import, 28 October, \d\d:\d\d$/);
  /* Closed; the empty parts have no mark. */
  await expect(lines.nth(0).locator('[data-import-items]')).toBeHidden();
  await expect(lines.nth(1).locator('[data-import-items]')).toBeHidden();
  await expect(lines.nth(0).locator('svg')).toHaveCount(1);
  await expect(lines.nth(1).locator('svg')).toHaveCount(1);
  await expect(lines.nth(2).locator('svg')).toHaveCount(0);
  await expect(lines.nth(3).locator('svg')).toHaveCount(0);
  const closed = await geometry(page);
  expect.soft(closed.names?.top, `${width}: the section names below the report`).toBeGreaterThanOrEqual(closed.section?.bottom ?? Infinity);
  /*
    §T.6 (Design, 28 Oct, from step 158's captures): "Each of the four lines is a disclosure, and takes §T.6's 44
    line under both pointers, as the result card's disclosures do, in the type of Manage's row names. An open list's
    entries take the type and colour of Manage's second lines." Step 158 drew them at 10px, 28 apart under a fine
    pointer and 48 under a coarse one; this fails against that build.
  */
  const tops = await lines.evaluateAll((els) => els.map((el) => el.getBoundingClientRect().top));
  const pitches = tops.slice(1).map((t, i) => Math.round((t - tops[i]) * 10) / 10);
  expect(pitches, `${width} ${pointer}: the lines 44 apart`).toEqual([44, 44, 44]);
  const summaries = await read(page, '[data-import-line] [data-import-summary]');
  for (const s of summaries) {
    expect.soft(s, `${width}: a line in the row names' type, on the 44 line`).toMatchObject({ size: '13px', height: 44 });
    expect.soft(sameInk(s.colour, INK), `${width}: a line in ink (${s.colour})`).toBe(true);
  }
  const [entry] = await read(page, '[data-import-line="blank"] [data-import-items] li');
  expect.soft(entry, `${width}: an entry in the second lines' type`).toMatchObject({ size: '10px' });
  expect.soft(sameInk(entry.colour, LABEL_INK), `${width}: an entry in the second lines' colour (${entry.colour})`).toBe(true);
  /* Opens on the +. */
  await lines.nth(1).locator('[data-import-summary]').click();
  const items = lines.nth(1).locator('[data-import-items] li');
  await expect(items).toHaveCount(5);
  await expect(items.first()).toHaveText('OutKast — ATLiens: year 0');
  await expect(lines.nth(1).locator('svg [data-mark-line="down"]')).toBeHidden();

  /* A failed item is a line, not an alert; the counts still add up. */
  await control.click();
  await expect(lines.nth(3).locator('[data-import-summary]')).toHaveText(/^1 failed/);
  await expect(lines.nth(0).locator('[data-import-summary]')).toHaveText(/^3 came in complete/);
  expect((await counts(page)).reduce((n, c) => n + c, 0)).toBe(DISCOGS_HOLDS);
  await lines.nth(3).locator('[data-import-summary]').click();
  await expect(lines.nth(3).locator('[data-import-items] li')).toHaveText(['Astrid Sonne — Great Doubt: Discogs answered 500']);
  await expect(page.getByTestId('discogs-import').getByRole('alert')).toHaveCount(0);
  await expect(page.locator('[data-import-report]')).toHaveCount(1);

  /* A run that fails as a whole: the slot takes the line, the last report stays beneath it. */
  await control.click();
  await expect(page.locator('[data-import-status]')).toHaveText('The Discogs token carries no username.');
  await expect(lines).toHaveCount(4);
  await expect(lines.nth(3).locator('[data-import-summary]')).toHaveText(/^1 failed/);
  await expect(control).toBeEnabled();

  /* The next run replaces it, and clears the slot. */
  await control.click();
  await expect(lines.nth(2).locator('[data-import-summary]')).toHaveText(/^9 skipped as already held/);
  await expect(page.locator('[data-import-status]')).toHaveText('');
  await expect(lines.nth(3).locator('svg')).toHaveCount(0);
  expect(calls).toBe(4);
});

test('the report survives leaving Manage: on return the last run’s lines stand beneath the line naming when it finished', async ({ page }) => {
  await login(page);
  const report = collectionReportFromFixtures();
  await seedImportRun(report, FINISHED);
  await page.goto('/manage');
  const lines = page.locator('[data-import-line]');
  await expect(lines).toHaveCount(4);
  await expect(page.locator('[data-import-when]')).toHaveText(/^Last import, 28 October, \d\d:\d\d$/);
  expect(await lines.evaluateAll((els) => els.map((el) => el.getAttribute('data-import-line')))).toEqual(['complete', 'blank', 'skipped', 'failed']);
  expect((await counts(page)).reduce((n, c) => n + c, 0)).toBe(DISCOGS_HOLDS);
  await expect(lines.nth(0).locator('[data-import-items]')).toBeHidden();
  /* The line stands beneath the control and above the lines. */
  const [when, firstLine, control] = await Promise.all([
    page.locator('[data-import-when]').boundingBox(),
    lines.nth(0).boundingBox(),
    page.locator('[data-import-control]').boundingBox(),
  ]);
  expect((when?.y ?? 0) >= (control?.y ?? 0) + (control?.height ?? 0)).toBe(true);
  expect((firstLine?.y ?? 0) >= (when?.y ?? 0) + (when?.height ?? 0)).toBe(true);
  /* Leaving and coming back draws the same. */
  await page.goto('/');
  await page.goto('/manage');
  await expect(page.locator('[data-import-line]')).toHaveCount(4);
  await expect(page.locator('[data-import-when]')).toHaveText(/^Last import, 28 October/);
});

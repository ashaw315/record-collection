import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { registerCleanup } from './cleanup';
import { login } from './sign-in';
import { normalizeRelease } from '@/lib/discogs/normalize-release';

registerCleanup();

/**
 * Step 150, §T.6 "Part 3, look up and its result card" (Design, 15 and 16
 * Oct), in two units: A, the card's words; B, its layout. Unit A: "the
 * adds as I OWN THIS and I WANT THIS, unfilled and with no glyph, own
 * first", because "IN COLLECTION and ON WANT LIST, an earlier draft, named
 * a state rather than an action"; and "COMPARE PRESSINGS and IDENTIFY THIS
 * PRESSING as disclosures with + and −", the mark carrying the open state
 * where the words "Hide pressings" and "Hide pressing details" did. The
 * words are their own unit so that a red here is a word and not a layout
 * (the reviewer, 16 Oct).
 */
const RELEASE = JSON.parse(readFileSync('test/fixtures/discogs/release-collision-clay-lp-3-a.json', 'utf8')) as Record<string, unknown>;
const VERSIONS = JSON.parse(readFileSync('test/fixtures/discogs/master-versions-discharge.json', 'utf8')) as { versions: Array<Record<string, unknown>> };
const ORIGINAL = 381756;
const MASTER = 50683;

const result = (overrides: Record<string, unknown> = {}) => ({
  discogsId: ORIGINAL, type: 'master', masterId: MASTER, title: 'Hear Nothing See Nothing Say Nothing', artist: 'Discharge',
  thumbUrl: null, coverUrl: null, year: 1982, country: 'UK', label: 'Clay Records', catalogNumber: 'CLAY LP 3',
  formats: ['Vinyl', 'LP', 'Album'], formatText: null, genres: ['Rock'], styles: ['Hardcore', 'Punk'], isReissue: false,
  communityHave: 3739, communityWant: 2165, ownership: { tier: null, ownedPressing: null, wantedPriority: null, isTargetPressing: false },
  ...overrides,
});

const json = (body: unknown, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(body) });

async function stub(page: Page, results: Array<Record<string, unknown>>) {
  await page.route('**/api/discogs/search**', (route) => route.fulfill(json({ data: results, meta: { total: results.length, page: 1, pageSize: 25 } })));
  const raw = VERSIONS.versions.find((v) => v.id === ORIGINAL) ?? {};
  const version = { discogsId: ORIGINAL, title: 'Hear Nothing See Nothing Say Nothing', label: 'Clay Records', country: 'UK', year: 1982, catalogNumber: 'CLAY LP 3', formats: String(raw.format ?? 'LP, Album').split(', '), isReissue: false, thumbUrl: null, communityHave: 100, communityWant: 100, ownership: result().ownership };
  await page.route('**/api/discogs/master/*/versions**', (route) => route.fulfill(json({ data: [version], meta: { total: 1, page: 1, pageSize: 25, pages: 1, ownershipChecked: true } })));
  await page.route('**/api/discogs/master/*/spread*', (route) => route.fulfill(json({ error: { message: 'Not asked here.', code: 'UPSTREAM_ERROR' } }, 502)));
  await page.route('**/api/discogs/market/**', (route) => route.fulfill(json({ error: { message: 'Not asked here.', code: 'UPSTREAM_ERROR' } }, 502)));
  await page.route('**/api/discogs/release/*', (route) => route.fulfill(json(normalizeRelease(RELEASE))));
}

async function search(page: Page) {
  await page.goto('/lookup');
  await page.locator('form[data-hydrated="true"]').waitFor({ timeout: 15_000 });
  await page.getByLabel('Catalog no.').fill('CLAY LP 3');
  await page.getByRole('button', { name: 'Search Discogs' }).click();
  await expect(page.getByTestId('result-card').first()).toBeVisible({ timeout: 15_000 });
}

test.beforeEach(async ({ page }) => {
  await login(page);
});

/* Fails against the card as built: its links read "Add to collection" and "Add to want list". */
test('the card’s two actions read I own this then I want this, own first, each a link to its form with the release', async ({ page }) => {
  await stub(page, [result(), result({ discogsId: 6779382, isReissue: true })]);
  await search(page);
  const card = page.getByTestId('result-card').first();
  const own = card.getByRole('link', { name: 'I own this' });
  const want = card.getByRole('link', { name: 'I want this' });
  await expect(own).toHaveAttribute('href', `/records/new?discogsReleaseId=${ORIGINAL}`);
  await expect(want).toHaveAttribute('href', `/want-list/new?discogsReleaseId=${ORIGINAL}`);
  const names = await card.getByRole('link').evaluateAll((links) => links.map((l) => (l.textContent ?? '').trim()));
  expect(names.indexOf('I own this'), `own first, in ${names.join(' · ')}`).toBeLessThan(names.indexOf('I want this'));
  expect(names.filter((n) => /^Add to/.test(n)), 'the earlier words are gone').toEqual([]);
});

/* Fails against the card as built: the open state reads "Hide pressings" and "Hide pressing details", and nothing draws a mark. */
test('the two disclosures keep their names open and closed, the mark + closed and − open, and no "Hide" wording', async ({ page }) => {
  await stub(page, [result()]);
  await search(page);
  const card = page.getByTestId('result-card').first();
  const versions = card.getByTestId('expand-versions');
  const evidence = card.getByTestId('expand-evidence');
  const downStroke = (control: typeof versions) => control.locator('svg [data-mark-line="down"]');
  await expect(versions).toHaveText(/Compare pressings/);
  await expect(versions).toHaveAttribute('aria-expanded', 'false');
  await expect(downStroke(versions), 'closed: the + has its down stroke').toHaveCount(1);
  await versions.click();
  await expect(versions).toHaveAttribute('aria-expanded', 'true');
  await expect(card.getByRole('table')).toBeVisible({ timeout: 15_000 });
  await expect(versions, 'open: the name stands, not "Hide pressings"').toHaveText(/Compare pressings/);
  await expect(versions).not.toHaveText(/Hide/);
  await expect(downStroke(versions), 'open: the − is the bar alone').toHaveCount(0);

  await expect(evidence).toHaveText(/Identify this pressing/);
  await expect(downStroke(evidence)).toHaveCount(1);
  await evidence.click();
  await expect(card.getByTestId('pressing-evidence')).toBeVisible({ timeout: 15_000 });
  await expect(evidence, 'open: the name stands, not "Hide pressing details"').toHaveText(/Identify this pressing/);
  await expect(evidence).not.toHaveText(/Hide/);
  await expect(downStroke(evidence)).toHaveCount(0);
});

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Browser, type Page } from '@playwright/test';
import { normalizeRelease } from '@/lib/discogs/normalize-release';
import { pointerIs } from '../hit-area';
import { seedMatchCandidate } from '../seed';
import { login } from '../sign-in';
import { wholePage } from '../whole-page';

/**
 * Every screen that has had no design pass, in one folder, for Design to
 * rule several passes from one attachment (the coordinator, 12 Oct; the
 * list is the audit's, NOTES 12 Oct). "Screen" is a page of the app or a
 * state of one; the two windows are 390 under a coarse pointer and 1280
 * under a fine one.
 *
 * On the test database, with Discogs, the model and MusicBrainz answered
 * by stubs in the page's own request path, as the specs do: look up
 * searches live, a record's page calls Discogs, and most of these states
 * are reached by typing or pressing, which the read-only sheets on the
 * real collection do not do. So the data is fixtures', not the
 * collection's, and the table this writes says so.
 *
 * A state that could not be reached is a row that says why, never a
 * missing picture: each is tried by itself. Whole pages by `wholePage`;
 * a dialog is pictured in its window, since it is placed against it.
 *
 * Run with CAPTURE=1 --project=capture.
 */
const OUT = join('docs', 'captures', 'unpassed-screens-139');
const WINDOWS = [{ width: 390, pointer: 'coarse' as const }, { width: 1280, pointer: 'fine' as const }];
const HEIGHT = 844;
const NOWHERE = '00000000-0000-4000-8000-000000000000';

const MASTER = 50683;
const TITLE = 'Hear Nothing See Nothing Say Nothing';
const VERSIONS = JSON.parse(readFileSync('test/fixtures/discogs/master-versions-discharge.json', 'utf8')) as { versions: Array<Record<string, unknown>> };
const COLLISION_A = JSON.parse(readFileSync('test/fixtures/discogs/release-collision-clay-lp-3-a.json', 'utf8')) as Record<string, unknown>;
const COLLISION_B = JSON.parse(readFileSync('test/fixtures/discogs/release-collision-clay-lp-3-b.json', 'utf8')) as Record<string, unknown>;
const NO_OWNERSHIP = { tier: null, ownedPressing: null, wantedPriority: null, isTargetPressing: false };
const master = { discogsId: 381756, type: 'master', masterId: MASTER, title: TITLE, artist: 'Discharge', thumbUrl: null, coverUrl: null, year: 1982, country: 'UK', label: 'Clay Records', catalogNumber: 'CLAY LP 3', formats: ['Vinyl', 'LP', 'Album'], genres: ['Rock'], styles: ['Hardcore', 'Punk'], isReissue: false, communityHave: 3739, communityWant: 2165, ownership: NO_OWNERSHIP };
const collision = (discogsId: number) => ({ discogsId, type: 'release', masterId: MASTER, title: `Discharge - ${TITLE}`, artist: 'Discharge', thumbUrl: null, year: 1984, country: 'UK', label: 'Clay Records', catalogNumber: 'CLAY LP 3', formats: ['Vinyl', 'LP', 'Album', 'Repress'], formatText: 'Gatefold', isReissue: true, communityHave: null, communityWant: null, ownership: NO_OWNERSHIP });
const versionRows = VERSIONS.versions.slice(0, 6).map((raw) => ({ discogsId: raw.id, title: TITLE, label: raw.label ?? 'Clay Records', country: raw.country ?? 'UK', year: Number(raw.released ?? 1982), catalogNumber: raw.catno ?? 'CLAY LP 3', formats: String(raw.format ?? 'LP, Album').split(', '), isReissue: false, thumbUrl: null, communityHave: 100, communityWant: 100, ownership: NO_OWNERSHIP }));

const json = (body: unknown, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(body) });
/**
 * A request held until released, so a pending state stands still to be
 * pictured. Every one is released when its state is done: the first run of
 * this file left one held and stood for twenty minutes on the state after
 * it, with nothing to say which.
 */
const HOLDS: Array<() => void> = [];
function held() {
  let release: () => void = () => {};
  const wait = new Promise<void>((resolve) => { release = resolve; });
  HOLDS.push(release);
  return { wait, release };
}
/** No state may stand longer than this: one that does is a row that says so, and the rest are still taken. */
const STATE_LIMIT = 90_000;
/** `CAPTURE_ONLY=slug,slug` retakes those states and no others; `CAPTURE_WIDTHS=1280` at those windows only. The table of a partial run is written beside the whole run's, not over it. */
const ONLY = (process.env.CAPTURE_ONLY ?? '').split(',').map((slug) => slug.trim()).filter((slug) => slug !== '');
const WIDTHS = (process.env.CAPTURE_WIDTHS ?? '').split(',').map((width) => Number(width.trim())).filter((width) => width > 0);
const within = <T,>(work: Promise<T>, what: string): Promise<T> => Promise.race([work, new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`${what} did not finish in ${STATE_LIMIT / 1000}s`)), STATE_LIMIT))]);

async function searchStub(page: Page, results: unknown[]) {
  await page.route('**/api/discogs/search**', (route) => route.fulfill(json({ data: results, meta: { total: results.length, page: 1, pageSize: 25 } })));
}
async function marketStub(page: Page) {
  await page.route('**/api/discogs/market/**', (route) => route.fulfill(json({ numForSale: 11, lowestPrice: { value: 47.28, currency: 'USD' }, conditions: [{ grade: 'Near Mint (NM or M-)', value: 130.45 }, { grade: 'Very Good Plus (VG+)', value: 100.45 }, { grade: 'Very Good (VG)', value: 70.45 }], range: null, currency: 'USD' })));
}
async function search(page: Page) {
  await page.goto('/lookup');
  await page.locator('form[data-hydrated="true"]').waitFor({ timeout: 30_000 });
  await page.getByLabel('Artist').fill('Discharge');
  await page.getByRole('button', { name: 'Search Discogs' }).click();
}

/**
 * Ask Claude is not on the page in the test environment, on purpose: with no
 * model key the panel says so and offers nothing to press, which is the gate
 * that keeps a spec from ever reaching the model (CLAUDE.md §2, "features
 * the `.env.test` gate hides from E2E"). It is not worked round here. The
 * three states behind the button are rows that say this.
 */
async function askClaude(page: Page) {
  if ((await page.getByText('Gap analysis is not configured on this deployment.').count()) > 0) throw new Error('Ask Claude is not offered in the test environment: no model key, by design, so nothing can be pressed');
  await page.getByRole('button', { name: 'Ask Claude' }).click();
}

const DUPLICATE_RECORD = 'Bloodsuckers';
type Made = { artist: string; artistName: string; record: string; recordTitle: string; item: string; itemTitle: string; store: string; storeName: string; lineupName: string; duplicateName: string; paths: string[] };

/** One of everything the states need, through the API, with the paths to remove it again. */
async function make(page: Page): Promise<Made> {
  const paths: string[] = [];
  const post = async (path: string, data: unknown) => {
    const response = await page.request.post(path, { data, failOnStatusCode: false });
    expect(response.status(), `${path} ${JSON.stringify(data)}`).toBe(201);
    const { id } = (await response.json()) as { id: string };
    if (path !== '/api/influences') paths.unshift(`${path}/${id}`);
    return id;
  };
  /*
    Plain names, as a reader's would be, and none the seed already has. The first run stamped every name with the
    time ("Discharge mv602sef3200"), as specs do because they share a database side by side. A capture runs alone
    on a database truncated at its start and need not; and a stamp in a picture for a design pass is a string no
    reader sees, on screens where how a name wraps is the thing being ruled (12 Oct).
  */
  const artistName = 'GBH';
  const artist = await post('/api/artists', { name: artistName, formedYear: 1978, originCountry: 'UK' });
  const candidate = await post('/api/artists', { name: 'Anti-Cimex' });
  const recordTitle = 'City Baby Attacked by Rats';
  const record = await post('/api/records', { title: recordTitle, artistId: artist, releaseYear: 1982, notes: 'A note.', purchasePrice: '20.00' });
  await post('/api/influences', { sourceArtistId: candidate, targetArtistId: artist, strength: 4 });
  const itemTitle = 'Leather, Bristles, Studs and Acne';
  const item = await post('/api/want-list', { title: itemTitle, artistId: artist, priority: 2, maxPrice: '40.00', bestDigNotes: 'The 1981 Clay 12-inch, CLAY 6, with the poster. Matrix ends A1 / B1. Later pressings drop the poster and are cut quieter.' });
  const storeName = 'Jumbo Records';
  const store = await post('/api/stores', { name: storeName, city: 'Leeds', country: 'UK' });
  const lineupName = 'Chaos UK';
  await post('/api/artists', { name: lineupName });
  const duplicateName = 'The Varukers';
  const pair = await seedMatchCandidate({ name: duplicateName, importedMbid: '6f0e9b1c-2d4a-4c57-9a61-0b7d5c2e8f13', localRecordTitle: DUPLICATE_RECORD });
  paths.unshift(`/api/artists/${pair.importedId}`, `/api/artists/${pair.localId}`);
  return { artist, artistName, record, recordTitle, item, itemTitle, store, storeName, lineupName, duplicateName, paths };
}

async function unmake(page: Page, made: Made) {
  const records = (await (await page.request.get('/api/records?pageSize=200')).json()) as { data?: Array<{ id: string; title: string }> };
  for (const row of records.data ?? []) if (row.title === made.recordTitle || row.title === DUPLICATE_RECORD) await page.request.delete(`/api/records/${row.id}`, { failOnStatusCode: false });
  for (const path of made.paths) await page.request.delete(path, { failOnStatusCode: false });
}

const manageSection = async (page: Page, label: string, query = '') => {
  await page.goto(`/manage${query}`);
  await page.getByRole('navigation', { name: 'Resource' }).getByRole('button', { name: label, exact: true }).click();
  await expect(page.getByRole('region', { name: label })).toBeVisible();
};
/** Manage's row for a name, as the window shows it: a list row below 640, a table row from it. */
const manageRow = (page: Page, name: string) => ((page.viewportSize()?.width ?? 1280) < 640 ? page.locator('[data-manage-list]:visible [data-manage-row]').filter({ hasText: name }) : page.getByRole('row').filter({ hasText: name }));
const openManageRow = async (page: Page, name: string) => {
  const row = manageRow(page, name);
  await expect(row).toHaveCount(1, { timeout: 15_000 });
  if ((page.viewportSize()?.width ?? 1280) < 640) await row.locator('[data-manage-open]').click();
  return row;
};

type State = { screen: string; slug: string; state: string; signedOut?: boolean; inWindow?: boolean; arrange: (page: Page, made: Made) => Promise<void> };

const STATES: State[] = [
  { screen: 'not-found', slug: 'not-found-unknown-address', state: 'an address the app does not have', arrange: async (page) => { await page.goto('/no-such-page'); } },
  { screen: 'not-found', slug: 'not-found-dead-record', state: 'a record that is gone', arrange: async (page) => { await page.goto(`/records/${NOWHERE}`); } },
  { screen: 'not-found', slug: 'not-found-dead-want-list-item', state: 'a want-list item that is gone', arrange: async (page) => { await page.goto(`/want-list/${NOWHERE}`); } },

  { screen: '/login', slug: 'login-form', state: 'the form', signedOut: true, arrange: async (page) => { await page.goto('/login'); await page.locator('form[data-hydrated="true"]').waitFor({ timeout: 30_000 }); } },
  { screen: '/login', slug: 'login-signing-in', state: 'signing in, the answer held', signedOut: true, arrange: async (page) => {
    const hold = held();
    await page.route('**/api/auth/login', async (route) => { await hold.wait; await route.fulfill(json({ error: { message: 'Incorrect password', code: 'UNAUTHORIZED' } }, 401)); });
    await page.goto('/login');
    await page.locator('form[data-hydrated="true"]').waitFor({ timeout: 30_000 });
    await page.getByLabel('Password').pressSequentially('not-the-password');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByRole('button', { name: /signing in/i })).toBeVisible();
  } },
  { screen: '/login', slug: 'login-refused', state: 'a refused password (the answer stubbed: nothing is sent to the sign-in route)', signedOut: true, arrange: async (page) => {
    await page.route('**/api/auth/login', (route) => route.fulfill(json({ error: { message: 'Incorrect password', code: 'UNAUTHORIZED' } }, 401)));
    await page.goto('/login');
    await page.locator('form[data-hydrated="true"]').waitFor({ timeout: 30_000 });
    await page.getByLabel('Password').pressSequentially('not-the-password');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.locator('#password-error')).toBeVisible();
  } },

  { screen: '/suggestions', slug: 'suggestions-list', state: 'the list; Ask Claude’s panel as the test environment has it, not configured', arrange: async (page, made) => { await page.goto('/suggestions'); await expect(page.getByRole('listitem').filter({ hasText: 'Anti-Cimex' }).first()).toBeVisible(); } },
  { screen: '/suggestions', slug: 'suggestions-ask-thinking', state: 'Ask Claude, thinking (the answer held)', arrange: async (page) => {
    const hold = held();
    await page.route('**/api/suggestions/ai**', async (route) => { if (route.request().method() !== 'POST') return route.fallback(); await hold.wait; await route.fulfill(json({ data: { suggestions: [], dropped: 0 } })); });
    await page.goto('/suggestions');
    await askClaude(page);
    await expect(page.getByRole('button', { name: /thinking/i })).toBeVisible();
  } },
  { screen: '/suggestions', slug: 'suggestions-ask-failed', state: 'Ask Claude, failed', arrange: async (page) => {
    await page.route('**/api/suggestions/ai**', (route) => (route.request().method() === 'POST' ? route.fulfill(json({ error: { message: 'The suggestion service is at its limit for now.', code: 'RATE_LIMITED' } }, 429)) : route.fallback()));
    await page.goto('/suggestions');
    await askClaude(page);
    await expect(page.getByText('The suggestion service is at its limit for now.')).toBeVisible();
  } },
  { screen: '/suggestions', slug: 'suggestions-ask-answered', state: 'Ask Claude, answered', arrange: async (page) => {
    const suggestions = [
      { artist: 'Anti-Cimex', title: 'Raped Ass', reason: 'The Swedish answer to Discharge’s first singles, and the root of the d-beat you already hold.', genre: 'Hardcore' },
      { artist: 'The Varukers', title: 'Bloodsuckers', reason: 'UK82 from the same year and the same circuit; nothing in the collection covers it.', genre: 'UK82' },
      { artist: 'Crass', title: 'The Feeding of the 5000', reason: 'The anarcho side of the scene your punk shelf leaves out entirely.', genre: 'Anarcho-punk' },
    ];
    await page.route('**/api/suggestions/ai**', (route) => (route.request().method() === 'POST' ? route.fulfill(json({ data: { suggestions, dropped: 0 } })) : route.fallback()));
    await page.goto('/suggestions');
    await askClaude(page);
    await expect(page.getByText('The Feeding of the 5000')).toBeVisible();
  } },

  { screen: '/want-list/new', slug: 'want-list-new', state: 'the form, empty', arrange: async (page) => { await page.goto('/want-list/new'); await page.locator('form').first().waitFor(); } },
  { screen: '/want-list/[id]/edit', slug: 'want-list-edit', state: 'the form, an item in it', arrange: async (page, made) => { await page.goto(`/want-list/${made.item}/edit`); await page.locator('form').first().waitFor(); } },
  { screen: '/want-list/[id]', slug: 'want-list-item', state: 'an item, with a best-dig note', arrange: async (page, made) => { await page.goto(`/want-list/${made.item}`); await expect(page.getByText(made.itemTitle).first()).toBeVisible(); } },

  { screen: '/records/new', slug: 'record-new', state: 'the form as it opens', arrange: async (page) => { await page.goto('/records/new'); await page.locator('form[data-hydrated="true"]').waitFor({ timeout: 30_000 }); } },
  { screen: '/records/new', slug: 'record-new-everything-else-open', state: 'the form with Everything else opened', arrange: async (page) => {
    await page.goto('/records/new');
    await page.locator('form[data-hydrated="true"]').waitFor({ timeout: 30_000 });
    await page.locator('details').filter({ has: page.locator('summary', { hasText: 'Everything else' }) }).first().locator('summary').click();
  } },
  { screen: '/records/[id]/edit', slug: 'record-edit', state: 'the form, a record in it', arrange: async (page, made) => { await page.goto(`/records/${made.record}/edit`); await page.locator('form[data-hydrated="true"]').waitFor({ timeout: 30_000 }); } },

  { screen: '/manage', slug: 'manage-duplicate-review', state: 'the duplicate-artist review, one pair', arrange: async (page, made) => { await page.goto('/manage'); await expect(page.getByTestId('match-review').getByTestId('match-candidate').filter({ hasText: made.duplicateName })).toHaveCount(1, { timeout: 15_000 }); } },
  { screen: '/manage', slug: 'manage-duplicate-review-merge-asked', state: 'the review, Same artist pressed: its confirmation', arrange: async (page, made) => {
    await page.goto('/manage');
    const row = page.getByTestId('match-review').getByTestId('match-candidate').filter({ hasText: made.duplicateName });
    await row.getByRole('button', { name: /same artist/i }).click();
    await expect(row.getByTestId('merge-confirm')).toBeVisible();
  } },
  { screen: '/manage', slug: 'manage-proposed-hierarchy', state: 'Genres, a proposed hierarchy (the model’s answer stubbed): two of the seed’s own genres under two others, with records the seed holds', arrange: async (page) => {
    /*
      The seed's own genres and records, so every name in the picture is one a reader has: how a name and its
      evidence share a line at 390 is what this state is looked at for, and a made-up name is a made-up line.
      The first run's "Psychedelic Rock-mv602sef3200" wrapped where "Psychedelic Rock" may not; short invented
      names would have hidden a wrap the other way.
    */
    const all = (await (await page.request.get('/api/genres?pageSize=200')).json()) as { data?: Array<{ id: string; name: string }> };
    const id = (name: string) => { const found = all.data?.find((genre) => genre.name === name); if (found === undefined) throw new Error(`the seed has no genre called ${name}`); return found.id; };
    const pairings = [{ genreId: id('Psychedelic Rock'), genre: 'Psychedelic Rock', parentId: id('Rock'), parent: 'Rock' }, { genreId: id('Indie Rock'), genre: 'Indie Rock', parentId: id('Rock'), parent: 'Rock' }, { genreId: id('Indie Pop'), genre: 'Indie Pop', parentId: id('Pop'), parent: 'Pop' }];
    await page.route('**/api/genres/parent-suggestions', (route) => route.fulfill(json({ data: { pairings, noParentFits: [], dropped: 0, evidence: { 'Psychedelic Rock': { recordCount: 3, examples: ['The Doors — The Soft Parade'] }, 'Indie Rock': { recordCount: 2, examples: ['Death Grips — The Money Store'] }, 'Indie Pop': { recordCount: 1, examples: ['MGMT — Loss Of Life'] } } } })));
    await manageSection(page, 'Genres');
    await page.getByTestId('propose-parents').click();
    await expect(page.getByText('The Doors — The Soft Parade')).toBeVisible({ timeout: 15_000 });
  } },
  { screen: '/manage', slug: 'manage-lineup-picker', state: 'Artists, the lineup picker: two candidates of one name', arrange: async (page, made) => {
    const candidate = (mbid: string, score: number, disambiguation: string, lifeSpan: unknown) => ({ mbid, name: made.lineupName, score, type: 'Group', country: 'GB', disambiguation, lifeSpan });
    await page.route('**/api/artists/*/lineup', (route) => route.fulfill(json({ walked: false, candidates: [candidate('mb-dbeat', 100, 'UK hardcore punk/d-beat band', { begin: '1977', end: null, ended: false }), candidate('mb-other', 83, 'UK punk band, only one release', { begin: '1978', end: '1980', ended: true })] })));
    await manageSection(page, 'Artists', '?artists=all');
    const row = await openManageRow(page, made.lineupName);
    await row.getByRole('button', { name: /lineup/i }).click();
    await expect(page.getByTestId('lineup-picker')).toBeVisible({ timeout: 15_000 });
  } },
  { screen: '/manage', slug: 'manage-lineup-walking', state: 'Artists, a lineup walk under way (held), 12 found so far', arrange: async (page, made) => {
    const hold = held();
    await page.route('**/api/artists/*/lineup', async (route) => { await hold.wait; await route.fulfill(json({ walked: true, candidates: [], checked: 3, total: 3, partial: false, text: '3 members.' })); });
    await page.route('**/api/artists/*/lineup/progress', (route) => route.fulfill(json({ found: 12 })));
    await manageSection(page, 'Artists', '?artists=all');
    const row = await openManageRow(page, made.lineupName);
    await row.getByRole('button', { name: /lineup/i }).click();
    await expect(page.getByTestId('lineup-progress')).toContainText(/12/, { timeout: 15_000 });
  } },
  { screen: '/manage', slug: 'manage-lineup-walked', state: 'Artists, a lineup walk finished', arrange: async (page, made) => {
    await page.route('**/api/artists/*/lineup', (route) => route.fulfill(json({ walked: true, candidates: [], checked: 3, total: 3, partial: false, text: '3 members.' })));
    await page.route('**/api/artists/*/lineup/progress', (route) => route.fulfill(json({ found: 12 })));
    await manageSection(page, 'Artists', '?artists=all');
    const row = await openManageRow(page, made.lineupName);
    await row.getByRole('button', { name: /lineup/i }).click();
    await expect(page.getByTestId('lineup-result')).toContainText(/3 members/i, { timeout: 15_000 });
  } },
  { screen: '/manage', slug: 'manage-stores-row-open', state: 'Stores, a row open (below 640) or being edited (from 640), nothing changed', arrange: async (page, made) => {
    await manageSection(page, 'Stores');
    const row = await openManageRow(page, made.storeName);
    if ((page.viewportSize()?.width ?? 1280) >= 640) await row.getByRole('button', { name: `Edit ${made.storeName}` }).click();
  } },
  { screen: '/manage', slug: 'manage-stores-row-changed-close-asked', state: 'Stores, below 640: a changed row pressed again, asked DISCARD CHANGES or KEEP EDITING', arrange: async (page, made) => {
    if ((page.viewportSize()?.width ?? 1280) >= 640) throw new Error('not a state from 640: the table’s edit has Cancel and is not asked');
    await manageSection(page, 'Stores');
    const row = await openManageRow(page, made.storeName);
    await row.getByLabel(`${made.storeName} city`, { exact: true }).fill('York');
    await row.locator('[data-manage-open]').click();
    await expect(row.locator('[data-manage-confirm]')).toBeVisible();
  } },

  { screen: 'the shared dialog', slug: 'dialog-from-record-page', state: 'opened by Delete record on a record’s page', inWindow: true, arrange: async (page, made) => {
    await page.route('**/api/discogs/**', (route) => route.fulfill(json({ error: { message: 'Not asked in a capture.', code: 'UPSTREAM_ERROR' } }, 502)));
    await page.goto(`/records/${made.record}`);
    const direct = page.locator('[data-app-nav] [data-control="delete"]:visible');
    if ((await direct.count()) === 0) await page.locator('[data-app-nav]').getByRole('button', { name: /menu/i }).click();
    await page.locator('[data-control="delete"]:visible').first().click();
    await expect(page.getByRole('dialog')).toBeVisible();
  } },
  { screen: 'the shared dialog', slug: 'dialog-from-want-list-row', state: 'opened by Delete on a want-list row', inWindow: true, arrange: async (page, made) => {
    await page.goto('/want-list');
    await page.getByRole('listitem').filter({ hasText: made.itemTitle }).getByRole('button', { name: 'Delete' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
  } },
  { screen: 'the shared dialog', slug: 'dialog-from-manage', state: 'opened by Delete on a store in manage', inWindow: true, arrange: async (page, made) => {
    await manageSection(page, 'Stores');
    const row = await openManageRow(page, made.storeName);
    await row.getByRole('button', { name: `Delete ${made.storeName}`, exact: true }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
  } },

  { screen: '/lookup', slug: 'lookup-form', state: 'before a search', arrange: async (page) => { await page.goto('/lookup'); await page.locator('form[data-hydrated="true"]').waitFor({ timeout: 30_000 }); } },
  { screen: '/lookup', slug: 'lookup-searching', state: 'searching (the answer held)', arrange: async (page) => {
    const hold = held();
    await page.route('**/api/discogs/search**', async (route) => { await hold.wait; await route.fulfill(json({ data: [], meta: { total: 0, page: 1, pageSize: 25 } })); });
    await search(page);
    await expect(page.getByRole('button', { name: /searching/i })).toBeVisible();
  } },
  { screen: '/lookup', slug: 'lookup-search-failed', state: 'the search failed: Discogs’ rate limit', arrange: async (page) => {
    await page.route('**/api/discogs/search**', (route) => route.fulfill(json({ error: { message: 'Discogs rate limit reached. Try again in a moment.', code: 'RATE_LIMITED' } }, 429)));
    await search(page);
    await expect(page.getByTestId('lookup-error')).toBeVisible();
  } },
  { screen: '/lookup', slug: 'lookup-nothing-found', state: 'nothing found', arrange: async (page) => { await searchStub(page, []); await search(page); await expect(page.getByText('Nothing found. Try another search.')).toBeVisible(); } },
  { screen: '/lookup', slug: 'lookup-result-cards', state: 'three results: a master and two releases identical on every column; the market not yet asked', arrange: async (page) => {
    await searchStub(page, [master, collision(4878030), collision(10405725)]);
    await search(page);
    await expect(page.getByTestId('result-card')).toHaveCount(3);
  } },
  { screen: '/lookup', slug: 'lookup-result-card-market-answered', state: 'one result, its market answered with a price and three estimates', arrange: async (page) => {
    await searchStub(page, [collision(10405725)]);
    await marketStub(page);
    await search(page);
    await expect(page.getByTestId('market-summary')).toBeVisible({ timeout: 15_000 });
  } },
  { screen: '/lookup', slug: 'lookup-result-card-market-failed', state: 'one result, its market refused', arrange: async (page) => {
    await searchStub(page, [collision(10405725)]);
    await page.route('**/api/discogs/market/**', (route) => route.fulfill(json({ error: { message: 'Discogs rejected this deployment’s credential. Lookups are unavailable until it is corrected.', code: 'DISCOGS_UNAUTHORIZED' } }, 502)));
    await search(page);
    await expect(page.getByTestId('market-error')).toBeVisible({ timeout: 15_000 });
  } },
  { screen: '/lookup', slug: 'lookup-version-table', state: 'a master’s versions opened, six rows', arrange: async (page) => {
    await searchStub(page, [master]);
    await marketStub(page);
    await page.route('**/api/discogs/master/*/versions**', (route) => route.fulfill(json({ data: versionRows, meta: { total: versionRows.length, page: 1, pageSize: 25, pages: 1, ownershipChecked: true } })));
    await page.route('**/api/discogs/master/*/spread*', (route) => route.fulfill(json({ error: { message: 'Not asked in a capture.', code: 'UPSTREAM_ERROR' } }, 502)));
    await search(page);
    await page.getByTestId('result-card').first().getByTestId('expand-versions').click();
    await expect(page.getByRole('table').first()).toBeVisible({ timeout: 15_000 });
  } },
  { screen: '/lookup', slug: 'lookup-pressing-evidence', state: 'one result, Identify this pressing opened', arrange: async (page) => {
    await searchStub(page, [collision(10405725)]);
    await marketStub(page);
    await page.route('**/api/discogs/release/*', (route) => route.fulfill(json(normalizeRelease((Number(new URL(route.request().url()).pathname.split('/').pop()) === 4878030 ? COLLISION_A : COLLISION_B) as never))));
    await search(page);
    await expect(page.getByTestId('check-market')).toHaveCount(0, { timeout: 15_000 });
    await page.getByTestId('expand-evidence').click();
    await expect(page.locator('[data-testid^="evidence-"]').first()).toBeVisible({ timeout: 15_000 });
  } },
  { screen: '/lookup', slug: 'lookup-pressing-evidence-failed', state: 'one result, Identify this pressing failed', arrange: async (page) => {
    await searchStub(page, [collision(10405725)]);
    await marketStub(page);
    await page.route('**/api/discogs/release/*', (route) => route.fulfill(json({ error: { message: 'Discogs could not be reached.', code: 'UPSTREAM_ERROR' } }, 502)));
    await search(page);
    await expect(page.getByTestId('check-market')).toHaveCount(0, { timeout: 15_000 });
    await page.getByTestId('expand-evidence').click();
    await expect(page.getByTestId('evidence-error')).toBeVisible({ timeout: 15_000 });
  } },
];

/**
 * The pointer is taken off the page's controls before every picture. A
 * press leaves it resting on what it pressed, and under a fine pointer the
 * picture then carries that control's hover: a state no reader put there.
 * The first sixty-seven were taken without this; eleven of the proposed
 * 1280 pictures were retaken with it (`CAPTURE_ONLY`, 12 Oct). The corner
 * is the header's own padding, with nothing under it to hover.
 */
async function settle(page: Page) {
  await page.mouse.move(1, 1);
  await page.addStyleTag({ content: 'nextjs-portal{display:none!important}' }).catch(() => {});
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(500);
}

async function inWindow(browser: Browser, window: (typeof WINDOWS)[number], signedOut: boolean) {
  const context = await browser.newContext({ hasTouch: window.pointer === 'coarse', viewport: { width: window.width, height: HEIGHT } });
  const page = await context.newPage();
  /* An action waits this long and no longer: with no limit, a control that is not there held the first run for twenty minutes and the second for ninety seconds a state. */
  context.setDefaultTimeout(20_000);
  /* No state here may reach Discogs, the model or MusicBrainz: whatever a state does not answer itself is refused, loudly. */
  await context.route(/discogs\.com|musicbrainz\.org|anthropic\.com/, (route) => route.abort());
  if (!signedOut) await login(page);
  return { context, page };
}

test('every screen with no design pass, at 390 under a coarse pointer and 1280 under a fine one', async ({ browser }) => {
  test.skip(process.env.CAPTURE !== '1', 'A capture tool: run with CAPTURE=1');
  /* A whole run does not replace a folder that exists: see the note in `suggestions-configured-139.capture.ts`. A named retake (`CAPTURE_ONLY`) replaces the pictures it names, whose originals are set aside by whoever asks for it. */
  if (ONLY.length === 0 && WIDTHS.length === 0 && existsSync(join(OUT, 'unpassed-screens-139.md')) && process.env.CAPTURE_REPLACE !== '1') throw new Error(`${OUT} already holds a capture. It is not replaced unless CAPTURE_REPLACE=1 says so`);
  test.setTimeout(1_800_000);
  mkdirSync(OUT, { recursive: true });
  const md = ['# The screens with no design pass, in one folder', '', 'The test database with fixtures and stubbed answers, not the real collection: these states are reached by typing, pressing or a search, which the read-only sheets do not do. Desktop Chromium, touch on for the coarse pointer. A screen is a page of the app or a state of one; the windows are 390 coarse and 1280 fine. Whole pages, but for the dialog, which is pictured in a window of 844.', '', '| screen | state | window | pointer | page height | picture, or why there is none |', '|---|---|---|---|---|---|'];
  const missed: string[] = [];
  for (const window of WINDOWS.filter((each) => WIDTHS.length === 0 || WIDTHS.includes(each.width))) {
    const signedIn = await inWindow(browser, window, false);
    expect(await pointerIs(signedIn.page)).toBe(window.pointer);
    const made = await make(signedIn.page);
    try {
      for (const state of STATES.filter((each) => ONLY.length === 0 || ONLY.includes(each.slug))) {
        const session = state.signedOut === true ? await inWindow(browser, window, true) : signedIn;
        const { page } = session;
        const file = `${state.slug}-w${window.width}-${window.pointer}-pointer.png`;
        try {
          const height = await within((async () => {
            await page.setViewportSize({ width: window.width, height: HEIGHT });
            await state.arrange(page, made);
            await settle(page);
            const tall = await page.evaluate(() => document.documentElement.scrollHeight);
            if (state.inWindow === true) await page.screenshot({ path: join(OUT, file) });
            else await wholePage(page, join(OUT, file));
            return tall;
          })(), state.slug);
          md.push(`| ${state.screen} | ${state.state} | ${window.width} | ${window.pointer} | ${height} | ${file} |`);
          process.stdout.write(`[capture] ${file}\n`);
        } catch (error) {
          const why = (error instanceof Error ? error.message : String(error)).split('\n')[0]?.slice(0, 200) ?? 'unknown';
          missed.push(`${state.slug} at ${window.width}: ${why}`);
          process.stdout.write(`[capture] NOT ${state.slug} at ${window.width}: ${why}\n`);
          md.push(`| ${state.screen} | ${state.state} | ${window.width} | ${window.pointer} | | **not captured:** ${why.replace(/\|/g, '/')} |`);
        } finally {
          for (const release of HOLDS.splice(0)) release();
          await page.unrouteAll({ behavior: 'ignoreErrors' }).catch(() => {});
          if (state.signedOut === true) await session.context.close();
          else { await page.keyboard.press('Escape').catch(() => {}); await page.goto('about:blank').catch(() => {}); }
        }
      }
    } finally {
      await unmake(signedIn.page, made);
      await signedIn.context.close();
    }
  }
  md.push('', '**Not in this folder, and why.**', '', '- `/suggestions` with nothing to suggest: the test database is shared and always holds suggestions from the seed; the state is the one sentence "Nothing to suggest yet." and is not reachable here without emptying tables other captures read.', '- A server error and signing out: there is no screen for either (NOTES, the audit of 12 Oct).', '- Manage’s six sections at rest: passed already; `docs/captures/manage-133/`.', '', missed.length === 0 ? 'Every state above was reached.' : `**${missed.length} not reached:** ${missed.join('; ')}`);
  /* A partial run's table is named by the run (`CAPTURE_TABLE`), so one retake's table does not replace another's: `retaken-pointer-clear.md`, `retaken-plain-names.md`. */
  const partial = ONLY.length > 0 || WIDTHS.length > 0;
  if (partial) md[0] = `# Retaken: ${process.env.CAPTURE_TABLE ?? 'a named retake'}`;
  writeFileSync(join(OUT, partial ? `${process.env.CAPTURE_TABLE ?? 'retaken'}.md` : 'unpassed-screens-139.md'), `${md.join('\n')}\n`);
});

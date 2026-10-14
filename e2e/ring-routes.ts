import { expect, type BrowserContext, type Page } from '@playwright/test';
import { trackArtist, trackCreated } from './cleanup';
import { shelfOfferedMinWidth } from '../src/app/wall/view-fork';

/** A route the ring reaches, and what to do on it before the walk (open a filter, pull a record). */
export type RingRoute = { name: string; path: string; before?: (page: Page) => Promise<void> };

/**
 * **Every route the app has, for the ring's walk** (step 144, §T.6 "Focus,
 * once for the app"). Makes the fixtures a route needs, an artist and a
 * want-list item, tracked for cleanup; reads a seeded record from the
 * wall's first seat. The error screen and login are not here: one needs a
 * cookie on the context and the other a signed-out context (`errorScreen`,
 * and the caller's own context for login).
 */
export async function ringRoutes(page: Page): Promise<RingRoute[]> {
  const suffix = `r144${Date.now().toString(36)}`;
  const post = async (path: string, data: unknown) => {
    const response = await page.request.post(path, { data });
    expect(response.status(), path).toBe(201);
    const body = (await response.json()) as { id: string };
    trackCreated(path, body);
    return body.id;
  };
  const artist = await post('/api/artists', { name: `Discharge ${suffix}` });
  trackArtist(artist);
  const item = await post('/api/want-list', { title: `Why ${suffix}`, artistId: artist });
  /*
    A seeded record, from the API and not from the wall: below the fork the wall is in the server's document and
    gone once the client takes over, and a read taken from it retried until the test's budget ran out (14 Oct).
  */
  const listed = await page.request.get('/api/records?pageSize=1');
  expect(listed.status(), '/api/records').toBe(200);
  const recordId = ((await listed.json()) as { data: Array<{ id: string }> }).data[0]?.id ?? '';
  expect(recordId, 'a record of the seed').not.toBe('');
  /*
    The shelf is offered from 1044 up (§W.24, `view-fork.ts`); below it the collection opens as the band and
    there is no spine to pull, so the pulled route is the shelf's own at that width. Decided by the window, not by
    waiting on the wall: a wait on the hidden wall at 390 held a walk for its whole budget (14 Oct).
  */
  const offered = (p: Page) => (p.viewportSize()?.width ?? 1280) >= shelfOfferedMinWidth();
  const shelf = async (p: Page) => { if (offered(p)) await p.locator('[data-shelf-offered] [data-wall="labelled"]').waitFor({ timeout: 30_000 }); else await p.locator('main').first().waitFor({ timeout: 30_000 }); };
  return [
    { name: 'the collection, shelf', path: '/', before: shelf },
    { name: 'the collection, shelf, a record pulled', path: '/', before: async (p) => { await shelf(p); if (!offered(p)) return; await p.locator('a[data-seat] [data-spine]').first().click(); await p.getByTestId('record-chrome').waitFor({ timeout: 30_000 }); await p.locator('[data-pulled]').waitFor({ timeout: 30_000 }); await p.locator('[data-testid="nav-next"], [data-testid="nav-previous"]').first().waitFor({ timeout: 30_000 }); } },
    { name: 'the collection, table view, with GENRE open', path: '/?view=table', before: async (p) => { await p.locator('[data-filter="genreId"] [data-filter-trigger]').click(); await p.locator('[data-filter-panel]').waitFor(); } },
    { name: 'the collection, grid view', path: '/?view=grid' },
    { name: 'stats', path: '/stats' },
    { name: 'the want list', path: '/want-list' },
    { name: 'a want-list item', path: `/want-list/${item}` },
    { name: 'a want-list item, editing', path: `/want-list/${item}/edit` },
    { name: 'the want list, new', path: '/want-list/new' },
    { name: 'manage', path: '/manage' },
    { name: 'look up', path: '/lookup' },
    { name: 'the record form, new', path: '/records/new' },
    { name: 'a record', path: `/records/${recordId}` },
    { name: 'a record, editing', path: `/records/${recordId}/edit` },
    { name: 'suggestions', path: '/suggestions/probe' },
    { name: 'not found', path: '/no-such-page' },
  ];
}

/** The error screen: the probe throws while the cookie says so. Leaves the cookie cleared. */
export async function errorScreen(page: Page, context: BrowserContext, run: (page: Page) => Promise<void>): Promise<void> {
  const origin = new URL(page.url()).origin;
  await context.addCookies([{ name: 'error-probe', value: 'throw', url: origin }]);
  await page.goto('/error-probe');
  await page.getByRole('heading', { name: 'Something went wrong.' }).waitFor({ timeout: 30_000 });
  await run(page);
  await context.clearCookies({ name: 'error-probe' });
}

/** A page settled enough to walk: fonts in, the dev overlay hidden, the network quiet. */
export async function settled(page: Page): Promise<void> {
  await page.locator('main, h1, [data-wall]').first().waitFor({ timeout: 30_000 });
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.addStyleTag({ content: 'nextjs-portal{display:none!important}' });
  await page.evaluate(() => document.fonts.ready);
}

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { registerCleanup, trackArtist, trackCreated } from '../cleanup';
import { stopsTable, walkTab, type Stop } from '../ring-walk';
import { login } from '../sign-in';
import { NO_SCROLL_HEIGHT } from '../../src/app/records/[id]/band-geometry';

registerCleanup();

/**
 * **The ring step's reading, before the rule is written** (step 144, §T.6).
 * Two things, on the test database at 1440 × 900: the Tab walk through the
 * wall in its three states, every stop listed, against Design's 31, 15
 * and 33; and the clipping survey across the app's routes, every stop
 * whose outside ring an ancestor's overflow would cut, named with what cuts
 * it. "Code counts the controls in clipping containers during the ring
 * step, and if there are several, this becomes a second rule." The inside
 * ring was designed for a photograph's edge; a clipped control that is not
 * one is Design's to rule on, not this step's (the coordinator, 14 Oct).
 *
 * Written to `docs/captures/ring-144/`. Run with CAPTURE=1 --project=capture.
 */
const OUT = join('docs', 'captures', 'ring-144');
/* 1440 × 900: the window the wall's reading was taken at (`wall-focusables.md`), which is the record screen's no-scroll height too. */

test('the Tab walk in the wall’s three states, and the clipped controls on every route', async ({ browser }) => {
  test.skip(process.env.CAPTURE !== '1', 'A capture tool: run with CAPTURE=1');
  if (existsSync(join(OUT, 'ring-144.md')) && process.env.CAPTURE_REPLACE !== '1') throw new Error(`${OUT} already holds a capture. It is not replaced unless CAPTURE_REPLACE=1 says so`);
  test.setTimeout(900_000);
  mkdirSync(OUT, { recursive: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: NO_SCROLL_HEIGHT } });
  context.setDefaultTimeout(30_000);
  const page = await context.newPage();
  await login(page);
  const settle = async (p: Page) => {
    await p.locator('main, h1, [data-wall]').first().waitFor({ timeout: 30_000 });
    await p.waitForLoadState('networkidle').catch(() => {});
    await p.addStyleTag({ content: 'nextjs-portal{display:none!important}' });
    await p.evaluate(() => document.fonts.ready);
  };
  const md = [
    '# Step 144: the Tab walk and the clipping survey, before the ring is written',
    '',
    'The test database, desktop Chromium, 1440 × 900, a keyboard only. Each row is one Tab stop in the order a reader meets them. "Composition" marks a run or a record, whose focus marks are their own. "Ring cut by" names the nearest ancestor whose overflow would cut §M.6’s outside ring, the control’s box plus 4 on every side, and the sides it cuts; blank where nothing does.',
    '',
  ];
  const openShelf = async () => { await page.goto('/'); await page.locator('[data-shelf-offered] [data-wall="labelled"]').waitFor({ timeout: 30_000 }); await settle(page); };

  /* The wall's three states. */
  await openShelf();
  const opens = await walkTab(page);
  await page.getByTestId('wall-zoom-out').click();
  await page.locator('[data-wall="overview"]').waitFor({ timeout: 30_000 });
  const overview = await walkTab(page);
  await openShelf();
  const recordHref = await page.locator('a[data-seat]').first().getAttribute('href');
  await page.locator('a[data-seat] [data-spine]').first().click();
  await page.getByTestId('record-chrome').waitFor({ timeout: 30_000 });
  await page.locator('[data-pulled]').waitFor({ timeout: 30_000 });
  const pulled = await walkTab(page);
  md.push('## The wall, as the shelf opens', '', ...stopsTable(opens), '', `${opens.length} stops; Design expects 31.`, '');
  md.push('## The wall, in the overview', '', ...stopsTable(overview), '', `${overview.length} stops; Design expects 15.`, '');
  md.push('## The wall, with a record pulled', '', ...stopsTable(pulled), '', `${pulled.length} stops; Design expects 33.`, '');

  /* The survey: every route, its stops counted, and the clipped ones named. */
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
  const recordId = (recordHref ?? '').replace(/^\/records\//, '').replace(/[?#].*$/, '');
  expect(recordId, 'a record of the seed, from the wall’s first seat').not.toBe('');
  const ROUTES: Array<[string, string, ((p: Page) => Promise<void>)?]> = [
    ['the collection, table view, with GENRE open', '/?view=table', async (p) => { await p.locator('[data-filter="genreId"] [data-filter-trigger]').click(); await p.locator('[data-filter-panel]').waitFor(); }],
    ['the collection, grid view', '/?view=grid'],
    ['stats', '/stats'],
    ['the want list', '/want-list'],
    ['a want-list item', `/want-list/${item}`],
    ['a want-list item, editing', `/want-list/${item}/edit`],
    ['the want list, new', '/want-list/new'],
    ['manage', '/manage'],
    ['look up', '/lookup'],
    ['the record form, new', '/records/new'],
    ['a record', `/records/${recordId}`],
    ['a record, editing', `/records/${recordId}/edit`],
    ['suggestions', '/suggestions/probe'],
    ['not found', '/no-such-page'],
  ];
  const survey: Array<{ route: string; path: string; stops: Stop[] }> = [];
  for (const [route, path, before] of ROUTES) {
    await page.goto(path);
    await settle(page);
    if (before !== undefined) await before(page);
    survey.push({ route, path, stops: await walkTab(page) });
  }
  /* The error screen: the probe throws while the cookie says so. */
  const origin = new URL(page.url()).origin;
  await context.addCookies([{ name: 'error-probe', value: 'throw', url: origin }]);
  await page.goto('/error-probe');
  await page.getByRole('heading', { name: 'Something went wrong.' }).waitFor({ timeout: 30_000 });
  survey.push({ route: 'the error screen', path: '/error-probe', stops: await walkTab(page) });
  await context.clearCookies({ name: 'error-probe' });
  /* Login, signed out. */
  const out = await browser.newContext({ viewport: { width: 1440, height: NO_SCROLL_HEIGHT } });
  const loginPage = await out.newPage();
  await loginPage.goto('/login');
  await settle(loginPage);
  survey.push({ route: 'login', path: '/login', stops: await walkTab(loginPage) });
  await out.close();

  md.push('## The clipping survey, route by route', '', '| route | stops | ring cut on | what, and by what |', '|---|---|---|---|');
  let cutTotal = 0;
  for (const { route, path, stops } of survey) {
    const cut = stops.filter((s) => s.clipped !== null && !s.composition);
    cutTotal += cut.length;
    md.push(`| ${route} (\`${path}\`) | ${stops.length} | ${cut.length} | ${cut.map((s) => `${s.tag} ${s.name.replace(/\|/g, '/')}: ${(s.clipped ?? '').replace(/\|/g, '/')}`).join('; ')} |`);
  }
  const wallCut = [...opens, ...overview, ...pulled].filter((s) => s.clipped !== null && !s.composition);
  md.push('', `${cutTotal} stops outside the composition with a cut ring across the routes above, and ${wallCut.length} in the wall’s three states.`, '');
  await context.close();
  writeFileSync(join(OUT, 'ring-144.md'), `${md.join('\n')}\n`);
});

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test, type Page } from '@playwright/test';
import { registerCleanup } from '../cleanup';
import { errorScreen, ringRoutes, settled } from '../ring-routes';
import { drawnRing, expectedRing, stopsTable, walkTab, type Stop } from '../ring-walk';
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
  await page.locator('a[data-seat] [data-spine]').first().click();
  await page.getByTestId('record-chrome').waitFor({ timeout: 30_000 });
  await page.locator('[data-pulled]').waitFor({ timeout: 30_000 });
  const pulled = await walkTab(page);
  md.push('## The wall, as the shelf opens', '', ...stopsTable(opens), '', `${opens.length} stops; Design expects 31.`, '');
  md.push('## The wall, in the overview', '', ...stopsTable(overview), '', `${overview.length} stops; Design expects 15.`, '');
  md.push('## The wall, with a record pulled', '', ...stopsTable(pulled), '', `${pulled.length} stops; Design expects 33.`, '');

  /* The survey: every route, its stops counted, the clipped ones named, and the ring each draws against the one ruled. */
  const survey: Array<{ route: string; path: string; stops: Stop[] }> = [];
  for (const route of await ringRoutes(page)) {
    await page.goto(route.path);
    await settled(page);
    if (route.before !== undefined) await route.before(page);
    survey.push({ route: route.name, path: route.path, stops: await walkTab(page) });
  }
  await errorScreen(page, context, async (p) => { survey.push({ route: 'the error screen', path: '/error-probe', stops: await walkTab(p) }); });
  /* Login, signed out. */
  const out = await browser.newContext({ viewport: { width: 1440, height: NO_SCROLL_HEIGHT } });
  const loginPage = await out.newPage();
  await loginPage.goto('/login');
  await settled(loginPage);
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
  /* The ring, route by route: what each stop draws against what §T.6 rules for it. */
  md.push('## The ring, route by route', '', 'Each stop outside the composition, what it draws with keyboard focus, and what §T.6 rules for it: the outside ring; the outside ring on the overlay that is the row (the table’s rows and the grid’s cells); the inside ring where the container clips (the cover, the filter panel’s options).', '', '| route | stops outside the composition | as ruled | not as ruled |', '|---|---|---|---|');
  let asRuled = 0;
  for (const { route, stops } of survey) {
    const outside = stops.filter((s) => !s.composition);
    const wrong = outside.filter((s) => drawnRing(s) !== expectedRing(s));
    const right = outside.length - wrong.length;
    asRuled += right;
    md.push(`| ${route} | ${outside.length} | ${right} | ${wrong.length}${wrong.length === 0 ? '' : `: ${wrong.map((s) => `${s.tag} ${s.name.replace(/\|/g, '/')} draws ${drawnRing(s).replace(/\|/g, '/')}`).join('; ')}`} |`);
  }
  md.push('', `${asRuled} stops draw the ring ruled for them.`, '');
  for (const { route, stops } of survey) md.push(`### ${route}`, '', ...stopsTable(stops), '');
  await context.close();
  writeFileSync(join(OUT, 'ring-144.md'), `${md.join('\n')}\n`);
});

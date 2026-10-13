import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { registerCleanup, trackArtist } from '../cleanup';
import { login } from '../sign-in';

/**
 * **How many focusable elements each route draws, at 390 and 1280.** A
 * count for costing the focus-ring check before it is built (the
 * coordinator, 13 Oct): Design's check is "focus every focusable element
 * on every route and assert the ring", and its cost is this number times
 * the routes times the widths.
 *
 * Read-only on the test database: the dynamic routes are reached through
 * a record and an item made here and tracked for cleanup. Nothing is
 * focused; the count is what a Tab walk would visit: links with an href,
 * buttons, fields, selects, text areas and anything with a tabindex that
 * is not −1, none disabled, each with a box on the page.
 *
 * Run with CAPTURE=1 --project=capture. Writes `docs/captures/focus-ring-count/`.
 */
registerCleanup();

const OUT = join('docs', 'captures', 'focus-ring-count');
const STATIC = ['/', '/lookup', '/manage', '/records/new', '/stats', '/suggestions', '/want-list', '/want-list/new'] as const;

test('count the focusable elements on every route at 390 and 1280', async ({ page }) => {
  test.skip(process.env.CAPTURE !== '1', 'A capture tool: run with CAPTURE=1');
  test.setTimeout(300_000);
  await login(page);
  const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const artist = await page.request.post('/api/artists', { data: { name: `Focus-${suffix}` } });
  const artistId = ((await artist.json()) as { id: string }).id;
  trackArtist(artistId);
  const record = await page.request.post('/api/records', { data: { title: `Focus Record ${suffix}`, artistId } });
  expect(record.status(), 'the record the dynamic routes need').toBe(201);
  const recordId = ((await record.json()) as { id: string }).id;
  const item = await page.request.post('/api/want-list', { data: { title: `Focus Item ${suffix}`, artistId } });
  expect(item.status(), 'the item the dynamic routes need').toBe(201);
  const itemId = ((await item.json()) as { id: string }).id;
  const routes = [...STATIC, `/records/${recordId}`, `/records/${recordId}/edit`, `/want-list/${itemId}`, `/want-list/${itemId}/edit`];

  const count = () =>
    page.evaluate(() =>
      Array.from(document.querySelectorAll<HTMLElement>('a[href], button, input, select, textarea, [tabindex]')).filter((el) => {
        if (el.closest('nextjs-portal') !== null) return false;
        if ((el as HTMLButtonElement).disabled === true) return false;
        if (el.getAttribute('tabindex') === '-1') return false;
        return el.getClientRects().length > 0;
      }).length,
    );

  const rows: string[] = [];
  const totals = { 390: 0, 1280: 0 };
  for (const route of routes) {
    const counts: number[] = [];
    for (const width of [390, 1280] as const) {
      await page.setViewportSize({ width, height: 844 });
      await page.goto(route);
      await page.locator('main, [data-screen-frame]').first().waitFor({ timeout: 30_000 });
      await page.waitForLoadState('networkidle').catch(() => {});
      const n = await count();
      counts.push(n);
      totals[width] += n;
    }
    rows.push(`| ${route.replace(recordId, '[id]').replace(itemId, '[id]')} | ${counts[0]} | ${counts[1]} |`);
  }
  /* Login, signed out: its own context. */
  const signedOut = await page.context().browser()?.newContext();
  if (signedOut !== undefined) {
    const loginPage = await signedOut.newPage();
    const counts: number[] = [];
    for (const width of [390, 1280] as const) {
      await loginPage.setViewportSize({ width, height: 844 });
      await loginPage.goto('/login');
      await loginPage.locator('form[data-hydrated="true"]').waitFor({ timeout: 30_000 });
      const n = await loginPage.evaluate(() => Array.from(document.querySelectorAll<HTMLElement>('a[href], button, input, select, textarea, [tabindex]')).filter((el) => el.closest('nextjs-portal') === null && (el as HTMLButtonElement).disabled !== true && el.getAttribute('tabindex') !== '-1' && el.getClientRects().length > 0).length);
      counts.push(n);
      totals[width] += n;
    }
    rows.push(`| /login | ${counts[0]} | ${counts[1]} |`);
    await signedOut.close();
  }

  mkdirSync(OUT, { recursive: true });
  writeFileSync(
    join(OUT, 'focusables.md'),
    [
      '# Focusable elements per route, at 390 and 1280',
      '',
      'The test database, desktop Chromium, each route as it opens with nothing pressed. Counted: links with an href, buttons, fields, selects, text areas and anything with a tabindex other than −1, not disabled, with a box on the page; the dev overlay left out. A count for costing the focus-ring check, not a measurement of the ring.',
      '',
      '| route | 390 | 1280 |',
      '|---|---|---|',
      ...rows,
      `| **total, ${routes.length + 1} routes** | **${totals[390]}** | **${totals[1280]}** |`,
      '',
    ].join('\n'),
  );
});

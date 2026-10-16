import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { registerCleanup } from '../cleanup';
import { pointerIs } from '../hit-area';
import { login } from '../sign-in';
import { wholePage } from '../whole-page';
import { normalizeRelease } from '@/lib/discogs/normalize-release';

/**
 * **Step 150's recapture of look up's result card, at 390 coarse and 1280
 * fine** (§T.6: "Recapture at 390 coarse and 1280 fine"). A capture tool: it
 * runs only with CAPTURE=1 and writes nothing otherwise. Discogs is answered
 * by the tool from the committed fixtures, the thumbnails by a 1 × 1 PNG it
 * serves itself, so nothing leaves the machine. The four cards are the
 * ruling's four: the long title wrapping, a market answer in its slot, a
 * disclosure open, and a pressing with a notes line.
 */
registerCleanup();
const OUT = join('docs', 'captures', 'result-card-150');
const RELEASE = JSON.parse(readFileSync('test/fixtures/discogs/release-collision-clay-lp-3-a.json', 'utf8')) as Record<string, unknown>;
const VERSIONS = JSON.parse(readFileSync('test/fixtures/discogs/master-versions-discharge.json', 'utf8')) as { versions: Array<Record<string, unknown>> };
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');
const THUMB = 'https://i.discogs.com/thumb-150.png';
const json = (body: unknown, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(body) });
const result = (overrides: Record<string, unknown>) => ({
  discogsId: 381756, type: 'master', masterId: 50683, title: 'Hear Nothing See Nothing Say Nothing', artist: 'Discharge', thumbUrl: THUMB, coverUrl: null,
  year: 1982, country: 'UK', label: 'Clay Records', catalogNumber: 'CLAY LP 3', formats: ['Vinyl', 'LP', 'Album'], formatText: null, genres: ['Rock'], styles: ['Hardcore', 'Punk'],
  isReissue: false, communityHave: 3739, communityWant: 2165, ownership: { tier: null, ownedPressing: null, wantedPriority: null, isTargetPressing: false }, ...overrides,
});

test('look up’s result card, the four cards and the opened details, at 1280 fine and 390 coarse', async ({ browser }) => {
  test.skip(process.env.CAPTURE !== '1', 'A capture tool: run with CAPTURE=1');
  if (existsSync(join(OUT, 'result-card-150.md')) && process.env.CAPTURE_REPLACE !== '1') throw new Error(`${OUT} already holds the card's capture. It is not replaced unless CAPTURE_REPLACE=1 says so`);
  test.setTimeout(300_000);
  mkdirSync(OUT, { recursive: true });
  const md = ['# Step 150: look up’s result card, a row between hairlines', '', 'The test database, desktop Chromium, touch on for the coarse pointer; whole pages. Discogs answered by the tool from the committed fixtures, the thumbnails a 1 × 1 PNG it serves. The four cards are the ruling’s: On The Radio: Greatest Hits Vol. 1 & 2 (the long title), a market answer in its slot, COMPARE PRESSINGS open, and a pressing whose format line carries Gatefold, Repress.', '', '| file | screen | window | pointer | page height |', '|---|---|---|---|---|'];
  for (const [width, pointer] of [[1280, 'fine'], [390, 'coarse']] as const) {
    const context = await browser.newContext({ hasTouch: pointer === 'coarse', viewport: { width, height: 844 } });
    context.setDefaultTimeout(30_000);
    const page = await context.newPage();
    await login(page);
    expect(await pointerIs(page)).toBe(pointer);
    const cards = [
      result({ discogsId: 1, title: 'On The Radio: Greatest Hits Vol. 1 & 2', artist: 'Donna Summer', year: 1979, country: 'US', label: 'Casablanca', catalogNumber: 'NBLP-2-7191' }),
      result({ discogsId: 2 }),
      result({ discogsId: 3 }),
      result({ discogsId: 4, formatText: 'Gatefold, Repress', year: 1989, isReissue: true }),
    ];
    await page.route(THUMB, (route) => route.fulfill({ status: 200, contentType: 'image/png', body: PNG }));
    await page.route('**/api/discogs/search**', (route) => route.fulfill(json({ data: cards, meta: { total: cards.length, page: 1, pageSize: 25 } })));
    const raw = VERSIONS.versions.find((v) => v.id === 381756) ?? {};
    const version = (discogsId: number, year: number, country: string) => ({ discogsId, title: 'Hear Nothing See Nothing Say Nothing', label: 'Clay Records', country, year, catalogNumber: 'CLAY LP 3', formats: String(raw.format ?? 'LP, Album').split(', '), isReissue: discogsId !== 381756, thumbUrl: THUMB, communityHave: 100, communityWant: 100, ownership: cards[1].ownership });
    await page.route('**/api/discogs/master/*/versions**', (route) => route.fulfill(json({ data: [version(381756, 1982, 'UK'), version(6779382, 1989, 'UK'), version(1553455, 1982, 'US')], meta: { total: 3, page: 1, pageSize: 25, pages: 1, ownershipChecked: true } })));
    await page.route('**/api/discogs/master/*/spread*', (route) => route.fulfill(json({ error: { message: 'Not asked in a capture.', code: 'UPSTREAM_ERROR' } }, 502)));
    await page.route('**/api/discogs/market/**', (route) => route.fulfill(json({ numForSale: 7, lowestPrice: { value: 38, currency: 'USD' }, conditions: [{ grade: 'Near Mint (NM or M-)', value: 95 }, { grade: 'Very Good Plus (VG+)', value: 38 }] })));
    await page.route('**/api/discogs/release/*', (route) => route.fulfill(json(normalizeRelease(RELEASE))));
    const shoot = async (slug: string, name: string) => {
      await page.addStyleTag({ content: 'nextjs-portal{display:none!important}' });
      await page.evaluate(() => document.fonts.ready);
      await page.mouse.move(1, 1);
      await page.waitForTimeout(300);
      const height = await page.evaluate(() => document.documentElement.scrollHeight);
      const file = `${slug}-w${width}-${pointer}-h${height}.png`;
      await wholePage(page, join(OUT, file));
      md.push(`| ${file} | ${name} | ${width} | ${pointer} | ${height} |`);
    };
    await page.goto('/lookup');
    await page.locator('form[data-hydrated="true"]').waitFor();
    await page.getByLabel('Catalog no.').fill('CLAY LP 3');
    await page.locator('form[data-testid="lookup-form"] button[type="submit"]').click();
    const all = page.getByTestId('result-card');
    await expect(all).toHaveCount(4);
    await all.nth(1).getByTestId('check-market').click();
    await expect(all.nth(1).getByTestId('market-summary')).toBeVisible();
    await all.nth(2).getByTestId('expand-versions').click();
    await expect(all.nth(2).getByRole('table')).toBeVisible();
    await shoot('results', 'look up, four results: the long title, a market answer, COMPARE PRESSINGS open, a notes line');
    await all.nth(3).getByTestId('expand-evidence').click();
    await expect(all.nth(3).getByTestId('pressing-evidence')).toBeVisible();
    await shoot('details', 'look up, the fourth card with IDENTIFY THIS PRESSING open');
    await context.close();
  }
  writeFileSync(join(OUT, 'result-card-150.md'), `${md.join('\n')}\n`);
});

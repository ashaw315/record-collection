import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { registerCleanup, trackGenre } from '../cleanup';
import { pointerIs } from '../hit-area';
import { login } from '../sign-in';
import { wholePage } from '../whole-page';

/**
 * **Step 149's recapture of the proposed hierarchy, at 390 coarse and 1280
 * fine** (§T.6, 14 Oct: "Recapture at 390 coarse and 1280 fine"). A capture
 * tool: it runs only with CAPTURE=1 and writes nothing otherwise. Three
 * genres seeded through the API and the suggestion route answered by the
 * tool, so the model is never called; the genres are removed at the end.
 */
registerCleanup();
const OUT = join('docs', 'captures', 'hierarchy-149');

test('the proposed hierarchy under Genres, at 1280 fine and 390 coarse', async ({ browser }) => {
  test.skip(process.env.CAPTURE !== '1', 'A capture tool: run with CAPTURE=1');
  if (existsSync(join(OUT, 'hierarchy-149.md')) && process.env.CAPTURE_REPLACE !== '1') throw new Error(`${OUT} already holds the hierarchy's capture. It is not replaced unless CAPTURE_REPLACE=1 says so`);
  test.setTimeout(300_000);
  mkdirSync(OUT, { recursive: true });
  const md = ['# Step 149: the proposed hierarchy, a section between hairlines', '', 'The test database, desktop Chromium, touch on for the coarse pointer; whole pages. Three genres seeded for the capture (Rock, Psychedelic Rock, AOR), the suggestion answered by the tool, not the model.', '', '| file | screen | window | pointer | page height |', '|---|---|---|---|---|'];
  for (const [width, pointer] of [[1280, 'fine'], [390, 'coarse']] as const) {
    const context = await browser.newContext({ hasTouch: pointer === 'coarse', viewport: { width, height: 844 } });
    context.setDefaultTimeout(30_000);
    const page = await context.newPage();
    await login(page);
    expect(await pointerIs(page)).toBe(pointer);
    const run = `c149${width}${Date.now().toString(36)}`;
    const seed = async (name: string) => {
      const response = await page.request.post('/api/genres', { data: { name } });
      expect(response.status()).toBe(201);
      const id = ((await response.json()) as { id: string }).id;
      trackGenre(id);
      return id;
    };
    const rock = await seed(`Rock ${run}`);
    const psych = await seed(`Psychedelic Rock ${run}`);
    const aor = await seed(`AOR ${run}`);
    await page.route('**/api/genres/parent-suggestions', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { pairings: [{ genreId: psych, genre: `Psychedelic Rock ${run}`, parentId: rock, parent: `Rock ${run}` }, { genreId: aor, genre: `AOR ${run}`, parentId: rock, parent: `Rock ${run}` }], noParentFits: [], dropped: 0, evidence: { [`Psychedelic Rock ${run}`]: { recordCount: 3, examples: ['The Doors — The Soft Parade'] }, [`AOR ${run}`]: { recordCount: 1, examples: ['Dire Straits — Dire Straits'] } } } }) }));
    const shoot = async (p: Page, slug: string, name: string) => {
      await p.addStyleTag({ content: 'nextjs-portal{display:none!important}' });
      await p.evaluate(() => document.fonts.ready);
      await p.mouse.move(1, 1);
      await p.waitForTimeout(300);
      const height = await p.evaluate(() => document.documentElement.scrollHeight);
      const file = `${slug}-w${width}-${pointer}-h${height}.png`;
      await wholePage(p, join(OUT, file));
      md.push(`| ${file} | ${name} | ${width} | ${pointer} | ${height} |`);
    };
    await page.goto('/manage');
    await page.getByRole('button', { name: 'Genres', exact: true }).click();
    await expect(page.getByRole('region', { name: 'Genres' })).toBeVisible();
    await shoot(page, 'genres', 'manage, Genres, SUGGEST A HIERARCHY in its section');
    await page.getByTestId('propose-parents').click();
    await expect(page.getByTestId('parent-proposal')).toBeVisible();
    await shoot(page, 'hierarchy', 'manage, Genres, the proposed hierarchy');
    await context.close();
  }
  writeFileSync(join(OUT, 'hierarchy-149.md'), `${md.join('\n')}\n`);
});

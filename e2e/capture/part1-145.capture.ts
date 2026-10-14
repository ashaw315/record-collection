import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { registerCleanup, trackArtist, trackCreated } from '../cleanup';
import { pointerIs } from '../hit-area';
import { login } from '../sign-in';
import { wholePage } from '../whole-page';

registerCleanup();

/**
 * **Part 1's five pages, recaptured** (step 145, §T.6: "Recapture each at
 * 390 coarse and 1280 fine"): the want-list item page with a title that
 * wraps at 390, the new and edit forms, login signed out, and not-found.
 * The test database, with an item this file makes and cleans up. Written
 * to `docs/captures/part1-145/`, each file named by the page and window.
 * Run with CAPTURE=1 --project=capture.
 */
const OUT = join('docs', 'captures', 'part1-145');
const WINDOWS = [[390, 'coarse'], [1280, 'fine']] as const;

test('part 1’s pages at 390 coarse and 1280 fine', async ({ browser }) => {
  test.skip(process.env.CAPTURE !== '1', 'A capture tool: run with CAPTURE=1');
  if (existsSync(join(OUT, 'part1-145.md')) && process.env.CAPTURE_REPLACE !== '1') throw new Error(`${OUT} already holds a capture. It is not replaced unless CAPTURE_REPLACE=1 says so`);
  test.setTimeout(600_000);
  mkdirSync(OUT, { recursive: true });
  const md = ['# Step 145: part 1’s passes, the want list’s item page and forms, login and not-found', '', 'The test database, desktop Chromium, touch on for the coarse pointer; whole pages. The item is this tool’s own, titled to wrap at 390.', '', '| file | page | width | pointer | page height |', '|---|---|---|---|---|'];
  for (const [width, pointer] of WINDOWS) {
    const context = await browser.newContext({ hasTouch: pointer === 'coarse', viewport: { width, height: 844 } });
    context.setDefaultTimeout(30_000);
    const page = await context.newPage();
    await login(page);
    expect(await pointerIs(page)).toBe(pointer);
    const suffix = `c145${Date.now().toString(36)}`;
    const post = async (path: string, data: unknown) => {
      const response = await page.request.post(path, { data });
      expect(response.status(), path).toBe(201);
      const body = (await response.json()) as { id: string };
      trackCreated(path, body);
      return body.id;
    };
    const artist = await post('/api/artists', { name: `Discharge ${suffix}` });
    trackArtist(artist);
    const item = await post('/api/want-list', { title: 'Why — Grave New World, The Nightmare Continues', artistId: artist, bestDigNotes: 'The Clay first press, matrix A1/B1.', maxPrice: '40.00' });
    const settle = async (p: Page) => { await p.addStyleTag({ content: 'nextjs-portal{display:none!important}' }); await p.evaluate(() => document.fonts.ready); await p.mouse.move(1, 1); await p.waitForTimeout(300); };
    const shoot = async (p: Page, slug: string, name: string) => {
      await settle(p);
      const height = await p.evaluate(() => document.documentElement.scrollHeight);
      const file = `${slug}-w${width}-${pointer}-h${height}.png`;
      await wholePage(p, join(OUT, file));
      md.push(`| ${file} | ${name} | ${width} | ${pointer} | ${height} |`);
    };
    await page.goto(`/want-list/${item}`);
    await page.getByTestId('hunt').waitFor();
    await shoot(page, 'item', 'a want-list item');
    await page.goto('/want-list/new');
    await page.getByTestId('want-list-form').waitFor();
    await shoot(page, 'new', 'the want list, new');
    await page.goto(`/want-list/${item}/edit`);
    await page.getByTestId('want-list-form').waitFor();
    await shoot(page, 'edit', 'a want-list item, editing');
    await page.goto('/no-such-page');
    await page.getByTestId('not-found-line').waitFor();
    await shoot(page, 'not-found', 'not found');
    await context.close();
    const out = await browser.newContext({ hasTouch: pointer === 'coarse', viewport: { width, height: 844 } });
    const loginPage = await out.newPage();
    await loginPage.goto('/login');
    await loginPage.getByLabel('Password').waitFor();
    await shoot(loginPage, 'login', 'login, signed out');
    await out.close();
  }
  writeFileSync(join(OUT, 'part1-145.md'), `${md.join('\n')}\n`);
});

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { registerCleanup, trackArtist, trackCreated } from '../cleanup';
import { pointerIs } from '../hit-area';
import { login } from '../sign-in';
import { wholePage } from '../whole-page';

/**
 * Step 146, part 2: manage's rows as built, the Artists table at rest and
 * with a row editing, and the Genres tree, at 1280 under a fine pointer;
 * the Artists list with a row's form open at 390 under a coarse pointer.
 * Whole pages; plain names, made once. Run with CAPTURE=1
 * --project=capture; replaced only with CAPTURE_REPLACE=1.
 */
registerCleanup();

const OUT = join('docs', 'captures', 'part2-146');

test('manage’s rows at 1280 fine and the open form at 390 coarse', async ({ browser }) => {
  test.skip(process.env.CAPTURE !== '1', 'A capture tool: run with CAPTURE=1');
  if (existsSync(join(OUT, 'manage-146.md')) && process.env.CAPTURE_REPLACE !== '1') throw new Error(`${OUT} already holds manage's capture. It is not replaced unless CAPTURE_REPLACE=1 says so`);
  test.setTimeout(300_000);
  mkdirSync(OUT, { recursive: true });
  const md = ['# Step 146: part 2, manage’s rows', '', 'The test database, desktop Chromium, touch on for the coarse pointer; whole pages. The artist and the genre are this tool’s own.', '', '| file | screen | window | pointer | page height |', '|---|---|---|---|---|'];
  let made: { artist: string } | null = null;
  for (const [width, pointer] of [[1280, 'fine'], [390, 'coarse']] as const) {
    const context = await browser.newContext({ hasTouch: pointer === 'coarse', viewport: { width, height: 844 } });
    context.setDefaultTimeout(30_000);
    const page = await context.newPage();
    await login(page);
    expect(await pointerIs(page)).toBe(pointer);
    /* A plain name can be there already, left by a run that failed before its cleanup: an artist the API answers 409 for is reused by the id it names, so a leftover never blocks a capture. */
    const post = async (path: string, data: unknown) => {
      const response = await page.request.post(path, { data });
      const body = (await response.json()) as { id?: string; error?: { existingId?: string } };
      if (response.status() === 409 && path === '/api/artists' && typeof body.error?.existingId === 'string') { trackArtist(body.error.existingId); return body.error.existingId; }
      expect(response.status(), `${path} ${JSON.stringify(data)} answered ${response.status()} ${JSON.stringify(body)}`).toBe(201);
      if (typeof body.id !== 'string') throw new Error(`${path}: no id`);
      trackCreated(path, body);
      return body.id;
    };
    if (made === null) {
      const artistId = await post('/api/artists', { name: 'Chaos UK', formedYear: 1979, originCountry: 'UK' });
      trackArtist(artistId);
      /* The artist list defaults to what you collect, so the artist needs a record to be listed. */
      await post('/api/records', { title: 'Chaos UK', artistId });
      await post('/api/genres', { name: 'UK82' });
      made = { artist: 'Chaos UK' };
    }
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
    const section = async (label: string) => {
      await page.getByRole('navigation', { name: 'Resource' }).getByRole('button', { name: label, exact: true }).click();
      await expect(page.getByRole('region', { name: label })).toBeVisible();
    };
    await page.goto('/manage');
    await section('Artists');
    if (width >= 640) {
      await shoot(page, 'manage-artists', 'manage, Artists at rest');
      await page.getByRole('row').filter({ hasText: made.artist }).getByRole('button', { name: `Edit ${made.artist}`, exact: true }).click();
      await shoot(page, 'manage-artists-editing', 'manage, Artists with a row editing');
      await page.getByRole('button', { name: `Cancel editing ${made.artist}`, exact: true }).click();
      await section('Genres');
      await shoot(page, 'manage-genres', 'manage, Genres');
    } else {
      await page.getByRole('region', { name: 'Artists' }).locator('[data-manage-row]').filter({ has: page.locator('[data-manage-name]', { hasText: made.artist }) }).locator('[data-manage-open]').click();
      await page.locator('[data-manage-form]').waitFor();
      await shoot(page, 'manage-artists-open', 'manage, the Artists list with a row’s form open');
    }
    await context.close();
  }
  writeFileSync(join(OUT, 'manage-146.md'), `${md.join('\n')}\n`);
});

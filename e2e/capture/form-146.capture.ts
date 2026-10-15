import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { registerCleanup, trackArtist, trackCreated } from '../cleanup';
import { pointerIs } from '../hit-area';
import { login } from '../sign-in';
import { wholePage } from '../whole-page';

/**
 * Step 146, part 2: the record form as built, new and editing, at 390
 * under a coarse pointer and 1280 under a fine one; whole pages. The
 * record is this tool's own. Run with CAPTURE=1 --project=capture;
 * replaced only with CAPTURE_REPLACE=1.
 */
registerCleanup();

const OUT = join('docs', 'captures', 'part2-146');
const WINDOWS = [[390, 'coarse'], [1280, 'fine']] as const;

test('the record form, new and editing, at 390 coarse and 1280 fine', async ({ browser }) => {
  test.skip(process.env.CAPTURE !== '1', 'A capture tool: run with CAPTURE=1');
  if (existsSync(join(OUT, 'form-146.md')) && process.env.CAPTURE_REPLACE !== '1') throw new Error(`${OUT} already holds the form's capture. It is not replaced unless CAPTURE_REPLACE=1 says so`);
  test.setTimeout(300_000);
  mkdirSync(OUT, { recursive: true });
  /* Plain names (NOTES, 12 Oct 23:00): the pictures are evidence, so no name carries a suffix no screen would show. The record is made once. */
  let record: string | null = null;
  const md = ['# Step 146: part 2, the record form', '', 'The test database, desktop Chromium, touch on for the coarse pointer; whole pages. The record is this tool’s own; editing opens both disclosures, new leaves them closed.', '', '| file | screen | window | pointer | page height |', '|---|---|---|---|---|'];
  for (const [width, pointer] of WINDOWS) {
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
    if (record === null) {
      const artist = await post('/api/artists', { name: 'GBH' });
      trackArtist(artist);
      record = await post('/api/records', { title: 'Hear Nothing See Nothing Say Nothing', artistId: artist });
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
    await page.goto('/records/new');
    await page.locator('form').first().waitFor();
    await shoot(page, 'form-new', 'the record form, new');
    await page.goto(`/records/${record}/edit`);
    await page.locator('form').first().waitFor();
    await shoot(page, 'form-edit', 'the record form, editing');
    await context.close();
  }
  writeFileSync(join(OUT, 'form-146.md'), `${md.join('\n')}\n`);
});

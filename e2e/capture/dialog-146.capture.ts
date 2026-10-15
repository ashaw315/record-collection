import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { registerCleanup, trackArtist, trackCreated } from '../cleanup';
import { DIALOG, pointerIs } from '../hit-area';
import { login } from '../sign-in';

/**
 * Step 146, part 2: the shared dialog as built, on the three screens that
 * open it, at 390 under a coarse pointer and 1280 under a fine one. The
 * window, not the whole page: the dialog is fixed over it. Run with
 * CAPTURE=1 --project=capture; replaced only with CAPTURE_REPLACE=1.
 */
registerCleanup();

const OUT = join('docs', 'captures', 'part2-146');
const WINDOWS = [[390, 'coarse'], [1280, 'fine']] as const;

test('the shared dialog on a record, a want-list row and manage, at 390 coarse and 1280 fine', async ({ browser }) => {
  test.skip(process.env.CAPTURE !== '1', 'A capture tool: run with CAPTURE=1');
  if (existsSync(join(OUT, 'dialog-146.md')) && process.env.CAPTURE_REPLACE !== '1') throw new Error(`${OUT} already holds the dialog's capture. It is not replaced unless CAPTURE_REPLACE=1 says so`);
  test.setTimeout(300_000);
  mkdirSync(OUT, { recursive: true });
  /* Plain names (NOTES, 12 Oct 23:00): a capture runs alone and its pictures are evidence, so no name carries a suffix no screen would show. Made once; the tag a pass, since the pass's confirmation deletes it. */
  let made: { record: string; want: string } | null = null;
  const md = ['# Step 146: part 2, the shared dialog', '', 'The test database, desktop Chromium, touch on for the coarse pointer; the window, with the dialog open. The record, the want-list item and the tag are this tool’s own.', '', '| file | screen | window | pointer |', '|---|---|---|---|'];
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
    if (made === null) {
      const artist = await post('/api/artists', { name: 'The Varukers' });
      trackArtist(artist);
      made = { record: await post('/api/records', { title: 'Why', artistId: artist }), want: 'Hear Nothing See Nothing Say Nothing' };
      await post('/api/want-list', { title: made.want, artistId: artist });
    }
    const { record, want } = made;
    const tag = 'uk82';
    await post('/api/tags', { name: tag });
    const shoot = async (p: Page, slug: string, name: string) => {
      await p.locator(DIALOG).waitFor();
      await p.locator(DIALOG).evaluate((el) => Promise.all(el.getAnimations().map((animation) => animation.finished)));
      await p.addStyleTag({ content: 'nextjs-portal{display:none!important}' });
      await p.evaluate(() => document.fonts.ready);
      await p.waitForTimeout(200);
      const file = `${slug}-w${width}-${pointer}.png`;
      await p.screenshot({ path: join(OUT, file) });
      md.push(`| ${file} | ${name} | ${width} | ${pointer} |`);
    };
    await page.goto(`/records/${record}`);
    await page.getByRole('button', { name: 'Delete record' }).click();
    await shoot(page, 'dialog-record', 'a record’s delete');
    await page.keyboard.press('Escape');
    await page.goto('/want-list');
    await page.getByRole('listitem').filter({ hasText: want }).getByRole('button', { name: 'Delete' }).click();
    await shoot(page, 'dialog-want-list', 'a want-list row’s delete');
    await page.keyboard.press('Escape');
    await page.goto('/manage');
    await page.getByRole('button', { name: 'Tags', exact: true }).click();
    const region = page.getByRole('region', { name: 'Tags' });
    await expect(region).toBeVisible();
    if (width < 640) await region.locator('[data-manage-row]').filter({ hasText: tag }).locator('button').first().click();
    await region.getByRole('button', { name: `Delete ${tag}`, exact: true }).click();
    await shoot(page, 'dialog-manage', 'manage’s delete');
    await page.getByTestId('confirm-delete').click();
    await context.close();
  }
  writeFileSync(join(OUT, 'dialog-146.md'), `${md.join('\n')}\n`);
});

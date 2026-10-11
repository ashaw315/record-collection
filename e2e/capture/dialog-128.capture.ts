import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { registerCleanup, trackArtist, trackCreated } from '../cleanup';
import { DIALOG, POINTERS, pointerIs, readReach } from '../hit-area';
import { login } from '../sign-in';

registerCleanup();

/**
 * Step 128's captures, the handoff's "capturing each screen": the shared
 * dialog open on each of the three screens that use it (a record's delete,
 * a want-list row's delete, manage's delete), under each pointer, at 390
 * and 1280. On the test database: a record's page is not opened on the
 * real collection, where it would call Discogs.
 *
 * Each file is named by what differs: the screen, the width, the pointer,
 * and the heights a finger has on Cancel, Delete and Close.
 *
 * Run with CAPTURE=1 --project=capture.
 */
const OUT = join('docs', 'captures', 'dialog-128');

test('the shared dialog on its three screens, under each pointer, at 390 and 1280', async ({ browser }) => {
  test.skip(process.env.CAPTURE !== '1', 'A capture tool: run with CAPTURE=1');
  test.setTimeout(300_000);
  mkdirSync(OUT, { recursive: true });
  const md = ['# The shared dialog on the three screens that open it', '', 'The test database, desktop Chromium, touch on for the coarse pointer. “To a finger” is the rows of pixels down each control’s middle on which a tap reaches it.', '', '| screen | window | pointer | Cancel: drawn, to a finger | Delete: drawn, to a finger | Close: drawn, to a finger | file |', '|---|---|---|---|---|---|---|'];
  for (const pointer of POINTERS) {
    const context = await browser.newContext({ hasTouch: pointer === 'coarse', viewport: { width: 1280, height: 844 } });
    const page = await context.newPage();
    await login(page);
    expect(await pointerIs(page)).toBe(pointer);
    const suffix = `d128${Date.now().toString(36)}`;
    const post = async (path: string, data: unknown) => {
      const response = await page.request.post(path, { data });
      expect(response.status(), path).toBe(201);
      const body = (await response.json()) as { id: string };
      trackCreated(path, body);
      return body.id;
    };
    const artist = await post('/api/artists', { name: `Discharge ${suffix}` });
    trackArtist(artist);
    const record = await post('/api/records', { title: `Hear Nothing ${suffix}`, artistId: artist });
    await post('/api/want-list', { title: `Why ${suffix}`, artistId: artist });
    await post('/api/tags', { name: `tag-${suffix}` });

    const screens: Array<[string, () => Promise<void>]> = [
      ['a record', async () => { await page.goto(`/records/${record}`); await page.getByRole('button', { name: 'Delete record' }).click(); }],
      ['the want list', async () => { await page.goto('/want-list'); await page.getByRole('listitem').filter({ hasText: `Why ${suffix}` }).getByRole('button', { name: 'Delete' }).click(); }],
      ['manage', async () => { await page.goto('/manage'); await page.getByRole('navigation', { name: 'Resource' }).getByRole('button', { name: 'Tags' }).click(); await page.getByRole('button', { name: `Delete tag-${suffix}` }).click(); }],
    ];
    for (const width of [390, 1280]) for (const [screen, open] of screens) {
      await page.setViewportSize({ width, height: 844 });
      await open();
      await page.locator(DIALOG).waitFor();
      await page.locator(DIALOG).evaluate((el) => Promise.all(el.getAnimations().map((animation) => animation.finished)));
      const reach = await readReach(page, DIALOG);
      const of = (name: string) => { const r = reach.find((each) => each.name === name); return r === undefined ? 'absent' : `${r.height}, ${r.tall}`; };
      const tall = (name: string) => reach.find((each) => each.name === name)?.tall ?? 0;
      const file = `dialog-${screen.replace(/[^a-z]+/g, '-')}-w${width}-${pointer}-cancel${tall('Cancel')}-delete${tall('Delete')}-close${tall('Close')}.png`;
      await page.screenshot({ path: join(OUT, file) });
      md.push(`| ${screen} | ${width} | ${pointer} | ${of('Cancel')} | ${of('Delete')} | ${of('Close')} | ${file} |`);
    }
    await context.close();
  }
  writeFileSync(join(OUT, 'dialog-128.md'), `${md.join('\n')}\n`);
});

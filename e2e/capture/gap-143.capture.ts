import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { registerCleanup, trackArtist, trackCreated } from '../cleanup';
import { DIALOG, pointerIs } from '../hit-area';
import { gapBetween } from '../pair-gap';
import { login } from '../sign-in';
import { wholePage } from '../whole-page';

registerCleanup();

/**
 * Step 143's captures: the three grouped pairs set 24 apart, §G.3's gap,
 * each at 320 and 390 under a coarse pointer and 1280 under a fine one, as
 * the step asks. The error screen's TRY AGAIN and COLLECTION, suggestions'
 * scope select and ASK CLAUDE, and the dialog's CANCEL and DELETE on the
 * want list. Three pairs changed, so three are pictured: Design confirms a
 * built result from its picture, and one screen's picture does not show
 * the other two.
 *
 * The sheet records, beside each picture, the axis the pair sat on and the
 * gap along it, read as the specs read them (`pair-gap.ts`): that column is
 * the answer to "where do pairs stack". The error screen is reached on
 * `/error-probe` under its cookie; the panel on `/suggestions/probe`, where
 * it is drawn configured without a model key; the dialog on the want list,
 * opened on a row this file makes and cleans up.
 *
 * The pointer is taken off the page before each picture; a folder that
 * exists is not replaced unless `CAPTURE_REPLACE=1` says so. Run with
 * CAPTURE=1 --project=capture.
 */
const OUT = join('docs', 'captures', 'gap-143');
const WINDOWS = [[320, 'coarse'], [390, 'coarse'], [1280, 'fine']] as const;

type Edges = { left: number; top: number; right: number; bottom: number };

test('the three grouped pairs 24 apart, at 320 and 390 coarse and 1280 fine', async ({ browser }) => {
  test.skip(process.env.CAPTURE !== '1', 'A capture tool: run with CAPTURE=1');
  if (existsSync(join(OUT, 'gap-143.md')) && process.env.CAPTURE_REPLACE !== '1') throw new Error(`${OUT} already holds a capture. It is not replaced unless CAPTURE_REPLACE=1 says so`);
  test.setTimeout(600_000);
  mkdirSync(OUT, { recursive: true });
  const md = [
    '# Step 143: grouped controls 24 apart',
    '',
    'The test database, desktop Chromium, touch on for the coarse pointer. Each row is one pair at one window: the axis the pair sits on (x, side by side; y, stacked) and the gap along it, read from the two boxes as the specs read them.',
    '',
    '| file | pair | width | pointer | axis | apart |',
    '|---|---|---|---|---|---|',
  ];
  for (const [width, pointer] of WINDOWS) {
    const context = await browser.newContext({ hasTouch: pointer === 'coarse', viewport: { width, height: 844 } });
    context.setDefaultTimeout(30_000);
    const page = await context.newPage();
    await login(page);
    expect(await pointerIs(page)).toBe(pointer);
    const origin = new URL(page.url()).origin;
    const settle = async () => {
      await page.addStyleTag({ content: 'nextjs-portal{display:none!important}' });
      await page.evaluate(() => document.fonts.ready);
      await page.mouse.move(1, 1);
      await page.waitForTimeout(300);
    };
    const row = async (slug: string, pair: string, read: () => Promise<[Edges, Edges]>, shoot: (path: string) => Promise<void>) => {
      const [a, b] = await read();
      const apart = gapBetween(a, b);
      const file = `${slug}-w${width}-${pointer}-${apart.axis}${apart.gap}.png`;
      await shoot(join(OUT, file));
      md.push(`| ${file} | ${pair} | ${width} | ${pointer} | ${apart.axis} | ${apart.gap} |`);
    };

    /* The error screen: TRY AGAIN and COLLECTION. */
    await context.addCookies([{ name: 'error-probe', value: 'throw', url: origin }]);
    await page.goto('/error-probe');
    await page.getByRole('heading', { level: 1, name: 'Something went wrong.' }).waitFor();
    await settle();
    await row('error-screen', 'TRY AGAIN and COLLECTION', () => page.evaluate(() => { const [a, b] = Array.from(document.querySelectorAll('main button, main a')); if (a === undefined || b === undefined) throw new Error('the error screen’s two controls are not there'); const e = (el: Element) => { const r = el.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom }; }; return [e(a), e(b)] as [Edges, Edges]; }), (path) => wholePage(page, path));
    await context.clearCookies({ name: 'error-probe' });

    /* Suggestions: the scope select and ASK CLAUDE, on the probe where the panel is drawn configured. */
    await page.goto('/suggestions/probe');
    await page.getByRole('button', { name: 'Ask Claude' }).waitFor();
    await settle();
    await row('suggestions', 'the scope select and ASK CLAUDE', () => page.evaluate(() => { const a = document.querySelector('[data-testid="gap-scope"]'); const b = document.querySelector('[data-ask-button]'); if (a === null || b === null) throw new Error('the select and ASK CLAUDE are not both there'); const e = (el: Element) => { const r = el.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom }; }; return [e(a), e(b)] as [Edges, Edges]; }), (path) => wholePage(page, path));

    /* The dialog: CANCEL and DELETE, opened from a want-list row this file makes. */
    const suffix = `g143${Date.now().toString(36)}`;
    const post = async (path: string, data: unknown) => {
      const response = await page.request.post(path, { data });
      expect(response.status(), path).toBe(201);
      const body = (await response.json()) as { id: string };
      trackCreated(path, body);
      return body.id;
    };
    const artist = await post('/api/artists', { name: `Discharge ${suffix}` });
    trackArtist(artist);
    await post('/api/want-list', { title: `Why ${suffix}`, artistId: artist });
    await page.goto('/want-list');
    await page.getByRole('listitem').filter({ hasText: `Why ${suffix}` }).getByRole('button', { name: 'Delete' }).click();
    await page.locator(DIALOG).waitFor();
    await page.locator(DIALOG).evaluate((el) => Promise.all(el.getAnimations().map((animation) => animation.finished)));
    await settle();
    await row('dialog', 'the dialog’s CANCEL and DELETE', () => page.locator(`${DIALOG} [data-slot="dialog-footer"] button`).evaluateAll((all) => { const [a, b] = all; if (a === undefined || b === undefined) throw new Error('the dialog’s two buttons are not there'); const e = (el: Element) => { const r = el.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom }; }; return [e(a), e(b)] as [Edges, Edges]; }), async (path) => { await page.screenshot({ path }); });
    await context.close();
  }
  writeFileSync(join(OUT, 'gap-143.md'), `${md.join('\n')}\n`);
});

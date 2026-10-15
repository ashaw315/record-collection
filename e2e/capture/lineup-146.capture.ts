import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { registerCleanup, trackArtist } from '../cleanup';
import { pointerIs } from '../hit-area';
import { login } from '../sign-in';
import { wholePage } from '../whole-page';

/**
 * Step 146, part 2: the lineup walk's slot as built, a walk in progress and
 * the picker's choices, beneath an artist's row at 1280 under a fine
 * pointer and beneath the open form at 390 under a coarse pointer. The
 * walk and the search are mocked at the route, as the specs mock them, so
 * the pictures show the states and not MusicBrainz; the artists are this
 * tool's own, plainly named. Run with CAPTURE=1 --project=capture; replaced
 * only with CAPTURE_REPLACE=1.
 */
registerCleanup();

const OUT = join('docs', 'captures', 'part2-146');

test('the lineup walk in progress and its picker, at 1280 fine and 390 coarse', async ({ browser }) => {
  test.skip(process.env.CAPTURE !== '1', 'A capture tool: run with CAPTURE=1');
  if (existsSync(join(OUT, 'lineup-146.md')) && process.env.CAPTURE_REPLACE !== '1') throw new Error(`${OUT} already holds the lineup's capture. It is not replaced unless CAPTURE_REPLACE=1 says so`);
  test.setTimeout(300_000);
  mkdirSync(OUT, { recursive: true });
  const md = ['# Step 146: part 2, the lineup walk’s slot', '', 'The test database, desktop Chromium, touch on for the coarse pointer; whole pages. The walk and the search are answered by the test, not MusicBrainz: Chaos UK’s walk is held at "Checked 12 members so far…", and The Varukers’ search finds two artists of that name.', '', '| file | screen | window | pointer | page height |', '|---|---|---|---|---|'];
  let made: { walker: string; picked: string } | null = null;
  for (const [width, pointer] of [[1280, 'fine'], [390, 'coarse']] as const) {
    const context = await browser.newContext({ hasTouch: pointer === 'coarse', viewport: { width, height: 844 } });
    context.setDefaultTimeout(30_000);
    const page = await context.newPage();
    await login(page);
    expect(await pointerIs(page)).toBe(pointer);
    const make = async (name: string) => {
      const response = await page.request.post('/api/artists', { data: { name } });
      const body = (await response.json()) as { id?: string; error?: { existingId?: string } };
      const id = response.status() === 409 && typeof body.error?.existingId === 'string' ? body.error.existingId : body.id;
      if (typeof id !== 'string') throw new Error(`${name}: ${response.status()}`);
      trackArtist(id);
      return id;
    };
    if (made === null) made = { walker: await make('Chaos UK'), picked: await make('The Varukers') };
    await page.route(`**/api/artists/${made.walker}/lineup`, async () => { /* held: the walk never answers, so the picture shows it in progress */ });
    await page.route(`**/api/artists/${made.walker}/lineup/progress`, async (route) => { await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ found: 12 }) }); });
    await page.route(`**/api/artists/${made.picked}/lineup`, async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ walked: false, candidates: [
        { mbid: 'mb-one', name: 'The Varukers', score: 100, type: 'Group', country: 'GB', disambiguation: 'UK hardcore punk/d-beat band', lifeSpan: { begin: '1979', end: null, ended: false } },
        { mbid: 'mb-two', name: 'The Varukers', score: 83, type: 'Group', country: 'GB', disambiguation: 'UK punk band, only one release', lifeSpan: { begin: '1978', end: '1980', ended: true } },
      ] }) });
    });
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
    await page.goto('/manage?artists=all');
    await page.getByRole('navigation', { name: 'Resource' }).getByRole('button', { name: 'Artists', exact: true }).click();
    const region = page.getByRole('region', { name: 'Artists' });
    await expect(region).toBeVisible();
    const lineupOf = async (name: string) => {
      if (width < 640) {
        const item = region.locator('[data-manage-row]').filter({ has: page.locator('[data-manage-name]', { hasText: name }) });
        await item.locator('[data-manage-open]').click();
        await item.locator('[data-manage-form]').waitFor();
        return item.getByRole('button', { name: /lineup/i });
      }
      return region.getByRole('button', { name: `Edit ${name}`, exact: true }).locator('xpath=ancestor::tr[1]').getByRole('button', { name: /lineup/i });
    };
    await (await lineupOf('Chaos UK')).click();
    await expect(page.getByTestId('lineup-progress')).toContainText(/12/);
    await shoot(page, 'lineup-walking', 'the lineup walk in progress, in its slot');
    await page.reload();
    await page.getByRole('navigation', { name: 'Resource' }).getByRole('button', { name: 'Artists', exact: true }).click();
    await expect(region).toBeVisible();
    await (await lineupOf('The Varukers')).click();
    await expect(page.getByTestId('lineup-picker')).toBeVisible();
    await shoot(page, 'lineup-picker', 'the lineup picker’s choices, in the slot');
    await context.close();
  }
  writeFileSync(join(OUT, 'lineup-146.md'), `${md.join('\n')}\n`);
});

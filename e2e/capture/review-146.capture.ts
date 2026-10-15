import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { registerCleanup, trackArtist } from '../cleanup';
import { pointerIs } from '../hit-area';
import { seedMatchCandidate } from '../seed';
import { login } from '../sign-in';
import { wholePage } from '../whole-page';

/**
 * Step 146, part 2: manage's duplicate review as built, one pair open and
 * then its merge confirmation shown, at 1280 under a fine pointer and 390
 * under a coarse pointer; whole pages. The pair is seeded as the specs
 * seed one, plainly named. Run with CAPTURE=1 --project=capture; replaced
 * only with CAPTURE_REPLACE=1.
 */
registerCleanup();

const OUT = join('docs', 'captures', 'part2-146');

test('the duplicate review and its merge confirmation, at 1280 fine and 390 coarse', async ({ browser }) => {
  test.skip(process.env.CAPTURE !== '1', 'A capture tool: run with CAPTURE=1');
  if (existsSync(join(OUT, 'review-146.md')) && process.env.CAPTURE_REPLACE !== '1') throw new Error(`${OUT} already holds the review's capture. It is not replaced unless CAPTURE_REPLACE=1 says so`);
  test.setTimeout(300_000);
  mkdirSync(OUT, { recursive: true });
  const md = ['# Step 146: part 2, manage’s duplicate review', '', 'The test database, desktop Chromium, touch on for the coarse pointer; whole pages. One seeded pair, The Varukers imported against The Varukers already held with one record.', '', '| file | screen | window | pointer | page height |', '|---|---|---|---|---|'];
  const pair = await seedMatchCandidate({ name: 'The Varukers', importedMbid: 'f3b1c2d4-5e6f-4a7b-8c9d-0e1f2a3b4c5d', localRecordTitle: 'Another Religion Another War' });
  trackArtist(pair.importedId);
  trackArtist(pair.localId);
  for (const [width, pointer] of [[1280, 'fine'], [390, 'coarse']] as const) {
    const context = await browser.newContext({ hasTouch: pointer === 'coarse', viewport: { width, height: 844 } });
    context.setDefaultTimeout(30_000);
    const page = await context.newPage();
    await login(page);
    expect(await pointerIs(page)).toBe(pointer);
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
    const review = page.getByTestId('match-review');
    await expect(review).toBeVisible();
    await shoot(page, 'review', 'manage, the duplicate review under the heading');
    const row = review.getByTestId('match-candidate').filter({ hasText: 'The Varukers' }).first();
    await row.getByRole('button', { name: /same artist/i }).click();
    await expect(row.getByTestId('merge-confirm')).toBeVisible();
    await shoot(page, 'review-confirm', 'manage, the merge’s confirmation as the section’s next lines');
    await context.close();
  }
  writeFileSync(join(OUT, 'review-146.md'), `${md.join('\n')}\n`);
});

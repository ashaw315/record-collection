import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { registerCleanup } from '../cleanup';
import { pointerIs } from '../hit-area';
import { login } from '../sign-in';
import { wholePage } from '../whole-page';
import { collectionReportFromFixtures } from '../../test/fixtures/discogs/collection-report';

/**
 * **Step 158's captures for §T.6's Provisionals line** ("Where it falls and
 * how a long open list reads are provisional until Code captures it at 1280
 * and 390 on Adam's real import"): Manage with the import's report closed,
 * and with its longest list open, at 1280 fine and 390 coarse. A capture
 * tool: runs with CAPTURE=1 and writes nothing otherwise. The report is
 * Adam's nine through the real mapping from the committed fixtures, answered
 * by the tool, so nothing leaves the machine and the test database is not
 * written. It also records whether the report survives leaving Manage,
 * which §T.6 leaves unruled and asks Code to report.
 */
registerCleanup();
const OUT = join('docs', 'captures', 'import-158');
const json = (body: unknown) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });

test('the import on Manage, closed and with the longest list open, at 1280 fine and 390 coarse', async ({ browser }) => {
  test.skip(process.env.CAPTURE !== '1', 'A capture tool: run with CAPTURE=1');
  if (existsSync(join(OUT, 'import-158.md')) && process.env.CAPTURE_REPLACE !== '1') throw new Error(`${OUT} already holds the capture. It is not replaced unless CAPTURE_REPLACE=1 says so`);
  test.setTimeout(300_000);
  mkdirSync(OUT, { recursive: true });
  const report = collectionReportFromFixtures();
  const md = ['# Step 158: the Discogs import on Manage', '', 'The test database, desktop Chromium, touch on for the coarse pointer; whole pages. The report is Adam’s nine (AdamPseudo’s collection, captured 27 Oct) through the real mapping, answered by the tool: 9 came in, 0 skipped as already held, 9 imported blank (the mapping lists every format text under colour, so each of the nine has a line). No duplicate review is open, so the section stands directly beneath the heading.', '', '| file | window | pointer | state | section top | section height | page height |', '|---|---|---|---|---|---|---|'];
  const survival: string[] = [];
  for (const [width, pointer] of [[1280, 'fine'], [390, 'coarse']] as const) {
    const context = await browser.newContext({ hasTouch: pointer === 'coarse', viewport: { width, height: 844 } });
    context.setDefaultTimeout(30_000);
    const page = await context.newPage();
    await login(page);
    expect(await pointerIs(page)).toBe(pointer);
    await page.route('**/api/discogs/import-collection', (route) => route.fulfill(json(report)));
    await page.goto('/manage');
    await page.locator('[data-import-control]').waitFor();
    await page.addStyleTag({ content: 'nextjs-portal{display:none!important}' });
    await page.evaluate(() => document.fonts.ready);
    const shoot = async (state: string) => {
      const m = await page.evaluate(() => { const s = (document.querySelector('[data-testid="discogs-import"]') as HTMLElement).getBoundingClientRect(); return { top: s.top + window.scrollY, height: s.height, page: document.documentElement.scrollHeight }; });
      const file = `import-158-w${width}-${pointer}-${state}.png`;
      await wholePage(page, join(OUT, file));
      md.push(`| ${file} | ${width} | ${pointer} | ${state} | ${m.top.toFixed(1)} | ${m.height.toFixed(1)} | ${m.page} |`);
    };
    await shoot('before');
    await page.locator('[data-import-control]').click();
    await expect(page.locator('[data-import-line]')).toHaveCount(3);
    await shoot('report-closed');
    await page.locator('[data-import-line="imported"] [data-import-summary]').click();
    await expect(page.locator('[data-import-line="imported"] [data-import-items] li')).toHaveCount(9);
    await shoot('report-imported-open');
    /* Unruled, Code reports: does the report survive leaving Manage? */
    await page.goto('/');
    await page.goto('/manage');
    await page.locator('[data-import-control]').waitFor();
    const survives = (await page.locator('[data-import-report]').count()) > 0;
    survival.push(`At ${width} under a ${pointer} pointer, after leaving for the collection and coming back, the report ${survives ? 'is still drawn' : 'is gone'}.`);
    await context.close();
  }
  md.push('', '## Does the report survive leaving Manage?', '', ...survival);
  writeFileSync(join(OUT, 'import-158.md'), `${md.join('\n')}\n`);
});

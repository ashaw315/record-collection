import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test, type Page } from '@playwright/test';
import { HIT_FLOOR, HIT_PAST, pointerIs, readReach, underFloor, type Reach } from '../hit-area';
import { login } from './login';

/**
 * The handoff: "Report the count meeting 44 on each of the five screens."
 * The want list (both views), look up at rest, stats, a real record's edit
 * form and each section of manage, at 390 and 320, on the real collection:
 * how many controls a finger reaches over 44 rows of pixels, how many it
 * does not, and how many a tap reaches from more than 9 past them.
 *
 * Under each pointer (§T.6, step 127): the floor is a coarse pointer's, so
 * the count that has to be N of N is the coarse one, and the page's height
 * under a fine one is what it was before any of it. Stats is read at 1280
 * as well, which the handoff asks for.
 *
 * Read-only. Nothing is pressed but manage's section names, which change
 * what is shown and write nothing. Look up is read at rest: a search there
 * calls Discogs. A control past the window's edge has no hit area to read
 * and is counted apart.
 */
/* Each run goes to a folder of its own, named by the caller: committed captures are not rewritten. */
const OUT = process.env.SHEET_OUT ?? join('docs', 'captures', 'hit-44');

async function settle(page: Page) {
  await page.locator('main, h1').first().waitFor({ timeout: 60_000 });
  await page.waitForLoadState('load');
  await page.addStyleTag({ content: 'nextjs-portal{display:none!important}' });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(600);
}

test('controls meeting 44 on the five screens, under each pointer, at 390 and 320', async ({ browser }) => {
  mkdirSync(OUT, { recursive: true });
  const md = ['# Controls meeting 44, on the real collection, under each pointer', '', `Read-only, desktop Chromium at each width, with touch on for the coarse pointer and off for the fine. “Meets” is a control whose own box is ${HIT_FLOOR} tall or that a tap reaches over ${HIT_FLOOR} rows of pixels down its middle; “past ${HIT_PAST}” is one a tap reaches from more than ${HIT_PAST} beyond its drawn edge; “off” is past the window’s edge, where nothing can be read. The floor is the coarse pointer’s: under a fine one the column says what a mouse has, and nothing is owed there.`, '',
    '| pointer | screen | window | page height | controls | meets 44 | under 44 | past 9 | off | under 44, by name and rows |', '|---|---|---|---|---|---|---|---|---|---|'];
  const all: Record<string, Reach[]> = {};
  for (const pointer of ['coarse', 'fine'] as const) {
    const context = await browser.newContext({ hasTouch: pointer === 'coarse', viewport: { width: 1280, height: 844 } });
    const page = await context.newPage();
    await login(page);
    if ((await pointerIs(page)) !== pointer) throw new Error(`the page was to have a ${pointer} pointer and has ${await pointerIs(page)}`);
    await page.goto('/?view=table');
    await page.locator('main table tbody tr a').first().waitFor({ timeout: 60_000 });
    const href = (await page.locator('main table tbody tr a').first().getAttribute('href')) ?? '';
    const editPath = `/records/${href.split('/').pop() ?? ''}/edit`;

    const row = async (name: string, width: number, within: string) => {
      const reach = await readReach(page, within);
      const off = await page.evaluate((selector) => Array.from(document.querySelector(selector)?.querySelectorAll<HTMLElement>('button, a, select, input:not([type=hidden]), textarea, summary') ?? []).filter((el) => el.getClientRects().length > 0 && (el.getBoundingClientRect().left >= innerWidth || el.getBoundingClientRect().right <= 0)).length, within);
      all[`${name} at ${width}, ${pointer}`] = reach;
      const under = underFloor(reach);
      const tally = new Map<string, number>();
      for (const r of under) tally.set(`${r.name.slice(0, 24)} ${r.tall}`, (tally.get(`${r.name.slice(0, 24)} ${r.tall}`) ?? 0) + 1);
      const named = [...tally.entries()].slice(0, 8).map(([k, n]) => (n > 1 ? `${k} ×${n}` : k)).join('; ') + (tally.size > 8 ? `; and ${tally.size - 8} more kinds` : '');
      const height = await page.evaluate(() => document.documentElement.scrollHeight);
      md.push(`| ${pointer} | ${name} | ${width} | ${height} | ${reach.length} | **${reach.length - under.length}** | ${under.length} | ${reach.filter((r) => r.left > HIT_PAST || r.right > HIT_PAST).length} | ${off} | ${named} |`);
      await page.screenshot({ path: join(OUT, `${name.toLowerCase().replace(/[^a-z]+/g, '-')}-w${width}-${pointer}-h${height}-meets${reach.length - under.length}of${reach.length}.png`), fullPage: true });
    };

    for (const width of [390, 320, 1280]) {
      await page.setViewportSize({ width, height: 844 });
      const screens = [['Want list', '/want-list'], ['Want list, acquired', '/want-list?acquired=true'], ['Look up', '/lookup'], ['Stats', '/stats'], ['Record form, editing', editPath]] as const;
      /* 1280 is read for stats alone, the screen whose length the pointer changes most. */
      for (const [name, path] of width === 1280 ? screens.filter(([each]) => each === 'Stats') : screens) {
        await page.goto(path);
        await settle(page);
        await row(name, width, 'main');
      }
      if (width === 1280) continue;
      await page.goto('/manage');
      await settle(page);
      const names = page.locator('nav[aria-label="Resource"] button');
      const count = await names.count();
      for (let i = 0; i < count; i += 1) {
        await names.nth(i).click();
        await page.waitForTimeout(400);
        await row(`Manage, ${((await names.nth(i).textContent()) ?? String(i)).trim()}`, width, '[data-screen-frame]');
      }
    }
    await context.close();
  }
  writeFileSync(join(OUT, 'hit-44.md'), `${md.join('\n')}\n`);
  writeFileSync(join(OUT, 'hit-44.json'), JSON.stringify(all, null, 1));
});

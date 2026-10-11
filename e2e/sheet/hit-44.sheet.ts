import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test, type Page } from '@playwright/test';
import { HIT_FLOOR, HIT_PAST, readReach, type Reach } from '../hit-area';
import { login } from './login';

/**
 * The handoff: "Report the count meeting 44 on each of the five screens."
 * The want list (both views), look up at rest, stats, a real record's edit
 * form and each section of manage, at 390 and 320, on the real collection:
 * how many controls a finger reaches over 44 rows of pixels, how many it
 * does not, and how many a tap reaches from more than 9 past them.
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

test('controls meeting 44 to a finger on the five screens, at 390 and 320', async ({ page }) => {
  mkdirSync(OUT, { recursive: true });
  await login(page);

  await page.setViewportSize({ width: 1280, height: 844 });
  await page.goto('/?view=table');
  await page.locator('main table tbody tr a').first().waitFor({ timeout: 60_000 });
  const href = (await page.locator('main table tbody tr a').first().getAttribute('href')) ?? '';
  const editPath = `/records/${href.split('/').pop() ?? ''}/edit`;

  const md = ['# Controls meeting 44 to a finger, on the real collection', '', `Read-only, desktop Chromium at a phone’s widths. “Meets” is ${HIT_FLOOR} or more rows of pixels down the control’s middle on which a tap reaches it; “past ${HIT_PAST}” is a control a tap reaches from more than ${HIT_PAST} beyond its drawn edge; “off” is past the window’s edge, where nothing can be read.`, '',
    '| screen | window | controls | meets 44 | under 44 | past 9 | off | under 44, by name and rows |', '|---|---|---|---|---|---|---|---|'];
  const all: Record<string, Reach[]> = {};
  const row = async (name: string, width: number, within: string) => {
    const reach = await readReach(page, within);
    const off = await page.evaluate((selector) => Array.from(document.querySelector(selector)?.querySelectorAll<HTMLElement>('button, a, select, input:not([type=hidden]), textarea, summary') ?? []).filter((el) => el.getClientRects().length > 0 && (el.getBoundingClientRect().left >= innerWidth || el.getBoundingClientRect().right <= 0)).length, within);
    all[`${name} at ${width}`] = reach;
    const under = reach.filter((r) => r.tall < HIT_FLOOR);
    const tally = new Map<string, number>();
    for (const r of under) tally.set(`${r.name.slice(0, 24)} ${r.tall}`, (tally.get(`${r.name.slice(0, 24)} ${r.tall}`) ?? 0) + 1);
    const named = [...tally.entries()].slice(0, 12).map(([k, n]) => (n > 1 ? `${k} ×${n}` : k)).join('; ') + (tally.size > 12 ? `; and ${tally.size - 12} more kinds` : '');
    md.push(`| ${name} | ${width} | ${reach.length} | **${reach.length - under.length}** | ${under.length} | ${reach.filter((r) => r.left > HIT_PAST || r.right > HIT_PAST).length} | ${off} | ${named} |`);
    await page.screenshot({ path: join(OUT, `${name.toLowerCase().replace(/[^a-z]+/g, '-')}-w${width}-meets${reach.length - under.length}of${reach.length}.png`), fullPage: true });
  };

  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    for (const [name, path] of [['Want list', '/want-list'], ['Want list, acquired', '/want-list?acquired=true'], ['Look up', '/lookup'], ['Stats', '/stats'], ['Record form, editing', editPath]] as const) {
      await page.goto(path);
      await settle(page);
      await row(name, width, 'main');
    }
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
  writeFileSync(join(OUT, 'hit-44.md'), `${md.join('\n')}\n`);
  writeFileSync(join(OUT, 'hit-44.json'), JSON.stringify(all, null, 1));
});

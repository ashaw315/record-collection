import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test, type Page } from '@playwright/test';
import { HIT_FLOOR, HIT_PAST, pointerIs, readReach, underFloor } from '../hit-area';
import { wholePage } from '../whole-page';
import { login } from './login';

/**
 * One design pass's recapture and re-count, on the real collection: "each
 * of the three steps re-counts the floor on the new shape rather than only
 * recapturing". `SHEET_SCREEN` names the screen (stats, want-list or
 * manage) and `SHEET_OUT` the folder, one a pass.
 *
 * The count under a coarse pointer at 320, 390 and 768; the pictures at
 * 390 under a coarse pointer and 1280 under a fine one (manage also at 320
 * coarse), each named by its count. Whole pages by `wholePage`: a
 * full-page screenshot draws the fine pointer's page.
 *
 * Read-only. Only manage's section names are pressed.
 */
const SCREEN = process.env.SHEET_SCREEN ?? '';
const OUT = process.env.SHEET_OUT ?? join('docs', 'captures', `pass-${SCREEN}`);
const SCREENS: Record<string, Array<[string, string]>> = {
  stats: [['stats', '/stats']],
  'want-list': [['want-list', '/want-list'], ['want-list-acquired', '/want-list?acquired=true']],
  manage: [['manage', '/manage']],
};

async function settle(page: Page) {
  await page.locator('main, h1').first().waitFor({ timeout: 60_000 });
  await page.waitForLoadState('load');
  await page.addStyleTag({ content: 'nextjs-portal{display:none!important}' });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(600);
}

test(`the ${SCREEN} pass: its count under a coarse pointer and its pictures`, async ({ browser }) => {
  const screens = SCREENS[SCREEN];
  if (screens === undefined) throw new Error(`SHEET_SCREEN is to be one of ${Object.keys(SCREENS).join(', ')}`);
  mkdirSync(OUT, { recursive: true });
  const md = [`# The ${SCREEN} pass, on the real collection`, '', `Read-only, desktop Chromium, touch on for the coarse pointer. “Meets” is a control ${HIT_FLOOR} tall to a finger; “past 9” one a tap reaches from more than ${HIT_PAST} beyond it; “under 44 across” one a tap reaches over fewer than ${HIT_FLOOR} pixels across its middle, read and not yet held; “past the edge” one whose box ends beyond the window.`, '', '| screen | window | pointer | page height | controls | meets 44 | under 44 | past 9 | under 44 across | past the edge | picture |', '|---|---|---|---|---|---|---|---|---|---|---|'];
  for (const [pointer, widths, pictured] of [['coarse', [320, 390, 768], SCREEN === 'manage' ? [320, 390] : [390]], ['fine', [1280], [1280]]] as const) {
    const context = await browser.newContext({ hasTouch: pointer === 'coarse', viewport: { width: 1280, height: 844 } });
    const page = await context.newPage();
    await login(page);
    if ((await pointerIs(page)) !== pointer) throw new Error(`the page was to have a ${pointer} pointer and has ${await pointerIs(page)}`);
    for (const width of widths) for (const [slug, path] of screens) {
      await page.setViewportSize({ width, height: 844 });
      await page.goto(path);
      await settle(page);
      const sections = SCREEN === 'manage' ? await page.locator('nav[aria-label="Resource"] button').allTextContents() : [''];
      for (const [index, section] of sections.entries()) {
        if (SCREEN === 'manage') { await page.locator('nav[aria-label="Resource"] button').nth(index).click(); await page.waitForTimeout(400); }
        /* Manage has no main of its own; its frame is the screen. */
        const within = SCREEN === 'manage' ? '[data-screen-frame]' : 'main';
        const reach = await readReach(page, within);
        const under = underFloor(reach);
        const m = await page.evaluate((root) => ({ height: document.documentElement.scrollHeight, past: Array.from(document.querySelector(root)?.querySelectorAll<HTMLElement>('a, button, input:not([type=hidden]), select, textarea') ?? []).filter((el) => el.getClientRects().length > 0 && el.getBoundingClientRect().right > innerWidth + 0.5).length }), within);
        const name = `${slug}${section === '' ? '' : `-${section.trim().toLowerCase().replace(/[^a-z]+/g, '-')}`}`;
        const file = `${name}-w${width}-${pointer}-pointer-h${m.height}-meets${reach.length - under.length}of${reach.length}.png`;
        const taken = (pictured as readonly number[]).includes(width);
        if (taken) await wholePage(page, join(OUT, file));
        md.push(`| ${name} | ${width} | ${pointer} | ${m.height} | ${reach.length} | **${reach.length - under.length}** | ${under.length}${under.length === 0 ? '' : `: ${[...new Set(under.map((r) => `${r.name.slice(0, 20)} ${r.tall}`))].slice(0, 6).join('; ')}`} | ${reach.filter((r) => r.left > HIT_PAST || r.right > HIT_PAST).length} | ${reach.filter((r) => r.wide < HIT_FLOOR).length} | ${m.past} | ${taken ? file : ''} |`);
      }
    }
    await context.close();
  }
  writeFileSync(join(OUT, `pass-${SCREEN}.md`), `${md.join('\n')}\n`);
});

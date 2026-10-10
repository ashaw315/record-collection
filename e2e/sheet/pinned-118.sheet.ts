import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from '@playwright/test';
import { FORK } from '../../src/app/sidebar-layout';
import { login } from './login';

/**
 * Step 118, for Design: the five screens pinned left at the 20 inset with
 * their measures kept (736; manage 1,120), where each stood in a centred
 * column. Not ruled; built to the coordinator's reading for these captures.
 *
 * Read-only. Nothing is pressed and no record's page is opened.
 */
const OUT = process.env.SHEET_OUT ?? join('docs', 'captures', 'pinned-118');
const WIDTHS = [1920, 1440, 1081, 1080, FORK, FORK - 1, 1024, 390];
const r1 = (n: number) => String(Math.round(n * 10) / 10);

test('the five screens pinned left: each one’s left, measure and the paper to its right', async ({ page }) => {
  mkdirSync(OUT, { recursive: true });
  await login(page);

  /* A real record's form, for the editing state: the first row's link, read and not followed. */
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/?view=table');
  const href = await page.locator('main table tbody tr a').first().getAttribute('href', { timeout: 60_000 });
  if (href === null) throw new Error('no record in the table to read a form path from');

  const screens = [
    { name: 'stats', path: '/stats' },
    { name: 'want-list', path: '/want-list' },
    { name: 'look-up', path: '/lookup' },
    { name: 'record-form-new', path: '/records/new' },
    { name: 'record-form-edit', path: `${href.split('?')[0]}/edit` },
    { name: 'manage', path: '/manage' },
  ];

  const md = ['# Step 118: the five screens pinned left at the 20 inset, their measures kept, on the real collection', '', 'Read-only, desktop Chromium, windows 1000 tall. “Was” is where the centred column put the content’s left, by arithmetic from the old classes and not measured here.', '',
    '| screen | window | content’s left | was | heading’s left | wordmark’s left | measure | paper to its right | scrolls sideways by | capture |', '|---|---|---|---|---|---|---|---|---|---|'];
  for (const screen of screens) {
    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: 1000 });
      await page.goto(screen.path);
      await page.locator('h1').first().waitFor({ timeout: 60_000 });
      await page.waitForLoadState('load');
      await page.evaluate(() => document.fonts.ready);
      await page.addStyleTag({ content: 'nextjs-portal{display:none!important}' });
      await page.waitForTimeout(500);
      const m = await page.evaluate(() => {
        const frame = document.querySelector<HTMLElement>('[data-screen-frame]');
        const heading = document.querySelector('h1');
        const wordmark = document.querySelector('[data-wordmark]');
        if (frame === null || heading === null || wordmark === null) return null;
        const style = getComputedStyle(frame);
        const box = frame.getBoundingClientRect();
        const left = box.left + Number.parseFloat(style.paddingLeft);
        const right = box.right - Number.parseFloat(style.paddingRight);
        return { left, right, heading: heading.getBoundingClientRect().left, wordmark: wordmark.getBoundingClientRect().left, scrolls: document.documentElement.scrollWidth - document.documentElement.clientWidth, client: document.documentElement.clientWidth };
      });
      if (m === null) throw new Error(`${screen.name} at ${width}: no frame, heading or wordmark`);
      const old = screen.name === 'manage' ? { cap: 1152, pad: 16 } : { cap: 768, pad: 16 };
      const was = Math.max(0, (width - old.cap) / 2) + old.pad;
      const file = `${screen.name}-w${width}-left${Math.round(m.left)}-measure${Math.round(m.right - m.left)}.png`;
      await page.screenshot({ path: join(OUT, file) });
      md.push(`| ${screen.name} | ${width} | **${r1(m.left)}** | ${r1(was)} | ${r1(m.heading)} | ${r1(m.wordmark)} | **${r1(m.right - m.left)}** | ${r1(m.client - m.right)} | ${r1(m.scrolls)} | ${file} |`);
    }
  }
  writeFileSync(join(OUT, 'pinned-118.md'), `${md.join('\n')}\n`);
});

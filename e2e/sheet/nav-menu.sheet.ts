import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from '@playwright/test';
import { login } from './login';

/**
 * **The menu sheet (step 76): every screen closed and open at 320, 390 and
 * 583, the width just below the breakpoint, and the record detail in each of
 * its four forms.** Read-only, from the real app, like the header sheet. Each
 * capture is the header and 120px of the page beneath it, so the open list
 * is seen pushing the page down.
 *
 * Named by the figures that differ: the header's height and whether the menu
 * is open (`-open-h318`), so a closed and an open shot of one screen are told
 * apart by name. The record forms carry the form's name.
 */
const OUT = process.env.SHEET_OUT ?? join('docs', 'captures', 'nav-menu-76');
const RECORD = process.env.HEADER_RECORD_ID ?? '';
const WANT = process.env.HEADER_WANT_ID ?? '';
const BELOW = 120;

const SCREENS: ReadonlyArray<readonly [string, string]> = [
  ['collection', '/'],
  ['want-list', '/want-list'],
  ['want-list-new', '/want-list/new'],
  ['want-list-item', `/want-list/${WANT}`],
  ['want-list-item-edit', `/want-list/${WANT}/edit`],
  ['lookup', '/lookup'],
  ['stats', '/stats'],
  ['manage', '/manage'],
  ['suggestions', '/suggestions'],
  ['record-new', '/records/new'],
  ['record', `/records/${RECORD}`],
  ['record-edit', `/records/${RECORD}/edit`],
];

/* §G.8's four forms of the record detail, at a width inside each. */
const FORMS: ReadonlyArray<readonly [string, number]> = [
  ['links-slot-in-line', 1000],
  ['links-slot-own-row', 700],
  ['control-slot-in-line', 500],
  ['control-slot-own-row', 390],
];

test('the menu sheet: twelve screens closed and open at three widths, and the record detail’s four forms', async ({ page }) => {
  if (RECORD === '' || WANT === '') throw new Error('Set HEADER_RECORD_ID and HEADER_WANT_ID to real ids.');
  mkdirSync(OUT, { recursive: true });
  await login(page);
  const manifest: unknown[] = [];

  const shoot = async (name: string, path: string, width: number, openMenu: boolean, tag: string) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto(path);
    await page.locator('[data-app-nav]').waitFor({ timeout: 30_000 });
    await page.addStyleTag({ content: 'nextjs-portal{display:none!important}' });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(500);
    if (openMenu) {
      await page.locator('[data-menu-control]').click();
      await page.locator('[data-menu-list]').waitFor();
      await page.waitForTimeout(200);
    }
    const m = await page.evaluate(() => {
      const header = document.querySelector('[data-app-nav]') as HTMLElement;
      const bar = (header.firstElementChild as HTMLElement).getBoundingClientRect();
      const control = header.querySelector('[data-menu-control]') as HTMLElement | null;
      const shown = (el: Element | null) => el !== null && el.getClientRects().length > 0;
      const slot = header.querySelector('[data-slot="actions"]');
      return {
        height: Math.round(header.getBoundingClientRect().height),
        menuShown: shown(control),
        menuOpen: control?.getAttribute('aria-expanded') === 'true',
        controlWidth: shown(control) ? Math.round((control as HTMLElement).getBoundingClientRect().width * 100) / 100 : null,
        slotOwnRow: slot === null ? null : slot.getBoundingClientRect().top - bar.top >= 52,
        navHeightVar: document.documentElement.style.getPropertyValue('--app-nav-height'),
      };
    });
    const file = `menu-${name}-${String(width).padStart(4, '0')}-${tag}-h${m.height}.png`;
    await page.screenshot({ path: join(OUT, file), clip: { x: 0, y: 0, width, height: m.height + BELOW } });
    manifest.push({ screen: name, width, tag, file, ...m });
  };

  for (const [name, path] of SCREENS) {
    for (const width of [320, 390, 583]) {
      await shoot(name, path, width, false, 'closed');
      await shoot(name, path, width, true, 'open');
    }
  }
  for (const [form, width] of FORMS) await shoot('record-form', `/records/${RECORD}`, width, false, form);

  writeFileSync(join(OUT, 'manifest.json'), `${JSON.stringify(manifest, null, 1)}\n`);
});

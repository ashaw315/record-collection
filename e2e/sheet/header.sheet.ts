import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from '@playwright/test';
import { login } from './login';

/**
 * **The header sheet: AppHeader on every screen that mounts it, at 390,
 * 1000, 1440 and 1920, from the real app.** Read-only, like the contact
 * sheet: it signs in, loads each screen with GET, measures the header and
 * screenshots the header element alone. Nothing is posted but the login.
 *
 * Each file is named by the figures that differ between screens and
 * windows, the header's rendered height and its bar's width
 * (`-h53-w1152`), per the capture-naming rule. The
 * manifest carries, per capture, what the header measured: height, rows,
 * every child's box, the slot's contents, the computed background and
 * position, and whether the header stays in view after the page scrolls.
 *
 * The record and want-list ids are the real collection's, passed in by the
 * operator (`HEADER_RECORD_ID`, `HEADER_WANT_ID`), so no id lives here.
 */
const WIDTHS = [390, 1000, 1440, 1920] as const;
const HEIGHT = 900;
const OUT = process.env.SHEET_OUT ?? join('docs', 'captures', 'header');
const RECORD = process.env.HEADER_RECORD_ID ?? '';
const WANT = process.env.HEADER_WANT_ID ?? '';
/** `HEADER_ONLY=record-new` re-takes one screen and replaces only its rows in the existing manifest. */
const ONLY = process.env.HEADER_ONLY ?? '';

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

test('the header sheet: AppHeader on twelve screens at four widths, with a manifest', async ({ page }) => {
  if (RECORD === '' || WANT === '') throw new Error('Set HEADER_RECORD_ID and HEADER_WANT_ID to real ids.');
  mkdirSync(OUT, { recursive: true });
  await login(page);
  const manifestPath = join(OUT, 'manifest.json');
  const kept = ONLY !== '' && existsSync(manifestPath)
    ? (JSON.parse(readFileSync(manifestPath, 'utf8')) as { screen: string }[]).filter((row) => row.screen !== ONLY)
    : [];
  const manifest: unknown[] = [];
  const screens = ONLY === '' ? SCREENS : SCREENS.filter(([name]) => name === ONLY);
  if (screens.length === 0) throw new Error(`No screen named "${ONLY}".`);

  for (const [name, path] of screens) {
    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: HEIGHT });
      const response = await page.goto(path);
      const header = page.locator('[data-app-nav]');
      await header.waitFor({ timeout: 30_000 });
      await page.addStyleTag({ content: 'nextjs-portal{display:none!important}' });
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(500);

      const m = await page.evaluate(() => {
        const el = document.querySelector('[data-app-nav]') as HTMLElement;
        const inner = el.firstElementChild as HTMLElement;
        const box = (e: Element) => {
          const r = e.getBoundingClientRect();
          return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
        };
        const links = Array.from(el.querySelectorAll('nav[aria-label="Main"] a')).map((a) => ({
          text: (a.textContent ?? '').trim(),
          href: a.getAttribute('href'),
          current: a.getAttribute('aria-current'),
          colour: getComputedStyle(a).color,
          weight: getComputedStyle(a).fontWeight,
          ...box(a),
        }));
        const rowsOf = (items: { y: number }[]) => new Set(items.map((i) => i.y)).size;
        const slot = el.querySelector('[data-slot="actions"]');
        const wordmark = el.querySelector('a[href="/"]:not(nav a)');
        const cs = getComputedStyle(el);
        return {
          header: box(el),
          inner: { ...box(inner), maxWidth: getComputedStyle(inner).maxWidth },
          background: cs.backgroundColor,
          position: cs.position,
          borderBottom: `${cs.borderBottomWidth} ${cs.borderBottomColor}`,
          wordmark: wordmark === null ? null : { text: (wordmark.textContent ?? '').trim(), font: `${getComputedStyle(wordmark).fontSize} ${getComputedStyle(wordmark).fontWeight}`, ...box(wordmark) },
          navRows: rowsOf(links),
          links,
          slot: slot === null ? null : { text: (slot.textContent ?? '').replace(/\s+/g, ' ').trim(), ...box(slot) },
          pageScrolls: document.documentElement.scrollHeight > window.innerHeight + 1,
          navHeightVar: document.documentElement.style.getPropertyValue('--app-nav-height'),
        };
      });

      /* Sticks or scrolls: scroll the page by half a viewport and read where the header went. */
      const afterScroll = await page.evaluate(async () => {
        window.scrollTo(0, Math.round(window.innerHeight / 2));
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        const top = Math.round((document.querySelector('[data-app-nav]') as HTMLElement).getBoundingClientRect().top);
        const scrolled = Math.round(window.scrollY);
        window.scrollTo(0, 0);
        return { scrolled, headerTop: top };
      });

      /* Height and the bar's width: the two figures that differ between screens and windows (the bar's width is how /records/new's defect showed). */
      const file = `header-${name}-${width}-h${m.header.h}-w${m.inner.w}.png`;
      await header.screenshot({ path: join(OUT, file) });
      manifest.push({ screen: name, path: path.replace(RECORD, ':record').replace(WANT, ':want'), status: response?.status() ?? null, width, file, ...m, afterScroll });
    }
  }
  const order = SCREENS.map(([name]) => name);
  const rows = [...kept, ...manifest] as { screen: string; width: number }[];
  rows.sort((a, b) => order.indexOf(a.screen) - order.indexOf(b.screen) || a.width - b.width);
  writeFileSync(manifestPath, `${JSON.stringify(rows, null, 1)}\n`);
});

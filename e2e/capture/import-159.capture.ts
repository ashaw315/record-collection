import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { registerCleanup } from '../cleanup';
import { pointerIs } from '../hit-area';
import { removeImportRuns, seedImportRun } from '../seed';
import { login } from '../sign-in';
import { wholePage } from '../whole-page';
import { collectionReportFromFixtures } from '../../test/fixtures/discogs/collection-report';

/**
 * **Step 159's captures for §T.6's Provisionals line**: Manage before a
 * run, after a run with the lines closed and with the longest list open,
 * and after leaving Manage and coming back, at 1280 fine and 390 coarse. A
 * capture tool: runs with CAPTURE=1 and writes nothing otherwise. The run's
 * report is Adam's nine through the real mapping from the committed
 * fixtures, answered by the tool; the return reads a run row seeded as the
 * route stores one, with the same report, so nothing leaves the machine and
 * no import runs.
 *
 * **The pointer is moved off the page and focus is cleared before every
 * picture.** Step 158's captures were read as showing an underline on
 * IMPORT FROM DISCOGS and on "9 came in": the pointer was resting on the
 * element the tool had just pressed, and `hover:underline` drew what it
 * draws under a pointer. The instrument moved what it measured, and a
 * reader spent a turn on it (Design, 28 Oct). The measures file says what
 * each picture holds; nothing in them is hovered or focused.
 *
 * The lines' pitch is in the measures table at both widths, because the
 * type-and-pitch ruling came from a reader eyeballing a PNG where the
 * figure was not written down.
 */
registerCleanup();
test.afterEach(async () => { await removeImportRuns(); });
const OUT = join('docs', 'captures', 'import-159');
const FINISHED = '2026-10-28T21:05:00.000Z';
const json = (body: unknown) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });

/** Nothing hovered, nothing focused: the picture is the page at rest. */
async function rest(page: Page): Promise<void> {
  await page.mouse.move(0, 0);
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.addStyleTag({ content: 'nextjs-portal{display:none!important}' });
  await page.evaluate(() => document.fonts.ready);
}

/**
 * WCAG contrast of two computed colours. Chromium reports the page's oklch
 * inks as `lab(...)`, so the colour is painted on a canvas and read back as
 * sRGB rather than parsed as if it were `rgb(...)`, which the first version
 * did and reported 1.35:1 for a 7:1 ink.
 */
const contrastScript = `
  const rgb = (css) => { const c = document.createElement('canvas'); c.width = c.height = 1; const g = c.getContext('2d'); g.fillStyle = css; g.fillRect(0, 0, 1, 1); return Array.from(g.getImageData(0, 0, 1, 1).data).slice(0, 3); };
  const lum = (css) => { const [r, g, b] = rgb(css).map((v) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  const ratio = (a, b) => { const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };
`;

test('the import on Manage before a run, after a run closed and open, and after leaving and coming back, at 1280 fine and 390 coarse', async ({ browser }) => {
  test.skip(process.env.CAPTURE !== '1', 'A capture tool: run with CAPTURE=1');
  if (existsSync(join(OUT, 'import-159.md')) && process.env.CAPTURE_REPLACE !== '1') throw new Error(`${OUT} already holds the capture. It is not replaced unless CAPTURE_REPLACE=1 says so`);
  test.setTimeout(300_000);
  mkdirSync(OUT, { recursive: true });
  const report = collectionReportFromFixtures();
  const md = ['# Step 159: the Discogs import on Manage, the four-line report', '', 'The test database, desktop Chromium, touch on for the coarse pointer; whole pages. Before every picture the pointer is moved to the window’s corner and focus is cleared, so nothing in them is hovered or focused (step 158’s underlines were the resting pointer). The report is Adam’s nine (AdamPseudo’s collection, captured 27 Oct) through the real mapping with the colour fix, answered by the tool: 4 came in complete, 5 came in with a field blank, 0 skipped as already held, 0 failed, adding up to the 9 Discogs’ page holds. “Returned” reads a run row seeded as the route stores one, with the same report, after leaving for the collection and coming back. No duplicate review is open, so the section stands directly beneath the heading. The open glyph is §T.1’s −, `disclosure-mark.tsx`’s 12 × 1 line, not a dash character.', '', '| file | window | pointer | state | section top | section height | lines’ pitch | line type | entry type | entry contrast | page height |', '|---|---|---|---|---|---|---|---|---|---|---|'];
  for (const [width, pointer] of [[1280, 'fine'], [390, 'coarse']] as const) {
    const context = await browser.newContext({ hasTouch: pointer === 'coarse', viewport: { width, height: 844 } });
    context.setDefaultTimeout(30_000);
    const page = await context.newPage();
    await login(page);
    expect(await pointerIs(page)).toBe(pointer);
    await page.route('**/api/discogs/import-collection', (route) => route.fulfill(json({ report, finishedAt: FINISHED })));
    await removeImportRuns();
    await page.goto('/manage');
    await page.locator('[data-import-control]').waitFor();
    const shoot = async (state: string) => {
      await rest(page);
      const m = await page.evaluate((script) => {
        // eslint-disable-next-line no-new-func
        const { ratio } = new Function(`${script}; return { ratio };`)() as { ratio: (a: string, b: string) => number };
        const s = (document.querySelector('[data-testid="discogs-import"]') as HTMLElement).getBoundingClientRect();
        const lines = Array.from(document.querySelectorAll<HTMLElement>('[data-import-line]')).map((el) => el.getBoundingClientRect().top);
        /* The three gaps between the four lines' tops; an open list widens the gap after its line by the list's height. */
        const pitch = lines.length > 1 ? lines.slice(1).map((t, i) => Math.round((t - lines[i]) * 10) / 10).join(' / ') : '';
        const summary = document.querySelector<HTMLElement>('[data-import-line] [data-import-summary]');
        const entry = document.querySelector<HTMLElement>('[data-import-items] li');
        const ground = getComputedStyle(document.body).backgroundColor;
        const type = (el: HTMLElement | null) => (el === null ? '' : `${getComputedStyle(el).fontSize} ${getComputedStyle(el).color}`);
        const muted = document.createElement('span'); muted.className = 'text-muted-foreground'; document.body.append(muted);
        const before158 = ratio(getComputedStyle(muted).color, ground).toFixed(2); muted.remove();
        return { top: s.top + window.scrollY, height: s.height, page: document.documentElement.scrollHeight, pitch, line: type(summary), entry: type(entry), contrast: entry === null ? '' : `${ratio(getComputedStyle(entry).color, ground).toFixed(2)}:1 (step 158’s muted ink: ${before158}:1)` };
      }, contrastScript);
      const file = `import-159-w${width}-${pointer}-${state}.png`;
      await wholePage(page, join(OUT, file));
      md.push(`| ${file} | ${width} | ${pointer} | ${state} | ${m.top.toFixed(1)} | ${m.height.toFixed(1)} | ${m.pitch} | ${m.line} | ${m.entry} | ${m.contrast} | ${m.page} |`);
    };
    await shoot('before');
    await page.locator('[data-import-control]').click();
    await expect(page.locator('[data-import-line]')).toHaveCount(4);
    await shoot('after-closed');
    await page.locator('[data-import-line="blank"] [data-import-summary]').click();
    await expect(page.locator('[data-import-line="blank"] [data-import-items] li')).toHaveCount(5);
    await shoot('after-open');
    await seedImportRun(report, FINISHED);
    await page.goto('/');
    await page.goto('/manage');
    await expect(page.locator('[data-import-line]')).toHaveCount(4);
    await shoot('returned');
    await removeImportRuns();
    await context.close();
  }
  writeFileSync(join(OUT, 'import-159.md'), `${md.join('\n')}\n`);
});

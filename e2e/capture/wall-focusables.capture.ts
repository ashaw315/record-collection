import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { login } from '../sign-in';

/**
 * **Every focusable control in the wall's view, and where each stands.** The
 * ring's scope is to be "outside the wall's drawn composition", which is a
 * phrase and not a test (the coordinator, 13 Oct): before the ring is
 * built, each control in the shelf's view is listed with its place, the
 * rail, the band, the count's row, a run, a record, so the scope can be a
 * set of controls Design confirms rather than a phrase.
 *
 * Read-only on the test database, at 1440 by 900 where the shelf is
 * offered, as the page opens and with nothing pressed. For each focusable
 * element: tag, text or label, and the nearest marked ancestors. Written
 * to `docs/captures/wall-focusables/`. Run with CAPTURE=1 --project=capture.
 */
const OUT = join('docs', 'captures', 'wall-focusables');

test('list the focusable controls in the wall’s view with where each stands', async ({ page }) => {
  test.skip(process.env.CAPTURE !== '1', 'A capture tool: run with CAPTURE=1');
  await login(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await page.locator('[data-shelf-offered] [data-wall]').first().waitFor({ timeout: 30_000 });
  await page.waitForLoadState('networkidle').catch(() => {});
  expect(await page.locator('[data-shelf-offered]').evaluate((el) => getComputedStyle(el).display), 'the shelf is the drawn view at 1440').not.toBe('none');

  const read = () => page.evaluate(() => {
    const MARKS = ['data-app-nav', 'data-collection-band', 'data-testid', 'data-wall', 'data-run', 'data-spine', 'data-record', 'data-pulled', 'data-seat', 'data-set-bar', 'data-shelf-offered', 'data-shelf-fallback', 'data-collection-views'];
    const place = (el: HTMLElement) => {
      const out: string[] = [];
      for (let n: HTMLElement | null = el; n !== null; n = n.parentElement) {
        for (const mark of MARKS) {
          const value = n.getAttribute(mark);
          if (value !== null && !(mark === 'data-testid' && n === el)) out.push(value === '' ? mark : `${mark}=${value}`);
        }
      }
      return [...new Set(out)].join(' › ');
    };
    return Array.from(document.querySelectorAll<HTMLElement>('a[href], button, input, select, textarea, [tabindex]'))
      .filter((el) => el.closest('nextjs-portal') === null && (el as HTMLButtonElement).disabled !== true && el.getAttribute('tabindex') !== '-1' && el.getClientRects().length > 0)
      .map((el) => {
        const r = el.getBoundingClientRect();
        const name = (el.getAttribute('aria-label') ?? el.getAttribute('title') ?? (el.textContent ?? '').trim() ?? '').replace(/\s+/g, ' ').slice(0, 40) || (el as HTMLInputElement).placeholder || el.id;
        return { tag: el.tagName.toLowerCase(), name, place: place(el), box: `${Math.round(r.width)}×${Math.round(r.height)} at ${Math.round(r.left)},${Math.round(r.top)}` };
      });
  });

  const rows = await read();
  /* The overview, where the runs are the stops (§W.30): after the count's zoom-out. */
  await page.getByTestId('wall-zoom-out').click();
  await page.locator('[data-wall="overview"]').waitFor({ timeout: 30_000 });
  const overview = await read();
  /* The pulled state (the wall's main interaction): a spine pulled from the labelled wall, which the route opens on. */
  await page.goto('/');
  await page.locator('[data-shelf-offered] [data-wall="labelled"]').waitFor({ timeout: 30_000 });
  await page.locator('a[data-seat] [data-spine]').first().click();
  await page.getByTestId('record-chrome').waitFor({ timeout: 30_000 });
  await page.locator('[data-pulled]').waitFor({ timeout: 30_000 });
  /* §W.9's arrows arrive once the pull has settled; read before that, the first reading (13 Oct) missed NEXT RECORD and gave 34 where the Tab walk finds 35 with the Apply in the order (step 144). */
  await page.locator('[data-testid="nav-next"], [data-testid="nav-previous"]').first().waitFor({ timeout: 30_000 });
  const pulled = await read();
  const table = (list: typeof rows) => list.map((row, index) => `| ${index + 1} | ${row.tag} | ${row.name.replace(/\|/g, '/')} | ${row.place.replace(/\|/g, '/') || '(none)'} | ${row.box} |`);

  mkdirSync(OUT, { recursive: true });
  writeFileSync(
    join(OUT, 'wall-focusables.md'),
    [
      '# The focusable controls in the wall’s view, at 1440 × 900',
      '',
      'The test database, desktop Chromium, the collection as it opens with the shelf offered and nothing pressed. Each row is one focusable element in document order, with the marked ancestors it stands in, outermost last. A reading for the ring’s scope; it decides nothing.',
      '',
      '| # | element | text or label | stands in | drawn box |',
      '|---|---|---|---|---|',
      ...table(rows),
      '',
      `${rows.length} focusable controls as the page opens (the labelled wall).`,
      '',
      '## After the count’s zoom-out: the overview',
      '',
      '| # | element | text or label | stands in | drawn box |',
      '|---|---|---|---|---|',
      ...table(overview),
      '',
      `${overview.length} focusable controls in the overview.`,
      '',
      '## A record pulled, from the labelled wall',
      '',
      '| # | element | text or label | stands in | drawn box |',
      '|---|---|---|---|---|',
      ...table(pulled),
      '',
      `${pulled.length} focusable controls with a record pulled.`,
      '',
      '## Three states, not one set',
      '',
      'The spines are focusable as the shelf opens and not in the overview; the run is focusable in the overview and not as the shelf opens; the pulled state adds the pulled record’s own controls and takes the pulled spine out. A scope written as one set of controls is three sets, one a state.',
      '',
      '## Where Code would draw the line, for Design to confirm or correct',
      '',
      '- **Outside the composition, the outside ring:** the header’s six links, which are not in the wall; the rail’s eight (the search field, the genre and sort selects, the hidden Apply, SHELF, TABLE, GRID, Add record), which are the page’s chrome; the count’s zoom-out, a control about the view in the count’s row above the fixture; and, pulled, the panel’s three (the link to the full record, TURN OVER, PUT BACK), because the panel is the pull’s chrome rather than a run or a record, and §W.9’s arrows beside the landed cover (NEXT RECORD, and PREVIOUS RECORD where there is a record before), 44 boxes present once the pull has settled, which the first reading missed. The side is decided by what a control is part of, not by whether its box has room for a ring: a boxed control drawn inside the composition would still be inside it.',
      '- **Inside the composition, its own marks:** the spines, whose focus §W.33 rules (the sink plus an ink mark on the top face), as the shelf opens and the sixteen left standing when one is pulled; and the run in the overview, whose focus §W.30 rules (the sink plus a 2px ink rule along its front edge), an SVG group that a CSS outline would not box in any case.',
      '- **Not focusable, so not in the question:** the set bar, and the pulled cover itself (its faces are turned by TURN OVER, not by focusing the cover).',
      '',
    ].join('\n'),
  );
});

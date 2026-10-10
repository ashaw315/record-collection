import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from '@playwright/test';
import { NO_SCROLL_HEIGHT } from '../../src/app/records/[id]/band-geometry';
import { construction } from '../../src/app/records/[id]/construction';
import { boundsOf } from '../../src/app/records/[id]/own-fit';
import { MIN_FACE_WIDTH } from '../../src/app/records/[id]/ornament';
import { measure } from './air-measure';
import { login } from './login';

/**
 * Step 103d's measurement, read-only on the real collection: **the air
 * beside each screen's heading, and the largest figure it holds.**
 *
 * §T.6: "The heading's figure takes the air right of the band at the
 * largest height that air holds, and is drawn only where that height is at
 * least the height at which its construction's narrowest face clears §29's
 * 6px." Reported for the table, the grid and the five screens at 1440, 1024
 * and 768.
 *
 * "The air" is measured, not assumed: every drawn thing in the screen's
 * main region (type, controls, images, drawings, and every drawn rule) is
 * a box, and the air is the largest empty rectangle among them that lies
 * right of the heading's type and begins no lower than its top, so that it
 * is beside the heading and not a gap somewhere down the page. A figure is
 * as wide as it is tall, give or take its record, so each rectangle is
 * scored by the square it holds, and the widest and tallest candidates are
 * reported beside it.
 *
 * The first version let a rectangle begin at the heading's foot and did
 * not count rules. Read against its own captures it had found the gap
 * between a form's labels and its fields, below the heading, and on the
 * want list a rectangle running down across three row rules into the list.
 *
 * Nothing is pressed.
 */
const OUT = process.env.SHEET_OUT ?? join('docs', 'captures', 'air-103');
const WIDTHS = [1440, 1024, 768];
/* The first view's height: the one the record page is ruled against, so the screens are read in the same window. */
const HEIGHT = NO_SCROLL_HEIGHT;
/* §G.3's gap, which §T.6 keeps between the air and a control, type or the header. */
const MARGIN = 24;

/**
 * The height at which a record's construction has its narrowest side face at §29's 6px, and how wide the
 * construction is for its height. From the build's own `construction()` and `boundsOf()`: nothing is drawn.
 */
function clearing(id: string): { height: number; aspect: number } {
  const scene = construction(id);
  const b = boundsOf(scene);
  const tall = b.maxY - b.minY;
  let narrow = Infinity;
  for (const form of scene.forms) for (const face of form.faces) {
    if (face.kind === 'top') continue;
    const xs = face.points.map((p) => p[0]);
    narrow = Math.min(narrow, Math.max(...xs) - Math.min(...xs));
  }
  return { height: (MIN_FACE_WIDTH / narrow) * tall, aspect: (b.maxX - b.minX) / tall };
}

test('the air beside each screen’s heading, at 1440, 1024 and 768', async ({ page }) => {
  mkdirSync(OUT, { recursive: true });
  await login(page);
  await page.setViewportSize({ width: 1440, height: HEIGHT });
  await page.goto('/?view=table');
  await page.locator('main table tbody tr a').first().waitFor({ timeout: 60_000 });
  const id = ((await page.locator('main table tbody tr a').first().getAttribute('href')) ?? '').split('/').pop() ?? '';
  /* Every record in the collection, for §T.6's source: "the one in the collection whose construction clears §29's 6px at the smallest height". The table pages at fifty; the count line says how many there are. */
  const listed = await page.locator('main table tbody tr a').evaluateAll((all) => all.map((a) => ({ id: (a.getAttribute('href') ?? '').split('/').pop() ?? '', name: (a.closest('tr')?.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 60) })));
  const countLine = ((await page.locator('[data-collection-count]').textContent()) ?? '').trim();
  const records = [...new Map(listed.map((r) => [r.id, r])).values()].map((r) => ({ ...r, ...clearing(r.id) })).sort((a, b) => a.height - b.height);
  const screens = [
    { screen: 'table', path: '/?view=table' }, { screen: 'grid', path: '/?view=grid' }, { screen: 'want-list', path: '/want-list' }, { screen: 'lookup', path: '/lookup' },
    { screen: 'stats', path: '/stats' }, { screen: 'manage', path: '/manage' }, { screen: 'record-form-new', path: '/records/new' }, { screen: 'record-form-edit', path: `/records/${id}/edit` },
  ];
  const all: Array<{ screen: string; width: number; file: string; margined: Awaited<ReturnType<typeof measure>> } & Awaited<ReturnType<typeof measure>>> = [];
  for (const s of screens) for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: HEIGHT });
    await page.goto(s.path);
    await page.locator('h1').first().waitFor({ timeout: 60_000 });
    await page.waitForLoadState('load');
    await page.addStyleTag({ content: 'nextjs-portal{display:none!important}' });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(800);
    const m = await measure(page, 0);
    const margined = await measure(page, MARGIN);
    const file = `air-${s.screen}-${String(width).padStart(4, '0')}x${HEIGHT}.png`;
    /* The rectangle found is drawn onto the capture, so the reading can be checked against what it claims to be empty. */
    for (const found of [m.best, margined.best]) if (found !== null) await page.evaluate((r) => { const d = document.createElement('div'); d.setAttribute('data-air-mark', ''); d.style.cssText = `position:fixed;left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px;outline:1px dashed #000;outline-offset:-1px;z-index:99999;pointer-events:none`; document.body.appendChild(d); }, found);
    await page.screenshot({ path: join(OUT, file) });
    all.push({ screen: s.screen, width, file, ...m, margined });
  }
  writeFileSync(join(OUT, 'air.json'), `${JSON.stringify({ countLine, records, screens: all }, null, 1)}\n`);
  const source = records[0];
  const holds = (r: { width: number; height: number } | null) => r !== null && r.height >= source.height && r.width >= source.height * source.aspect;
  const cell = (r: { width: number; height: number } | null) => (r === null ? 'none' : `${r.width} × ${r.height}`);
  const md = ['# The air beside each heading', '', 'Read-only on the real collection, the first view at each width × 900. Generated by `e2e/sheet/air-103.sheet.ts`; the figures are in `air.json`, and each capture has the rectangle found dashed onto it.', '',
    'The air is the largest empty rectangle among the screen’s type, controls, images and rules that lies right of the heading’s type and begins no lower than its top. "Holds a square of" is the largest height a figure as wide as it is tall could take there.', '',
    '| screen | window | main’s measure | holds a square of | that rectangle | what lies under it | hairlines it crosses | the tallest empty rectangle | the widest |', '|---|---|---|---|---|---|---|---|---|',
    ...all.map((r) => `| ${r.screen} | ${r.width} | ${r.zone.width} | ${r.best === null ? 'none' : r.best.square} | ${cell(r.best)} at ${r.best === null ? '' : `${r.best.left}, ${r.best.top}`} | ${r.best?.under.replace(/\|/g, '/') ?? ''} | ${r.hairlinesCrossed.best} | ${cell(r.tallest)} | ${cell(r.widest)} |`), ''];
  md.push('## The collection’s constructions, and the one that clears lowest', '', `The table’s count reads "${countLine}", and ${records.length} records were read from it. Clearing height: where the construction’s narrowest side face is §29’s ${MIN_FACE_WIDTH}px. Ties and "the oldest" are not read here: no two below share a height.`, '',
    '| record | clears at | as wide, for its height |', '|---|---|---|', ...records.map((r) => `| ${r.name.replace(/\|/g, '/')} | ${r.height.toFixed(1)} | ${r.aspect.toFixed(2)} |`), '',
    `## Whether each screen’s air holds it`, '', `The source is the first above: it needs ${source.height.toFixed(1)} of height and ${(source.height * source.aspect).toFixed(1)} of width.`, '',
    '| screen | window | the air | holds the source’s figure | height to spare |', '|---|---|---|---|---|',
    ...all.map((r) => `| ${r.screen} | ${r.width} | ${cell(r.best)} | ${holds(r.best) ? 'yes' : 'NO'} | ${r.best === null ? '' : (r.best.height - source.height).toFixed(1)} |`), '');
  md.push(`## The air after §T.6’s ${MARGIN} margin`, '', `"The air is measured after a 24 margin on every side where it meets a control, type or the header." Type and controls are grown by ${MARGIN} and the header’s foot lowered by ${MARGIN} before the search; rules, images and the measure’s own edges are not, because the sentence does not name them. Each side says what the air found meets there. Both rectangles are dashed onto each capture.`, '',
    '| screen | window | the air before | after the margin | left | top | right | bottom | holds the source’s figure | height to spare |', '|---|---|---|---|---|---|---|---|---|---|',
    ...all.map((r) => { const b = r.margined.best; const sd = r.margined.sides; const c = (t: string | undefined) => (t ?? '').replace(/\|/g, '/'); return `| ${r.screen} | ${r.width} | ${cell(r.best)} | ${cell(b)} at ${b === null ? '' : `${b.left}, ${b.top}`} | ${c(sd?.left)} | ${c(sd?.top)} | ${c(sd?.right)} | ${c(sd?.bottom)} | ${holds(b) ? 'yes' : 'NO'} | ${b === null ? '' : (b.height - source.height).toFixed(1)} |`; }), '');
  writeFileSync(join(OUT, 'air.md'), `${md.join('\n')}\n`);
});

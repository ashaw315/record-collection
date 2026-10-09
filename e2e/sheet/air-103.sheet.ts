import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test, type Page } from '@playwright/test';
import { NO_SCROLL_HEIGHT } from '../../src/app/records/[id]/band-geometry';
import { construction } from '../../src/app/records/[id]/construction';
import { boundsOf } from '../../src/app/records/[id]/own-fit';
import { MIN_FACE_WIDTH } from '../../src/app/records/[id]/ornament';
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

/**
 * `margin` is §T.6's, as revised 9 Oct: "The air is measured after a 24 margin on every side where it meets a
 * control, type or the header". Type and controls are grown by it before the search and the header's foot is
 * lowered by it; rules, images and the measure's own edges are not, since the sentence does not name them.
 */
const measure = (page: Page, margin: number) =>
  page.evaluate((margin) => {
    const main = (document.querySelector('main') ?? document.querySelector('h1')?.closest('div[class*="max-w"]') ?? document.body) as HTMLElement;
    const m = main.getBoundingClientRect();
    const cs = getComputedStyle(main);
    const zone = { left: m.left + parseFloat(cs.paddingLeft), right: m.right - parseFloat(cs.paddingRight), top: m.top + parseFloat(cs.paddingTop), bottom: Math.min(m.bottom - parseFloat(cs.paddingBottom), window.innerHeight) };
    const h1 = (main.querySelector('h1') ?? document.querySelector('h1')) as HTMLElement;
    /* The heading's type, not its element's box, which runs the measure's whole width. */
    const heading = (() => { const range = document.createRange(); range.selectNodeContents(h1); return range.getBoundingClientRect(); })();
    const shown = (el: Element) => el.closest('[data-app-nav], nextjs-portal, script, style') === null && el.getClientRects().length > 0 && el.checkVisibility({ contentVisibilityAuto: true, visibilityProperty: true });
    type Kind = 'type' | 'control' | 'image' | 'fill' | 'rule';
    type Box = { left: number; right: number; top: number; bottom: number; what: string; kind: Kind };
    const boxes: Box[] = [];
    const grow = (kind: Kind) => (kind === 'type' || kind === 'control' ? margin : 0);
    const add = (r: DOMRect, what: string, kind: Kind) => { if (r.width < 1 || r.height < 1) return; const g = grow(kind); const b = { left: Math.max(r.left - g, zone.left), right: Math.min(r.right + g, zone.right), top: Math.max(r.top - g, zone.top), bottom: Math.min(r.bottom + g, zone.bottom), what, kind }; if (b.right > b.left && b.bottom > b.top) boxes.push(b); };
    for (const el of Array.from(main.querySelectorAll('*')).filter(shown)) {
      const tag = el.tagName.toLowerCase();
      if (['input', 'select', 'textarea', 'button', 'img', 'svg', 'canvas', 'summary'].includes(tag)) { add(el.getBoundingClientRect(), tag, ['img', 'svg', 'canvas'].includes(tag) ? 'image' : 'control'); continue; }
      /* Type: the text's own boxes, not its element's, which for a block is the whole line whatever the words reach. */
      for (const node of Array.from(el.childNodes)) {
        if (node.nodeType !== Node.TEXT_NODE || (node.textContent ?? '').trim() === '') continue;
        const range = document.createRange(); range.selectNodeContents(node);
        for (const r of Array.from(range.getClientRects())) add(r, `${tag} "${(node.textContent ?? '').trim().slice(0, 18)}"`, 'type');
      }
      const s = getComputedStyle(el);
      if (s.backgroundColor !== 'rgba(0, 0, 0, 0)' && el !== main && s.backgroundColor !== getComputedStyle(document.body).backgroundColor) add(el.getBoundingClientRect(), `${tag} fill`, 'fill');
      /* A drawn rule is a box one rule thick: content begins at it, and a figure does not cross it. */
      const r = el.getBoundingClientRect();
      const rule = (side: 'Top' | 'Bottom' | 'Left' | 'Right') => parseFloat(s[`border${side}Width`]) > 0 && s[`border${side}Style`] !== 'none' && s[`border${side}Color`] !== 'rgba(0, 0, 0, 0)';
      if (rule('Top')) add(new DOMRect(r.left, r.top, r.width, Math.max(1, parseFloat(s.borderTopWidth))), `${tag} rule`, 'rule');
      if (rule('Bottom')) add(new DOMRect(r.left, r.bottom - Math.max(1, parseFloat(s.borderBottomWidth)), r.width, Math.max(1, parseFloat(s.borderBottomWidth))), `${tag} rule`, 'rule');
      if (rule('Left')) add(new DOMRect(r.left, r.top, Math.max(1, parseFloat(s.borderLeftWidth)), r.height), `${tag} rule`, 'rule');
      if (rule('Right')) add(new DOMRect(r.right - Math.max(1, parseFloat(s.borderRightWidth)), r.top, Math.max(1, parseFloat(s.borderRightWidth)), r.height), `${tag} rule`, 'rule');
    }
    /* The largest empty rectangle that begins no lower than the heading's foot. */
    const uniq = (v: number[]) => [...new Set(v.map((x) => Math.round(x)))].sort((a, b) => a - b);
    const xs = uniq([zone.left, zone.right, ...boxes.flatMap((b) => [b.left, b.right])]);
    /* The header's foot, where the air would meet it: the region's top when the screen pads none of its own. */
    const nav = document.querySelector('[data-app-nav]');
    const headerFoot = nav === null ? -Infinity : (nav.closest('header') ?? nav).getBoundingClientRect().bottom;
    const ceiling = Math.max(zone.top, headerFoot + margin);
    const tops = uniq([ceiling, ...boxes.map((b) => b.bottom)]).filter((y) => y >= Math.round(ceiling) && y <= Math.round(heading.top) + margin);
    type Rect = { left: number; top: number; width: number; height: number; square: number; under: string; underKind: string };
    let best: Rect | null = null; let tallest: Rect | null = null; let widest: Rect | null = null;
    for (const top of tops) for (let i = 0; i < xs.length; i += 1) for (let j = i + 1; j < xs.length; j += 1) {
      const left = xs[i]; const right = xs[j];
      if (right - left < 24 || left < Math.round(heading.right)) continue;
      let bottom = zone.bottom; let under = 'the end of the first view'; let underKind = 'edge'; let blocked = false;
      for (const b of boxes) {
        if (b.right <= left + 0.5 || b.left >= right - 0.5) continue;
        if (b.bottom <= top + 0.5) continue;
        if (b.top <= top + 0.5) { blocked = true; break; }
        if (b.top < bottom) { bottom = b.top; under = b.what; underKind = b.kind; }
      }
      if (blocked) continue;
      const r: Rect = { left, top, width: right - left, height: Math.round(bottom - top), square: Math.min(right - left, Math.round(bottom - top)), under, underKind };
      if (r.height < 24) continue;
      if (best === null || r.square > best.square || (r.square === best.square && r.width * r.height > best.width * best.height)) best = r;
      if (tallest === null || r.height > tallest.height || (r.height === tallest.height && r.width > tallest.width)) tallest = r;
      if (widest === null || r.width > widest.width || (r.width === widest.width && r.height > widest.height)) widest = r;
    }
    const lines = Array.from(main.querySelectorAll('*')).filter(shown).filter((el) => { const s = getComputedStyle(el); return el.tagName === 'HR' || parseFloat(s.borderTopWidth) > 0 || parseFloat(s.borderBottomWidth) > 0; }).map((el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return [parseFloat(s.borderTopWidth) > 0 || el.tagName === 'HR' ? r.top : null, parseFloat(s.borderBottomWidth) > 0 ? r.bottom : null].filter((y): y is number => y !== null).map((y) => ({ y, left: r.left, right: r.right })); }).flat();
    const crossed = (r: Rect | null) => (r === null ? 0 : lines.filter((l) => l.y > r.top + 1 && l.y < r.top + r.height - 1 && l.right > r.left + 1 && l.left < r.left + r.width - 1).length);
    /* What each side of the air found meets: the nearest thing within a pixel of that edge, or the edge of the measure. */
    const sides = (r: Rect | null) => {
      if (r === null) return null;
      const R = { left: r.left, right: r.left + r.width, top: r.top, bottom: r.top + r.height };
      const spanY = (b: Box) => b.bottom > R.top + 1 && b.top < R.bottom - 1;
      const spanX = (b: Box) => b.right > R.left + 1 && b.left < R.right - 1;
      const say = (b: Box | undefined, otherwise: string) => (b === undefined ? otherwise : `${b.what} (${b.kind})`);
      return {
        left: say(boxes.find((b) => spanY(b) && Math.abs(b.right - R.left) <= 1), 'the measure’s edge'),
        right: say(boxes.find((b) => spanY(b) && Math.abs(b.left - R.right) <= 1), 'the measure’s edge'),
        top: say(boxes.find((b) => spanX(b) && Math.abs(b.bottom - R.top) <= 1), Math.abs(R.top - (headerFoot + margin)) <= 1 ? 'the header' : 'the region’s own top'),
        bottom: say(boxes.find((b) => spanX(b) && Math.abs(b.top - R.bottom) <= 1), 'the end of the first view'),
      };
    };
    return { sides: sides(best), headerFoot: Math.round(headerFoot), zone: { left: Math.round(zone.left), right: Math.round(zone.right), top: Math.round(zone.top), width: Math.round(zone.right - zone.left) }, heading: { text: (h1.textContent ?? '').trim(), left: Math.round(heading.left), top: Math.round(heading.top), bottom: Math.round(heading.bottom), textRight: Math.round(heading.right) }, boxes: boxes.length, best, tallest, widest, hairlinesCrossed: { best: crossed(best), tallest: crossed(tallest), widest: crossed(widest) } };
  }, margin);

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

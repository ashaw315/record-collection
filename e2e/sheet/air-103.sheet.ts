import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test, type Page } from '@playwright/test';
import { NO_SCROLL_HEIGHT } from '../../src/app/records/[id]/band-geometry';
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

const measure = (page: Page) =>
  page.evaluate(() => {
    const main = (document.querySelector('main') ?? document.querySelector('h1')?.closest('div[class*="max-w"]') ?? document.body) as HTMLElement;
    const m = main.getBoundingClientRect();
    const cs = getComputedStyle(main);
    const zone = { left: m.left + parseFloat(cs.paddingLeft), right: m.right - parseFloat(cs.paddingRight), top: m.top + parseFloat(cs.paddingTop), bottom: Math.min(m.bottom - parseFloat(cs.paddingBottom), window.innerHeight) };
    const h1 = (main.querySelector('h1') ?? document.querySelector('h1')) as HTMLElement;
    /* The heading's type, not its element's box, which runs the measure's whole width. */
    const heading = (() => { const range = document.createRange(); range.selectNodeContents(h1); return range.getBoundingClientRect(); })();
    const shown = (el: Element) => el.closest('[data-app-nav], nextjs-portal, script, style') === null && el.getClientRects().length > 0 && el.checkVisibility({ contentVisibilityAuto: true, visibilityProperty: true });
    type Box = { left: number; right: number; top: number; bottom: number; what: string };
    const boxes: Box[] = [];
    const add = (r: DOMRect, what: string) => { if (r.width < 1 || r.height < 1) return; const b = { left: Math.max(r.left, zone.left), right: Math.min(r.right, zone.right), top: Math.max(r.top, zone.top), bottom: Math.min(r.bottom, zone.bottom), what }; if (b.right > b.left && b.bottom > b.top) boxes.push(b); };
    for (const el of Array.from(main.querySelectorAll('*')).filter(shown)) {
      const tag = el.tagName.toLowerCase();
      if (['input', 'select', 'textarea', 'button', 'img', 'svg', 'canvas', 'summary'].includes(tag)) { add(el.getBoundingClientRect(), tag); continue; }
      /* Type: the text's own boxes, not its element's, which for a block is the whole line whatever the words reach. */
      for (const node of Array.from(el.childNodes)) {
        if (node.nodeType !== Node.TEXT_NODE || (node.textContent ?? '').trim() === '') continue;
        const range = document.createRange(); range.selectNodeContents(node);
        for (const r of Array.from(range.getClientRects())) add(r, `${tag} "${(node.textContent ?? '').trim().slice(0, 18)}"`);
      }
      const s = getComputedStyle(el);
      if (s.backgroundColor !== 'rgba(0, 0, 0, 0)' && el !== main && s.backgroundColor !== getComputedStyle(document.body).backgroundColor) add(el.getBoundingClientRect(), `${tag} fill`);
      /* A drawn rule is a box one rule thick: content begins at it, and a figure does not cross it. */
      const r = el.getBoundingClientRect();
      const rule = (side: 'Top' | 'Bottom' | 'Left' | 'Right') => parseFloat(s[`border${side}Width`]) > 0 && s[`border${side}Style`] !== 'none' && s[`border${side}Color`] !== 'rgba(0, 0, 0, 0)';
      if (rule('Top')) add(new DOMRect(r.left, r.top, r.width, Math.max(1, parseFloat(s.borderTopWidth))), `${tag} rule`);
      if (rule('Bottom')) add(new DOMRect(r.left, r.bottom - Math.max(1, parseFloat(s.borderBottomWidth)), r.width, Math.max(1, parseFloat(s.borderBottomWidth))), `${tag} rule`);
      if (rule('Left')) add(new DOMRect(r.left, r.top, Math.max(1, parseFloat(s.borderLeftWidth)), r.height), `${tag} rule`);
      if (rule('Right')) add(new DOMRect(r.right - Math.max(1, parseFloat(s.borderRightWidth)), r.top, Math.max(1, parseFloat(s.borderRightWidth)), r.height), `${tag} rule`);
    }
    /* The largest empty rectangle that begins no lower than the heading's foot. */
    const uniq = (v: number[]) => [...new Set(v.map((x) => Math.round(x)))].sort((a, b) => a - b);
    const xs = uniq([zone.left, zone.right, ...boxes.flatMap((b) => [b.left, b.right])]);
    const tops = uniq([zone.top, ...boxes.map((b) => b.bottom)]).filter((y) => y <= Math.round(heading.top));
    type Rect = { left: number; top: number; width: number; height: number; square: number; under: string };
    let best: Rect | null = null; let tallest: Rect | null = null; let widest: Rect | null = null;
    for (const top of tops) for (let i = 0; i < xs.length; i += 1) for (let j = i + 1; j < xs.length; j += 1) {
      const left = xs[i]; const right = xs[j];
      if (right - left < 24 || left < Math.round(heading.right)) continue;
      let bottom = zone.bottom; let under = 'the end of the first view'; let blocked = false;
      for (const b of boxes) {
        if (b.right <= left + 0.5 || b.left >= right - 0.5) continue;
        if (b.bottom <= top + 0.5) continue;
        if (b.top <= top + 0.5) { blocked = true; break; }
        if (b.top < bottom) { bottom = b.top; under = b.what; }
      }
      if (blocked) continue;
      const r: Rect = { left, top, width: right - left, height: Math.round(bottom - top), square: Math.min(right - left, Math.round(bottom - top)), under };
      if (r.height < 24) continue;
      if (best === null || r.square > best.square || (r.square === best.square && r.width * r.height > best.width * best.height)) best = r;
      if (tallest === null || r.height > tallest.height || (r.height === tallest.height && r.width > tallest.width)) tallest = r;
      if (widest === null || r.width > widest.width || (r.width === widest.width && r.height > widest.height)) widest = r;
    }
    const lines = Array.from(main.querySelectorAll('*')).filter(shown).filter((el) => { const s = getComputedStyle(el); return el.tagName === 'HR' || parseFloat(s.borderTopWidth) > 0 || parseFloat(s.borderBottomWidth) > 0; }).map((el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return [parseFloat(s.borderTopWidth) > 0 || el.tagName === 'HR' ? r.top : null, parseFloat(s.borderBottomWidth) > 0 ? r.bottom : null].filter((y): y is number => y !== null).map((y) => ({ y, left: r.left, right: r.right })); }).flat();
    const crossed = (r: Rect | null) => (r === null ? 0 : lines.filter((l) => l.y > r.top + 1 && l.y < r.top + r.height - 1 && l.right > r.left + 1 && l.left < r.left + r.width - 1).length);
    return { zone: { left: Math.round(zone.left), right: Math.round(zone.right), top: Math.round(zone.top), width: Math.round(zone.right - zone.left) }, heading: { text: (h1.textContent ?? '').trim(), left: Math.round(heading.left), top: Math.round(heading.top), bottom: Math.round(heading.bottom), textRight: Math.round(heading.right) }, boxes: boxes.length, best, tallest, widest, hairlinesCrossed: { best: crossed(best), tallest: crossed(tallest), widest: crossed(widest) } };
  });

test('the air beside each screen’s heading, at 1440, 1024 and 768', async ({ page }) => {
  mkdirSync(OUT, { recursive: true });
  await login(page);
  await page.setViewportSize({ width: 1440, height: HEIGHT });
  await page.goto('/?view=table');
  await page.locator('main table tbody tr a').first().waitFor({ timeout: 60_000 });
  const id = ((await page.locator('main table tbody tr a').first().getAttribute('href')) ?? '').split('/').pop() ?? '';
  const screens = [
    { screen: 'table', path: '/?view=table' }, { screen: 'grid', path: '/?view=grid' }, { screen: 'want-list', path: '/want-list' }, { screen: 'lookup', path: '/lookup' },
    { screen: 'stats', path: '/stats' }, { screen: 'manage', path: '/manage' }, { screen: 'record-form-new', path: '/records/new' }, { screen: 'record-form-edit', path: `/records/${id}/edit` },
  ];
  const all: Array<{ screen: string; width: number; file: string } & Awaited<ReturnType<typeof measure>>> = [];
  for (const s of screens) for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: HEIGHT });
    await page.goto(s.path);
    await page.locator('h1').first().waitFor({ timeout: 60_000 });
    await page.waitForLoadState('load');
    await page.addStyleTag({ content: 'nextjs-portal{display:none!important}' });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(800);
    const m = await measure(page);
    const file = `air-${s.screen}-${String(width).padStart(4, '0')}x${HEIGHT}.png`;
    /* The rectangle found is drawn onto the capture, so the reading can be checked against what it claims to be empty. */
    if (m.best !== null) await page.evaluate((r) => { const d = document.createElement('div'); d.setAttribute('data-air-mark', ''); d.style.cssText = `position:fixed;left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px;outline:1px dashed #000;outline-offset:-1px;z-index:99999;pointer-events:none`; document.body.appendChild(d); }, m.best);
    await page.screenshot({ path: join(OUT, file) });
    all.push({ screen: s.screen, width, file, ...m });
  }
  writeFileSync(join(OUT, 'air.json'), `${JSON.stringify(all, null, 1)}\n`);
  const cell = (r: { width: number; height: number } | null) => (r === null ? 'none' : `${r.width} × ${r.height}`);
  const md = ['# The air beside each heading', '', 'Read-only on the real collection, the first view at each width × 900. Generated by `e2e/sheet/air-103.sheet.ts`; the figures are in `air.json`, and each capture has the rectangle found dashed onto it.', '',
    'The air is the largest empty rectangle among the screen’s type, controls, images and rules that lies right of the heading’s type and begins no lower than its top. "Holds a square of" is the largest height a figure as wide as it is tall could take there.', '',
    '| screen | window | main’s measure | holds a square of | that rectangle | what lies under it | hairlines it crosses | the tallest empty rectangle | the widest |', '|---|---|---|---|---|---|---|---|---|',
    ...all.map((r) => `| ${r.screen} | ${r.width} | ${r.zone.width} | ${r.best === null ? 'none' : r.best.square} | ${cell(r.best)} at ${r.best === null ? '' : `${r.best.left}, ${r.best.top}`} | ${r.best?.under.replace(/\|/g, '/') ?? ''} | ${r.hairlinesCrossed.best} | ${cell(r.tallest)} | ${cell(r.widest)} |`), ''];
  writeFileSync(join(OUT, 'air.md'), `${md.join('\n')}\n`);
});

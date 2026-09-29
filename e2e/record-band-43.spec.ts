import { expect, test, type Page } from '@playwright/test';
import { GRID_FORK, NO_SCROLL_HEIGHT } from '../src/app/records/[id]/band-geometry';
import { fillRows, packRecordBand } from '../src/app/records/[id]/record-band-41';
import { isSettled } from './paint-settle';
import { readSeventeen } from './seventeen';

const PASSWORD = process.env.E2E_PASSWORD ?? 'test-password-for-e2e';
async function login(page: Page) {
  await page.goto('/login');
  await page.locator('form[data-hydrated="true"]').waitFor({ timeout: 15_000 });
  await page.getByLabel('Password').pressSequentially(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL('/');
}
/** Recorded from before the page's first script: every animation frame's band height and cell boxes, until the test reads them. */
const RECORDER = `window.__paint = { frames: [] };
(function () { var rec = window.__paint; function tick() { var band = document.querySelector('[data-band="record"]'); if (band) { var b = band.getBoundingClientRect(); rec.frames.push({ t: performance.now(), band: Math.round(b.height * 10) / 10, cells: Array.from(band.querySelectorAll(':scope > [data-cell]')).map(function (c) { var r = c.getBoundingClientRect(); return [c.getAttribute('data-cell'), Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)]; }) }); } if (rec.frames.length < 400) requestAnimationFrame(tick); } requestAnimationFrame(tick); })();`;

/**
 * §43 (step 51): "the band's first-painted height equals its settled height
 * on every record, at every width from 960 to 1439, and no element below it
 * moves after first paint... no cell's rendered box changes after first
 * paint on either axis." Cold loads: a new context per load, so nothing is
 * cached, which is the worst case measured at 485ms under step 47.
 *
 * The seventeen are the run-level fixture global setup seeds (`seventeen.ts`);
 * this spec seeded them itself until 28 Sep, when another spec's cleanup was
 * found deleting them mid-loop and every "never painted" finding was a 404.
 *
 * **Settled, not timed.** A load is read once the last SETTLE_SPAN frames are
 * identical with the fonts loaded (`paint-settle.ts`), bounded at
 * SETTLE_TIMEOUT_MS; the fixed two seconds it replaces was four of the test's
 * six minutes against layouts the recorder shows settled inside half a second.
 * A load that never settles is a finding, not a timeout.
 */
const SETTLE_SPAN = 20;
const SETTLE_TIMEOUT_MS = 5_000;
const SETTLE_SOURCE = isSettled.toString();

test('§43: the record band paints packed: its first-painted height is its settled height and no cell’s box changes, on every record, cold', async ({ browser, page }) => {
  test.setTimeout(900_000);
  await login(page);
  const rows = readSeventeen();
  const cookies = await page.context().cookies();
  const widths = [960, 1000, 1092, 1200, 1240, 1300, 1439];
  const bad: string[] = []; let worst = { change: 0, where: 'none' }; let loads = 0; let slowest = { ms: 0, where: 'none' };
  for (const r of rows) for (const width of widths) {
    const ctx = await browser.newContext({ viewport: { width, height: NO_SCROLL_HEIGHT } });
    await ctx.addCookies(cookies);
    await ctx.addInitScript(RECORDER);
    const p = await ctx.newPage();
    await p.goto(`/records/${r.id}`, { waitUntil: 'load' });
    const settled = await p
      .waitForFunction(
        ([src, span]) => document.fonts.status === 'loaded' && (new Function('return ' + src)() as (f: unknown, n: number) => boolean)((window as unknown as { __paint: { frames: unknown[] } }).__paint.frames, span),
        [SETTLE_SOURCE, SETTLE_SPAN] as const,
        { timeout: SETTLE_TIMEOUT_MS, polling: 'raf' },
      )
      .then(() => true, () => false);
    const m = await p.evaluate(`(() => { const f = window.__paint.frames; if (f.length < 2) return null; const first = f[0]; const last = f[f.length - 1]; const changes = []; for (const c of first.cells) { const l = last.cells.find((x) => x[0] === c[0]); if (!l) { changes.push(c[0] + ' vanished'); continue; } const d = Math.max(Math.abs(l[1] - c[1]), Math.abs(l[2] - c[2]), Math.abs(l[3] - c[3]), Math.abs(l[4] - c[4])); if (d > 1) changes.push(c[0] + ' moved ' + d + 'px (' + c.slice(1).join(',') + ' -> ' + l.slice(1).join(',') + ')'); } return { frames: f.length, firstBand: first.band, lastBand: last.band, firstAt: Math.round(first.t), lastAt: Math.round(last.t), changes, maxChange: changes.length ? Math.max(...changes.map((s) => Number((/moved (\\d+)px/.exec(s) || [0, 0])[1]))) : 0 }; })()`) as { frames: number; firstBand: number; lastBand: number; firstAt: number; lastAt: number; changes: string[]; maxChange: number } | null;
    await ctx.close();
    loads += 1;
    if (m === null) { bad.push(`${r.title} @${width}: the band never painted in ${SETTLE_TIMEOUT_MS}ms`); continue; }
    if (!settled) { bad.push(`${r.title} @${width}: the band never settled in ${SETTLE_TIMEOUT_MS}ms (${m.frames} frames, band ${m.firstBand} -> ${m.lastBand})`); continue; }
    if (m.lastAt > slowest.ms) slowest = { ms: m.lastAt, where: `${r.title} @${width}` };
    if (Math.abs(m.firstBand - m.lastBand) > 1) bad.push(`${r.title} @${width}: band painted at ${m.firstBand} and settled at ${m.lastBand}`);
    for (const c of m.changes) bad.push(`${r.title} @${width}: ${c}`);
    if (m.maxChange > worst.change) worst = { change: m.maxChange, where: `${r.title} @${width}` };
  }
  console.log(`  §43 COLD LOADS: ${loads}; worst cell box change ${worst.change}px (${worst.where}); slowest settle ${slowest.ms}ms after navigation (${slowest.where}); ${bad.length} findings`);
  expect(loads).toBeGreaterThan(100);
  expect(bad, `first paint is not the settled layout:\n  ${bad.slice(0, 20).join('\n  ')}${bad.length > 20 ? `\n  … ${bad.length} in all` : ''}`).toEqual([]);
});

/**
 * §43's residual, reported each run: where the server's quarters differ
 * from what the page's own measured content would give. "If a box still
 * changes after that, Code reports the worst change and this section rules
 * on it." A difference here is not a box change -- the server's sheet IS
 * the layout -- but a cell packed to a quarter its content did not need, or
 * one short, which is what the estimate can get wrong.
 */
test('§43: reports where the server’s quarters differ from the page’s measured content, on every record at four widths', async ({ page }) => {
  test.setTimeout(600_000);
  await login(page);
  const rows = readSeventeen();
  const misses: string[] = []; let placements = 0;
  for (const r of rows) for (const w of [960, 1000, 1200, GRID_FORK - 1]) {
    await page.setViewportSize({ width: w, height: NO_SCROLL_HEIGHT });
    await page.goto(`/records/${r.id}`);
    await page.locator('[data-band="record"] [data-cell="note"]').waitFor({ timeout: 20_000 });
    await page.waitForTimeout(300);
    const m: Array<{ cell: string; packed: number; ink: number; label: number; pad: number; quarter: number }> = await page.evaluate(`(() => { const band = document.querySelector('[data-band="record"]'); const q = band.getBoundingClientRect().width / 4; const lines = (root) => { const byTop = new Map(); const walk = (n) => { if (n.nodeType === 3 && n.textContent.trim()) { const r = document.createRange(); r.selectNodeContents(n); for (const x of r.getClientRects()) { if (!x.width) continue; const k = Math.round(x.top); byTop.set(k, (byTop.get(k) || 0) + x.width); } } else if (n.nodeType === 1) { const s = getComputedStyle(n); if (s.display === 'none') return; if (n !== root && n.matches('[data-mark], [data-ornament], [data-plane]')) return; if (n.matches('img, svg')) { const x = n.getBoundingClientRect(); byTop.set(Math.round(x.top), (byTop.get(Math.round(x.top)) || 0) + x.width); return; } for (const c of n.childNodes) walk(c); } }; walk(root); return Math.max(0, ...byTop.values()); }; return Array.from(band.querySelectorAll(':scope > [data-cell]')).map((c) => { const cs = getComputedStyle(c); const label = Math.max(0, ...Array.from(c.querySelectorAll('*')).filter((el) => { const s = getComputedStyle(el); return s.textTransform === 'uppercase' && /mono/i.test(s.fontFamily) && el.children.length === 0 && el.textContent.trim() !== ''; }).map((el) => { const r = document.createRange(); r.selectNodeContents(el); return r.getBoundingClientRect().width; })); return { cell: c.dataset.cell, packed: Number(cs.getPropertyValue('--packed')) || 4, ink: lines(c), label, pad: parseFloat(cs.paddingLeft), quarter: q }; }); })()`);
    const measured = fillRows(packRecordBand({ quarter: m[0].quarter, padding: m[0].pad, cells: m.map((c) => ({ ink: c.ink, label: c.label })) }));
    m.forEach((c, k) => { placements += 1; if (c.packed !== measured[k]) misses.push(`${r.title.split(':')[0]} ${c.cell} @${w}: server ${c.packed}, measured content gives ${measured[k]} (ink ${Math.round(c.ink)} in quarters of ${Math.round(c.quarter)})`); });
  }
  console.log(`  §43 RESIDUAL: ${placements} placements, ${placements - misses.length} agree, ${misses.length} differ${misses.length ? '\n    ' + misses.join('\n    ') : ''}`);
  expect(placements, 'the report has subjects').toBeGreaterThan(100);
});

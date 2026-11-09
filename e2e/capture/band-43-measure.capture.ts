import { mkdirSync, writeFileSync } from 'node:fs';
import { loadavg } from 'node:os';
import { join } from 'node:path';
import { test } from '@playwright/test';
import { NO_SCROLL_HEIGHT } from '../../src/app/records/[id]/band-geometry';
import { isSettled } from '../paint-settle';
import { readSeventeen } from '../seventeen';
import { login } from '../sign-in';

/**
 * **Step 171's measurement (Design's §43 step; the coordinator, 8 Nov: "a
 * measurement, not a build").** Not a test: it asserts nothing and leaves
 * `record-band-43.spec.ts` as it stands. Over the records and widths that spec
 * covers, cold, it keeps every frame's band height to three decimals and, per
 * frame, what the page had applied when it painted: the stylesheets whose
 * sheet is attached, `document.fonts.status`, the band's computed display and
 * row template. The spec's recorder rounds to 0.1 and keeps none of that, so
 * on 007a4551's gate it could say the band painted at 73 and settled at 233.9
 * and not which of the two §43 names, stylesheets or web fonts, the first
 * frame lacked.
 *
 *     CAPTURE=1 E2E_SERVER=build npx playwright test --project=capture band-43-measure
 *
 * Writes docs/measurements/band-43/<stamp>.jsonl, a line per load.
 *
 * Two options for the streaming question (8 Nov): `BAND43_ONLY="The Soft Parade@1000"` limits the loads to one
 * record and width, and `BAND43_KBPS=64` throttles the document's download through the DevTools protocol so the
 * parser has to yield inside the page. Each frame's cell names are kept, so a frame holding only some of the band's
 * cells shows as such, and `cellSets` keeps every frame at which the set of cells differs from the frame before, so
 * a cell that appears between frames is recorded as an appearance, not inferred from cells that moved.
 *
 * Where it ran, beside what it found (the coordinator, 8 Nov): in CI it is one test among the suite's, and where it
 * lands decides the load it sees. Playwright gives no control of a test's slot across projects, so each load records
 * its wall-clock time, the machine's one-minute load and the worker, for reading against the suite's start and end;
 * and `BAND43_FOR_MIN` keeps passing until that many minutes have run, so one run can span quiet and loaded slots
 * rather than landing in one. The instrument is then part of the load it observes: one worker of the run's four.
 */
test.use({ launchOptions: { args: ['--font-render-hinting=none'] } });

const RECORDER = `window.__m = { frames: [] };
(function () { var rec = window.__m; function tick() { var band = document.querySelector('[data-band="record"]'); if (band) { var b = band.getBoundingClientRect(); var cs = getComputedStyle(band); var links = Array.from(document.querySelectorAll('link[rel="stylesheet"]')); rec.frames.push({ t: Math.round(performance.now() * 1000) / 1000, band: Math.round(b.height * 1000) / 1000, display: cs.display, rows: cs.gridTemplateRows, links: links.length, attached: links.filter(function (l) { return l.sheet !== null; }).length, sheets: document.styleSheets.length, fonts: document.fonts.status, ready: document.readyState, cells: Array.from(band.querySelectorAll(':scope > [data-cell]')).map(function (c) { var r = c.getBoundingClientRect(); return [c.getAttribute('data-cell'), Math.round(r.left * 1000) / 1000, Math.round(r.top * 1000) / 1000, Math.round(r.width * 1000) / 1000, Math.round(r.height * 1000) / 1000]; }) }); } if (rec.frames.length < 400) requestAnimationFrame(tick); } requestAnimationFrame(tick); })();`;

const WIDTHS = [960, 1000, 1092, 1200, 1240, 1300, 1439];
const SETTLE_SPAN = 20;

test('step 171: the band’s first-painted and settled heights, to three decimals, on the records and widths record-band-43 covers', async ({ browser, page }) => {
  test.skip(process.env.CAPTURE !== '1', 'A measurement tool: run with CAPTURE=1');
  test.setTimeout(1_800_000);
  await login(page);
  const cookies = await page.context().cookies();
  const passes = Number(process.env.BAND43_PASSES ?? '1');
  const dir = 'docs/measurements/band-43';
  mkdirSync(dir, { recursive: true });
  const out = join(dir, `${new Date().toISOString().replace(/[:.]/g, '-')}.jsonl`);
  const lines: string[] = [];
  const only = process.env.BAND43_ONLY;
  const kbps = Number(process.env.BAND43_KBPS ?? '0');
  const forMs = Number(process.env.BAND43_FOR_MIN ?? '0') * 60_000;
  const began = Date.now();
  const more = (pass: number) => (forMs > 0 ? Date.now() - began < forMs : pass <= passes);
  for (let pass = 1; more(pass); pass += 1) for (const r of readSeventeen()) for (const width of WIDTHS) {
    if (only !== undefined && only !== `${r.title}@${width}`) continue;
    const ctx = await browser.newContext({ viewport: { width, height: NO_SCROLL_HEIGHT } });
    await ctx.addCookies(cookies);
    await ctx.addInitScript(RECORDER);
    const p = await ctx.newPage();
    if (kbps > 0) await (await ctx.newCDPSession(p)).send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: (kbps * 1024) / 8, uploadThroughput: -1 });
    await p.goto(`/records/${r.id}`, { waitUntil: 'load' });
    /* BAND43_STAGE=1: the instrument's known answer, a cell detached for two frames and put back, which cellSets must show as a disappearance and an appearance. */
    if (process.env.BAND43_STAGE === '1') await p.evaluate(() => new Promise<void>((done) => { const band = document.querySelector('[data-band="record"]'); const cell = band?.querySelector(':scope > [data-cell="note"]'); if (!band || !cell) { done(); return; } const next = cell.nextSibling; cell.remove(); requestAnimationFrame(() => requestAnimationFrame(() => { band.insertBefore(cell, next); done(); })); }));
    /* The spec's settle rule, on the spec's rounding, so "settled" means here what it means there. */
    await p
      .waitForFunction(
        ([src, span]) => {
          const f = (window as unknown as { __m: { frames: Array<{ band: number; cells: Array<[string, number, number, number, number]> }> } }).__m.frames;
          const rounded = f.map((x) => ({ band: Math.round(x.band * 10) / 10, cells: x.cells.map((c) => [c[0], Math.round(c[1]), Math.round(c[2]), Math.round(c[3]), Math.round(c[4])]) }));
          return document.fonts.status === 'loaded' && (new Function('return ' + src)() as (a: unknown, n: number) => boolean)(rounded, span);
        },
        [isSettled.toString(), SETTLE_SPAN] as const,
        { timeout: 5_000, polling: 'raf' },
      )
      .catch(() => undefined);
    const frames = (await p.evaluate('window.__m.frames')) as Array<{ t: number; band: number; display: string; rows: string; links: number; attached: number; sheets: number; fonts: string; ready: string; cells: unknown[] }>;
    await ctx.close();
    const first = frames[0];
    const last = frames[frames.length - 1];
    const line = { pass, at: new Date().toISOString(), load1: Math.round(loadavg()[0] * 100) / 100, worker: test.info().workerIndex, record: r.title, width, frames: frames.length, first: first ?? null, settled: last ?? null, firstBand: first?.band ?? null, settledBand: last?.band ?? null, diff: first && last ? Math.round((last.band - first.band) * 1000) / 1000 : null, kbps, cellSets: frames.filter((f, i) => i === 0 || (f.cells as Array<[string]>).map((c) => c[0]).join(',') !== (frames[i - 1].cells as Array<[string]>).map((c) => c[0]).join(',')).map((f) => ({ t: f.t, band: f.band, ready: f.ready, cells: (f.cells as Array<[string]>).map((c) => c[0]) })), changes: frames.filter((f, i) => i > 0 && f.band !== frames[i - 1].band).map((f) => ({ t: f.t, band: f.band, attached: f.attached, fonts: f.fonts, ready: f.ready, rows: f.rows, cells: (f.cells as Array<[string]>).map((c) => c[0]) })) };
    lines.push(JSON.stringify(line));
    console.log(`${pass} ${r.title.slice(0, 28).padEnd(28)} @${width}: first ${first?.band.toFixed(3)} settled ${last?.band.toFixed(3)} diff ${line.diff?.toFixed(3)} | first frame t=${first?.t} sheets ${first?.attached}/${first?.links} fonts ${first?.fonts} display ${first?.display} ready ${first?.ready} cells ${(first?.cells as Array<[string]> | undefined)?.map((c) => c[0]).join(',')} -> ${(last?.cells as Array<[string]> | undefined)?.map((c) => c[0]).join(',')}`);
  }
  writeFileSync(out, `${lines.join('\n')}\n`);
  console.log(`wrote ${out}`);
});

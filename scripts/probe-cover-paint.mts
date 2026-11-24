/**
 * **Adam's "blank cover tops" on the phone (Thursday, 20 Nov), probed for Design (23 Nov).** His press runs measured the
 * covers painting 30ms after the ask's reply, on this machine's own link. The one condition that run could not see is a
 * phone's network. This draws an answer the way the grid's band draws it at 390 (five §T.5 cells of 160, `loading="lazy"`
 * as GridCover has it, the real covers from production's public blob store, which needs no session), inserted at once as
 * the reply inserts them, and times each cover to its first paint and to complete under no throttle, Chrome's fast 3G
 * and slow 3G, a cold cache each time, with a screenshot at 0.5, 1, 2, 4 and 8 seconds.
 *
 *     node --env-file=.env.local --import tsx scripts/probe-cover-paint.mts
 *
 * Read-only: it reads five cover URLs from the database and fetches them as any visitor would. In-page code is strings,
 * never functions (tsx's injected __name, 23 Nov). Writes docs/measurements/cover-paint/ and its screenshots.
 */
import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from '@playwright/test';
import { sql } from 'drizzle-orm';
import { getDb } from '@/db/client';

/* Chrome DevTools' presets, as Playwright's own throttling examples give them: bytes per second and milliseconds. */
const PROFILES = [
  { name: 'none', latency: 0, down: -1, up: -1 },
  { name: 'fast-3g', latency: 562.5, down: (1.6 * 1024 * 1024) / 8 * 0.9, up: (750 * 1024) / 8 * 0.9 },
  { name: 'slow-3g', latency: 2000, down: (500 * 1024) / 8 * 0.8, up: (500 * 1024) / 8 * 0.8 },
] as const;
const SHOTS_MS = [500, 1000, 2000, 4000, 8000];
const LIMIT_MS = 60_000;

const urls = (await getDb().execute<{ url: string }>(sql`SELECT url FROM images WHERE image_type = 'cover' AND url LIKE 'https://%' ORDER BY random() LIMIT 5`)).rows.map((r) => r.url);
if (urls.length < 5) throw new Error(`probe-cover-paint: ${urls.length} covers with a URL; five are needed`);

const outDir = join('docs', 'measurements', 'cover-paint');
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const shotDir = join(outDir, stamp);
mkdirSync(shotDir, { recursive: true });
const out = join(outDir, `${stamp}.jsonl`);
const log = (line: string) => process.stdout.write(`${line}\n`);

/* The band's cells: five 160-wide squares in a column, each a cover in a hairline frame, as GridCover draws a photo. */
const PAGE = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>
  body { margin: 0; padding: 18px; background: #e8e6e1; font: 14px system-ui; }
  ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 18px; }
  li { width: 160px; } .sq { aspect-ratio: 1; width: 100%; border: 1px solid #bbb; box-sizing: border-box; }
  img { display: block; width: 100%; height: 100%; object-fit: contain; }
</style></head><body><p>reply</p><ul id="cells"></ul></body></html>`;

/* Insert the five as the reply does, recording per cover when bytes first decode to a size (first paint) and when complete. */
const insertJs = (list: readonly string[]) => `(() => {
  const t0 = performance.now();
  window.__cover = [];
  const ul = document.getElementById('cells');
  ${JSON.stringify(list)}.forEach((u, i) => {
    const li = document.createElement('li');
    const sq = document.createElement('div'); sq.className = 'sq';
    const img = document.createElement('img'); img.loading = 'lazy'; img.alt = ''; img.src = u;
    const rec = { i, first: null, complete: null };
    window.__cover.push(rec);
    const poll = () => {
      const now = performance.now() - t0;
      if (rec.first === null && img.naturalWidth > 0) rec.first = now;
      if (img.complete && rec.complete === null) { rec.complete = now; if (rec.first === null && img.naturalWidth > 0) rec.first = now; return; }
      requestAnimationFrame(poll);
    };
    requestAnimationFrame(poll);
    sq.appendChild(img); li.appendChild(sq); ul.appendChild(li);
  });
  return true;
})()`;
const READ_JS = 'window.__cover';

const browser = await chromium.launch();
try {
  log(`probe-cover-paint: five production covers at 390 × 844, inserted as an answer, under ${PROFILES.map((p) => p.name).join(', ')}, cold cache each`);
  for (const profile of PROFILES) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: profile.latency, downloadThroughput: profile.down, uploadThroughput: profile.up });
    await page.setContent(PAGE);
    await page.evaluate(insertJs(urls));
    const started = Date.now();
    for (const at of SHOTS_MS) {
      const wait = at - (Date.now() - started);
      if (wait > 0) await page.waitForTimeout(wait);
      await page.screenshot({ path: join(shotDir, `${profile.name}-${String(at).padStart(5, '0')}ms.png`) });
    }
    await page.waitForFunction(`${READ_JS}.every((c) => c.complete !== null)`, undefined, { timeout: LIMIT_MS }).catch(() => undefined);
    const covers = (await page.evaluate(READ_JS)) as Array<{ i: number; first: number | null; complete: number | null }>;
    const done = covers.map((c) => c.complete).filter((n): n is number => n !== null);
    const firsts = covers.map((c) => c.first).filter((n): n is number => n !== null);
    const s = (ms: number) => `${(ms / 1000).toFixed(2)}s`;
    log(`  ${profile.name}: first paint ${firsts.length === 0 ? 'none' : `${s(Math.min(...firsts))} to ${s(Math.max(...firsts))}`}; complete ${done.length} of 5, the last at ${done.length === 0 ? 'none' : s(Math.max(...done))}`);
    appendFileSync(out, `${JSON.stringify({ profile: profile.name, covers, urls })}\n`);
    await context.close();
  }
  log(`probe-cover-paint: written to ${out}, screenshots in ${shotDir}`);
} finally {
  await browser.close();
  process.exit(0);
}

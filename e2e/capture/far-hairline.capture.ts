import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { expect, test, type Page } from '@playwright/test';
import { registerCleanup, trackArtist } from '../cleanup';
import { seedRecords } from '../seed';
import { login } from '../sign-in';

/**
 * **The far view's lines as rendered, and the floor Design is weighing (the coordinator, 8 Nov).**
 *
 * §W.27: "A hairline that cannot be seen is not a quiet rule, it is an absent one", with no figure for width. The
 * far drawing strokes its edges 1 unit wide in its own viewBox, so at 1044 × 768 they are 0.367 of a CSS pixel at
 * rest and 0.146 with an answer, and a line that thin does not render in its own colour: antialiasing spreads it
 * over a pixel at a fraction of its darkness. Here the RENDERED contrast is read: the drawing is screenshotted with
 * its count text hidden, every pixel darker than the darkest fill in the drawing (the plane, oklch 0.905) is a line
 * pixel, and its luminance against the paper read from the same image gives the contrast. Reported as the median
 * and the darkest line pixel, at device scale 1 and 2. The reference is §W.28's 1.74:1 for a hovered run's hairline.
 *
 * The instrument first, on a known answer: reference lines drawn into the same page in the far view's ink on its
 * paper, 1px on a pixel row (must read ink against paper), and 0.5px and 0.25px (must read lighter, in that order).
 *
 * Then the remedy Design is considering, generated, not drawn: the same page with a style injected that floors every
 * stroke in the far drawing at one device pixel (`vector-effect: non-scaling-stroke`, width 1/DPR), captured beside
 * the unfloored drawing at both scales. The build is unchanged; the floored shots are the build plus that one rule.
 *
 *     CAPTURE=1 E2E_SERVER=build npx playwright test --project=capture far-hairline
 *
 * At 1044 × 768, the band host, on a seeded pool of 30. Writes docs/measurements/far-hairline/<stamp>.json and
 * docs/captures/far-hairline-q3/<state>-<floor>-1044x768@<dpr>x.png.
 */
registerCleanup();

const SVG = '[data-wall="overview"]';
const control = (page: Page) => page.locator('[data-pick-control]').filter({ visible: true }).getByRole('button', { name: /surprise me/i });
const drawing = (page: Page) => page.locator(SVG).filter({ visible: true });

const lum = (r: number, g: number, b: number) => {
  const c = (v: number) => { const s = v / 255; return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * c(r) + 0.7152 * c(g) + 0.0722 * c(b);
};
const ratio = (a: number, b: number) => Math.round(((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)) * 100) / 100;

/** Line pixels: darker than the plane fill by more than rounding. Paper is the image's commonest luminance. */
async function readLines(png: Buffer, planeLum: number) {
  const { data, info } = await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const counts = new Map<number, number>();
  const lums: number[] = [];
  for (let i = 0; i < data.length; i += info.channels) {
    const l = lum(data[i], data[i + 1], data[i + 2]);
    const k = Math.round(l * 10000);
    counts.set(k, (counts.get(k) ?? 0) + 1);
    lums.push(l);
  }
  const paper = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0] / 10000;
  const line = lums.filter((l) => l < planeLum - 0.004).sort((a, b) => a - b);
  if (line.length === 0) return { paper, pixels: 0, median: null, darkest: null };
  return { paper, pixels: line.length, of: lums.length, median: ratio(paper, line[Math.floor(line.length / 2)]), darkest: ratio(paper, line[0]) };
}

/**
 * **Design's measure (8 Nov): at each point along a line, the darkest pixel across its width; then the median of
 * those along its length.** The far view is isometric, so its lines run vertical and at ±30°, and a row or column
 * scan is not a cross-section. Each stroked edge is taken from the DOM in screen coordinates (its own CTM), shared
 * edges once, and sampled every device pixel along its length, 2px clear of each end so a joint's neighbour is not
 * read. At each sample the pixels within ±1 device px along the normal are the cross-section, and the sample is the
 * highest contrast among them against the GROUND under that pixel, read from a second render with every stroke
 * transparent: the face or plane actually there, not an assumed paper. A cross-section the strokes do not change at
 * all is occluded by a face (painter's order) and skipped, which is how a hidden stretch differs from a faint one: a
 * faint line still changes its pixels. A line's figure is the median of its samples; lines with under three are left
 * out. Reported: the median of the lines' figures, the share of lines at or above §W.28's 1.74:1, the samples'
 * own median, and how many samples were occluded.
 */
type Raw = { data: Buffer; width: number; height: number; channels: number };
const raw = async (png: Buffer): Promise<Raw> => {
  const { data, info } = await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height, channels: info.channels };
};
const lumAt = (img: Raw, x: number, y: number) => {
  const i = (y * img.width + x) * img.channels;
  return lum(img.data[i], img.data[i + 1], img.data[i + 2]);
};
const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s.length === 0 ? null : s[Math.floor(s.length / 2)]; };

async function segmentsOf(page: Page, selector: string) {
  return page.evaluate((sel) => {
    const roots = Array.from(document.querySelectorAll(sel)).filter((r) => r.getBoundingClientRect().width > 0);
    const out: Array<{ tag: string; kind: string; owners: number[]; seg: [number, number, number, number] }> = [];
    let next = 0;
    const seen = new Map<string, number>();
    for (const root of roots) for (const el of Array.from(root.querySelectorAll('polygon, line'))) {
      const cs = getComputedStyle(el);
      if (cs.stroke === 'none' || cs.visibility === 'hidden' || cs.display === 'none' || parseFloat(cs.strokeWidth) === 0) continue;
      const m = (el as SVGGraphicsElement).getScreenCTM();
      if (m === null) continue;
      next += 1;
      const owner = next;
      /* The ownership render's colour for this element: red 255, its number in green and blue, never a grey fill. */
      (el as SVGElement).style.setProperty('--xs-owner', `rgb(255, ${(owner >> 8) & 255}, ${owner & 255})`);
      const pts: Array<[number, number]> = el.tagName === 'line'
        ? [[(el as SVGLineElement).x1.baseVal.value, (el as SVGLineElement).y1.baseVal.value], [(el as SVGLineElement).x2.baseVal.value, (el as SVGLineElement).y2.baseVal.value]]
        : Array.from((el as SVGPolygonElement).points).map((p) => [p.x, p.y] as [number, number]);
      const screen = pts.map(([x, y]) => { const q = new DOMPoint(x, y).matrixTransform(m); return [q.x, q.y] as [number, number]; });
      const edges = el.tagName === 'line' ? [[screen[0], screen[1]]] : screen.map((p, i) => [p, screen[(i + 1) % screen.length]]);
      for (const [a, b] of edges) {
        const key = [a, b].map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).sort().join('|');
        /* A shared edge is drawn by each face that has it, and whichever was painted last owns its pixels. */
        const already = seen.get(key);
        if (already !== undefined) { out[already].owners.push(owner); continue; }
        seen.set(key, out.length);
        /* Design's kinds (9 Nov): an upright is the carcass, a shelf the shelf, a record's faces its spine divisions. */
        const piece = el.closest('[data-piece]')?.getAttribute('data-piece');
        const kind = piece === 'upright' ? 'carcass' : piece === 'shelf' ? 'shelf' : el.hasAttribute('data-break') ? 'break' : el.hasAttribute('data-footprint') ? 'footprint' : 'spine-division';
        out.push({ tag: el.getAttribute('data-w') ?? '', kind, owners: [owner], seg: [a[0], a[1], b[0], b[1]] });
      }
    }
    return out;
  }, selector);
}

async function crossSection(page: Page, selector: string, dpr: number) {
  const segs = await segmentsOf(page, selector);
  await page.mouse.move(0, 0);
  const drawn = await raw(await page.screenshot({ animations: 'disabled' }));
  const bare = await page.addStyleTag({ content: `${selector} polygon, ${selector} line { stroke: transparent !important; }` });
  const ground = await raw(await page.screenshot({ animations: 'disabled' }));
  await bare.evaluate((el) => (el as Element).remove());
  /*
    Which line is on top, per pixel (9 Nov). The first version called a cross-section visible when any stroke changed
    any pixel in it, so a line hidden under a later face, beside a neighbour 1 to 2 px away, read as a faint line: all
    five lines that failed even floored at one device pixel were that. Here every stroke is drawn crisp, one device
    pixel wide, in its own colour over the real fills, so the top-most stroke at each pixel is known, and a
    cross-section counts only where its own line owns a pixel in it.
  */
  const own = await page.addStyleTag({ content: `${selector} polygon, ${selector} line { stroke: var(--xs-owner) !important; vector-effect: non-scaling-stroke; stroke-width: ${1 / dpr}px !important; shape-rendering: crispEdges; }` });
  const owners = await raw(await page.screenshot({ animations: 'disabled' }));
  await own.evaluate((el) => (el as Element).remove());
  const ownerAt = (x: number, y: number) => {
    const i = (y * owners.width + x) * owners.channels;
    return owners.data[i] === 255 && !(owners.data[i + 1] > 200 && owners.data[i + 2] > 200) ? owners.data[i + 1] * 256 + owners.data[i + 2] : 0;
  };
  /* How many pixels each kind's strokes own on top, so a kind drawn and wholly covered is seen as covered, not as absent. */
  const kindOf = new Map<number, string>();
  for (const sg of segs) for (const o of sg.owners) kindOf.set(o, sg.kind);
  const ownedByKind: Record<string, number> = {};
  for (let y = 0; y < owners.height; y += 1) for (let x = 0; x < owners.width; x += 1) {
    const o = ownerAt(x, y);
    if (o !== 0) { const k = kindOf.get(o) ?? 'unknown'; ownedByKind[k] = (ownedByKind[k] ?? 0) + 1; }
  }
  const segmentsByKind: Record<string, number> = {};
  for (const sg of segs) segmentsByKind[sg.kind] = (segmentsByKind[sg.kind] ?? 0) + 1;
  const lines: Array<{ tag: string; kind: string; median: number; seg: number[]; samples: number; occluded: number; mid: unknown }> = [];
  const all: number[] = [];
  let occluded = 0;
  /*
    The path checked against the pixels (the coordinator, 9 Nov). Sampling along the drawing's own account of a line
    trusts that the line is where the drawing says; if the render sits beside it (identity-band-holds:79, 0.45px with
    nothing noticing), the path measure reads ground and reports a low contrast as a finding. On the vertical lines,
    where a row scan needs no direction, each row's darkest pixel within ±2 device px of the path is found from the
    pixels alone, and its figure and its offset from the path are kept beside the path's.
  */
  const verticals: Array<{ path: number; scan: number; meanOffset: number; iso: { path: number; scan: number; meanOffset: number; rows: number } | null }> = [];
  for (const { tag, kind, owners: mine, seg } of segs) {
    const [x1, y1, x2, y2] = seg.map((v) => v * dpr);
    const length = Math.hypot(x2 - x1, y2 - y1);
    if (length < 5) continue;
    const [ux, uy] = [(x2 - x1) / length, (y2 - y1) / length];
    const [nx, ny] = [-uy, ux];
    const samples: number[] = [];
    const occludedBefore = occluded;
    for (let t = 2; t <= length - 2; t += 1) {
      const [px, py] = [x1 + ux * t, y1 + uy * t];
      const cells = new Set<string>();
      for (const d of [-1, -0.5, 0, 0.5, 1]) {
        const cx = Math.floor(px + nx * d); const cy = Math.floor(py + ny * d);
        if (cx >= 0 && cy >= 0 && cx < drawn.width && cy < drawn.height) cells.add(`${cx},${cy}`);
      }
      let best = 0; let visible = false;
      for (const d of [-1.5, -1, -0.5, 0, 0.5, 1, 1.5]) {
        const cx = Math.floor(px + nx * d); const cy = Math.floor(py + ny * d);
        if (cx >= 0 && cy >= 0 && cx < owners.width && cy < owners.height && mine.includes(ownerAt(cx, cy))) visible = true;
      }
      for (const c of cells) {
        const [cx, cy] = c.split(',').map(Number);
        const [l, g] = [lumAt(drawn, cx, cy), lumAt(ground, cx, cy)];
        if (l < g) best = Math.max(best, ratio(g, l));
      }
      if (!visible) { occluded += 1; continue; }
      samples.push(best === 0 ? 1 : best);
    }
    all.push(...samples);
    if (Math.abs(x2 - x1) < 0.01 && samples.length >= 3) {
      const scans: number[] = []; const offsets: number[] = []; const pathIso: number[] = []; const scanIso: number[] = []; const offIso: number[] = [];
      for (let t = 2; t <= length - 2; t += 1) {
        const y = Math.floor(y1 + uy * t);
        /* Isolated: no pixel 1.5 to 3.5 device px either side of the path is changed by any stroke, so no other line is near. */
        let crowded = false;
        for (let x = Math.floor(x1 - 3.5); x <= Math.floor(x1 + 3.5); x += 1) {
          const d = Math.abs(x + 0.5 - x1);
          if (d <= 1.5 || d > 3.5 || x < 0 || x >= drawn.width || y < 0 || y >= drawn.height) continue;
          if (Math.abs(lumAt(ground, x, y) - lumAt(drawn, x, y)) > 0.002) crowded = true;
        }
        let pathBest = 0;
        for (const d of [-1, -0.5, 0, 0.5, 1]) {
          const cx = Math.floor(x1 + d);
          if (cx < 0 || cx >= drawn.width || y < 0 || y >= drawn.height) continue;
          const [l, g] = [lumAt(drawn, cx, y), lumAt(ground, cx, y)];
          if (l < g) pathBest = Math.max(pathBest, ratio(g, l));
        }
        let best = 0; let at = -1; let visible = false;
        for (let x = Math.floor(x1) - 2; x <= Math.floor(x1) + 2; x += 1) {
          if (x < 0 || x >= drawn.width || y < 0 || y >= drawn.height) continue;
          const [l, g] = [lumAt(drawn, x, y), lumAt(ground, x, y)];
          if (Math.abs(g - l) > 0.002) visible = true;
          if (l < g && ratio(g, l) > best) { best = ratio(g, l); at = x; }
        }
        if (!visible) continue;
        scans.push(best === 0 ? 1 : best);
        if (at >= 0) offsets.push(at + 0.5 - x1);
        if (!crowded) { pathIso.push(pathBest === 0 ? 1 : pathBest); scanIso.push(best === 0 ? 1 : best); if (at >= 0) offIso.push(at + 0.5 - x1); }
      }
      const [pm, sm] = [median(samples), median(scans)];
      const mean = (xs: number[]) => (xs.length === 0 ? 0 : Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 100) / 100);
      if (pm !== null && sm !== null) verticals.push({ path: pm, scan: sm, meanOffset: mean(offsets), iso: pathIso.length >= 3 ? { path: median(pathIso) ?? 0, scan: median(scanIso) ?? 0, meanOffset: mean(offIso), rows: pathIso.length } : null });
    }
    const m = median(samples);
    if (samples.length >= 3 && m !== null) {
      /* The pixels across the line at its midpoint, drawn against ground, so a failing line can be read and not only counted. */
      const [mx, my] = [(x1 + x2) / 2, (y1 + y2) / 2];
      const mid = [-2, -1, 0, 1, 2].map((d) => { const cx = Math.floor(mx + nx * d); const cy = Math.floor(my + ny * d); return cx < 0 || cy < 0 || cx >= drawn.width || cy >= drawn.height ? null : { d, drawn: Math.round(lumAt(drawn, cx, cy) * 1000) / 1000, ground: Math.round(lumAt(ground, cx, cy) * 1000) / 1000 }; });
      lines.push({ tag, kind, median: m, seg: [x1, y1, x2, y2].map((v) => Math.round(v * 10) / 10), samples: samples.length, occluded: occluded - occludedBefore, mid });
    }
  }
  const figures = lines.map((l) => l.median);
  return {
    lines: lines.length,
    medianOfLines: median(figures),
    linesAtOrAbove174: lines.length === 0 ? null : Math.round((figures.filter((f) => f >= 1.74).length / lines.length) * 1000) / 1000,
    samplesMedian: median(all),
    samples: all.length,
    occludedSamples: occluded,
    ownedByKind,
    segmentsByKind,
    /* Every drawn line reaches 1.74:1 (Design, 9 Nov): the lines that do not, by kind, with each kind's total. */
    byKind: Object.fromEntries([...new Set(lines.map((l) => l.kind))].sort().map((k) => {
      const of = lines.filter((l) => l.kind === k);
      const failing = of.filter((l) => l.median < 1.74).map((l) => l.median).sort((a, b) => a - b);
      return [k, { lines: of.length, below174: failing.length, lowest: failing[0] ?? null, failing, failingLines: of.filter((l) => l.median < 1.74).map(({ median: md, seg, samples: n, occluded: o, mid }) => ({ median: md, seg, samples: n, occluded: o, mid })) }];
    })),
    verticalCheck: {
      lines: verticals.length,
      pathMedianOfLines: median(verticals.map((v) => v.path)),
      scanMedianOfLines: median(verticals.map((v) => v.scan)),
      linesDifferingOver5Percent: verticals.filter((v) => Math.abs(v.path - v.scan) / v.scan > 0.05).length,
      largestRelativeDifference: verticals.length === 0 ? null : Math.round(Math.max(...verticals.map((v) => Math.abs(v.path - v.scan) / v.scan)) * 1000) / 1000,
      medianOffsetPx: median(verticals.map((v) => v.meanOffset)),
      largestOffsetPx: verticals.length === 0 ? null : Math.max(...verticals.map((v) => Math.abs(v.meanOffset))),
      isolated: (() => {
        const iso = verticals.flatMap((v) => (v.iso === null ? [] : [v.iso]));
        const rel = iso.map((v) => Math.abs(v.path - v.scan) / v.scan);
        return {
          lines: iso.length,
          rows: iso.reduce((a, v) => a + v.rows, 0),
          pathMedianOfLines: median(iso.map((v) => v.path)),
          scanMedianOfLines: median(iso.map((v) => v.scan)),
          linesDifferingOver5Percent: rel.filter((r) => r > 0.05).length,
          largestRelativeDifference: rel.length === 0 ? null : Math.round(Math.max(...rel) * 1000) / 1000,
          medianOffsetPx: median(iso.map((v) => v.meanOffset)),
          largestOffsetPx: iso.length === 0 ? null : Math.max(...iso.map((v) => Math.abs(v.meanOffset))),
        };
      })(),
    },
    byTag: Object.fromEntries(lines.filter((l) => l.tag !== '').map((l) => [l.tag, l.median])),
  };
}

async function shoot(page: Page, name: string, dir: string) {
  await page.mouse.move(0, 0);
  const png = await drawing(page).screenshot({ animations: 'disabled' });
  writeFileSync(join(dir, name), png);
  return png;
}

for (const dpr of [1, 2]) {
  test(`the far view's rendered line contrast, and the one-device-pixel floor, at 1044 × 768 @${dpr}x`, async ({ browser }) => {
    test.skip(process.env.CAPTURE !== '1', 'A measurement tool: run with CAPTURE=1');
    test.setTimeout(240_000);
    const ctx = await browser.newContext({ viewport: { width: 1044, height: 768 }, deviceScaleFactor: dpr });
    const page = await ctx.newPage();
    await login(page);
    const suffix = `fh${dpr}${Date.now().toString(36)}`;
    const artist = (await (await page.request.post('/api/artists', { data: { name: `FarHairline-${suffix}` } })).json()) as { id: string };
    trackArtist(artist.id);
    await seedRecords(artist.id, 'FarHairline', suffix, 30);
    await page.goto(`/?artistId=${artist.id}`);
    await page.locator('[data-wall-container]:not([data-unmeasured])').waitFor({ timeout: 30_000 });
    await drawing(page).waitFor({ timeout: 30_000 });
    await page.evaluate(() => document.fonts.ready);

    const capDir = join('docs', 'captures', 'far-hairline-q3');
    mkdirSync(capDir, { recursive: true });

    /* The plane fill's luminance, read from the page's own computed colour, sets the line threshold. */
    const planeRgb = await page.evaluate(() => {
      const el = document.createElement('div');
      el.style.color = 'oklch(0.905 0.004 80)';
      document.body.append(el);
      const c = getComputedStyle(el).color;
      el.remove();
      const cv = document.createElement('canvas'); cv.width = cv.height = 1;
      const g = cv.getContext('2d'); if (g === null) return [0, 0, 0];
      g.fillStyle = c; g.fillRect(0, 0, 1, 1);
      return Array.from(g.getImageData(0, 0, 1, 1).data.slice(0, 3));
    });
    const planeLum = lum(planeRgb[0], planeRgb[1], planeRgb[2]);

    /* The instrument, on known answers. */
    await page.evaluate(() => {
      const ns = 'http://www.w3.org/2000/svg';
      const svg = document.createElementNS(ns, 'svg');
      svg.id = 'ref-lines';
      svg.setAttribute('width', '300'); svg.setAttribute('height', '160');
      Object.assign(svg.style, { position: 'fixed', left: '0', top: '0', zIndex: '9999', background: 'oklch(0.925 0.004 75)' });
      [1, 0.5, 0.25].forEach((w, i) => {
        const l = document.createElementNS(ns, 'line');
        l.setAttribute('x1', '10'); l.setAttribute('x2', '290');
        l.setAttribute('y1', String(10.5 + i * 20)); l.setAttribute('y2', String(10.5 + i * 20));
        l.setAttribute('stroke', '#161412'); l.setAttribute('stroke-width', String(w));
        l.setAttribute('data-w', String(w));
        svg.append(l);
      });
      const diag = document.createElementNS(ns, 'line');
      diag.setAttribute('x1', '160'); diag.setAttribute('y1', '150'); diag.setAttribute('x2', '290'); diag.setAttribute('y2', String(150 - 130 * Math.tan(Math.PI / 6)));
      diag.setAttribute('stroke', '#161412'); diag.setAttribute('stroke-width', '1'); diag.setAttribute('data-w', '1@30deg');
      svg.append(diag);
      document.body.append(svg);
    });
    const refs: Record<string, unknown> = {};
    for (const [i, w] of [1, 0.5, 0.25].entries()) {
      const png = await page.screenshot({ clip: { x: 0, y: i * 20, width: 300, height: 20 } });
      refs[String(w)] = await readLines(png, planeLum);
    }
    const refCross = await crossSection(page, '#ref-lines', dpr);
    await page.evaluate(() => document.getElementById('ref-lines')?.remove());
    const r1 = refs['1'] as { darkest: number }; const r05 = refs['0.5'] as { darkest: number }; const r025 = refs['0.25'] as { darkest: number };
    const inkOnPaper = ratio(lum(0x16, 0x14, 0x12), (refs['1'] as { paper: number }).paper);
    expect(Math.abs(r1.darkest - inkOnPaper) / inkOnPaper, `a 1px ink line reads ink on paper (${r1.darkest} against ${inkOnPaper})`).toBeLessThan(0.1);
    expect(r05.darkest, 'a 0.5px line reads lighter than 1px').toBeLessThan(r1.darkest);
    expect(r025.darkest, 'a 0.25px line reads lighter than 0.5px').toBeLessThan(r05.darkest);
    /* The cross-section on the same known answers: an aligned 1px line reads ink on paper along its whole length, thinner lower in order. */
    const c = refCross.byTag as Record<string, number>;
    expect(Math.abs(c['1'] - inkOnPaper) / inkOnPaper, `the cross-section reads a 1px line as ink on paper (${c['1']} against ${inkOnPaper})`).toBeLessThan(0.1);
    expect(c['0.5'], 'the cross-section reads 0.5px lighter than 1px').toBeLessThan(c['1']);
    expect(c['0.25'], 'and 0.25px lighter than 0.5px').toBeLessThan(c['0.5']);

    const noText = await page.addStyleTag({ content: `${SVG} text { visibility: hidden !important; }` });
    const floorRule = `${SVG} polygon, ${SVG} line { vector-effect: non-scaling-stroke; stroke-width: ${1 / dpr}px; }`;
    const read = async (state: string) => {
      const scale = await drawing(page).evaluate((svg) => Math.round(((svg as SVGSVGElement).getScreenCTM()?.a ?? 0) * 1000) / 1000);
      await page.mouse.move(0, 0);
      const plain = await readLines(await drawing(page).screenshot({ animations: 'disabled' }), planeLum);
      const crossPlain = await crossSection(page, SVG, dpr);
      const floor = await page.addStyleTag({ content: floorRule });
      const floored = await readLines(await drawing(page).screenshot({ animations: 'disabled' }), planeLum);
      const crossFloored = await crossSection(page, SVG, dpr);
      await floor.evaluate((el) => (el as Element).remove());
      console.log(`@${dpr}x ${state}: cross-section median of lines ${crossPlain.medianOfLines} (${crossPlain.linesAtOrAbove174} of ${crossPlain.lines} lines at or above 1.74), floored ${crossFloored.medianOfLines} (${crossFloored.linesAtOrAbove174})`);
      return { scale, strokeCssPx: scale, strokeDevicePx: Math.round(scale * dpr * 1000) / 1000, plain, floored, crossPlain, crossFloored };
    };

    const rest = await read('rest');
    await noText.evaluate((el) => (el as Element).remove());
    await shoot(page, `rest-unfloored-1044x768@${dpr}x.png`, capDir);
    let f = await page.addStyleTag({ content: floorRule });
    await shoot(page, `rest-floored-1044x768@${dpr}x.png`, capDir);
    await f.evaluate((el) => (el as Element).remove());

    await control(page).click();
    await page.locator('[data-pick-answer]').filter({ visible: true }).waitFor({ timeout: 10_000 });
    await page.waitForTimeout(2500);
    const noText2 = await page.addStyleTag({ content: `${SVG} text { visibility: hidden !important; }` });
    const answer = await read('answer');
    await noText2.evaluate((el) => (el as Element).remove());
    await shoot(page, `answer-unfloored-1044x768@${dpr}x.png`, capDir);
    f = await page.addStyleTag({ content: floorRule });
    await shoot(page, `answer-floored-1044x768@${dpr}x.png`, capDir);
    await f.evaluate((el) => (el as Element).remove());

    const out = { window: '1044x768', dpr, reference: '§W.28 hovered hairline 1.74:1', instrument: { inkOnPaper, lines: refs, crossSection: refCross }, planeLum, rest, answer };
    console.log(JSON.stringify(out, null, 1));
    const dir = join('docs', 'measurements', 'far-hairline');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, `${new Date().toISOString().replace(/[:.]/g, '-')}@${dpr}x.json`), `${JSON.stringify(out, null, 1)}\n`);
    await ctx.close();
  });
}

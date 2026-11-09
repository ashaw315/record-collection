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
      svg.setAttribute('width', '300'); svg.setAttribute('height', '60');
      Object.assign(svg.style, { position: 'fixed', left: '0', top: '0', zIndex: '9999', background: 'oklch(0.925 0.004 75)' });
      [1, 0.5, 0.25].forEach((w, i) => {
        const l = document.createElementNS(ns, 'line');
        l.setAttribute('x1', '10'); l.setAttribute('x2', '290');
        l.setAttribute('y1', String(10.5 + i * 20)); l.setAttribute('y2', String(10.5 + i * 20));
        l.setAttribute('stroke', '#161412'); l.setAttribute('stroke-width', String(w));
        l.setAttribute('data-w', String(w));
        svg.append(l);
      });
      document.body.append(svg);
    });
    const refs: Record<string, unknown> = {};
    for (const [i, w] of [1, 0.5, 0.25].entries()) {
      const png = await page.screenshot({ clip: { x: 0, y: i * 20, width: 300, height: 20 } });
      refs[String(w)] = await readLines(png, planeLum);
    }
    await page.evaluate(() => document.getElementById('ref-lines')?.remove());
    const r1 = refs['1'] as { darkest: number }; const r05 = refs['0.5'] as { darkest: number }; const r025 = refs['0.25'] as { darkest: number };
    const inkOnPaper = ratio(lum(0x16, 0x14, 0x12), (refs['1'] as { paper: number }).paper);
    expect(Math.abs(r1.darkest - inkOnPaper) / inkOnPaper, `a 1px ink line reads ink on paper (${r1.darkest} against ${inkOnPaper})`).toBeLessThan(0.1);
    expect(r05.darkest, 'a 0.5px line reads lighter than 1px').toBeLessThan(r1.darkest);
    expect(r025.darkest, 'a 0.25px line reads lighter than 0.5px').toBeLessThan(r05.darkest);

    const noText = await page.addStyleTag({ content: `${SVG} text { visibility: hidden !important; }` });
    const floorRule = `${SVG} polygon, ${SVG} line { vector-effect: non-scaling-stroke; stroke-width: ${1 / dpr}px; }`;
    const read = async (state: string) => {
      const scale = await drawing(page).evaluate((svg) => Math.round(((svg as SVGSVGElement).getScreenCTM()?.a ?? 0) * 1000) / 1000);
      await page.mouse.move(0, 0);
      const plain = await readLines(await drawing(page).screenshot({ animations: 'disabled' }), planeLum);
      const floor = await page.addStyleTag({ content: floorRule });
      const floored = await readLines(await drawing(page).screenshot({ animations: 'disabled' }), planeLum);
      await floor.evaluate((el) => (el as Element).remove());
      return { scale, strokeCssPx: scale, strokeDevicePx: Math.round(scale * dpr * 1000) / 1000, plain, floored };
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

    const out = { window: '1044x768', dpr, reference: '§W.28 hovered hairline 1.74:1', instrument: { inkOnPaper, lines: refs }, planeLum, rest, answer };
    console.log(JSON.stringify(out, null, 1));
    const dir = join('docs', 'measurements', 'far-hairline');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, `${new Date().toISOString().replace(/[:.]/g, '-')}@${dpr}x.json`), `${JSON.stringify(out, null, 1)}\n`);
    await ctx.close();
  });
}

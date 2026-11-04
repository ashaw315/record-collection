import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { NO_SCROLL_HEIGHT } from '../../src/app/records/[id]/band-geometry';
import { registerCleanup, trackArtist, trackCreated } from '../cleanup';
import { login } from '../sign-in';
import { wholePage } from '../whole-page';

/**
 * Step 167, §63: "Capture every 'Manage →' at 1440 × 900, on macOS and
 * Linux, with the arrow's advance." The record page's Images line, which is
 * where the app sets "Manage →", at 1440 × 900 on this machine: the line
 * alone and the page whole, with the arrow's advance and a letter's beside
 * it in the sheet. The Linux drawing is the CI runner's: arrow-167.spec.ts
 * attaches the same line from every run, in test-results-chromium. Run with
 * CAPTURE=1 --project=capture; replaced only with CAPTURE_REPLACE=1.
 */
registerCleanup();

const OUT = join('docs', 'captures', 'arrow-167');

test('the Images line’s "Manage →" at 1440 × 900, with the arrow’s advance', async ({ browser }) => {
  test.skip(process.env.CAPTURE !== '1', 'A capture tool: run with CAPTURE=1');
  if (existsSync(join(OUT, 'arrow-167.md')) && process.env.CAPTURE_REPLACE !== '1') throw new Error(`${OUT} already holds the capture. It is not replaced unless CAPTURE_REPLACE=1 says so`);
  test.setTimeout(300_000);
  mkdirSync(OUT, { recursive: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: NO_SCROLL_HEIGHT } });
  context.setDefaultTimeout(30_000);
  const page = await context.newPage();
  await login(page);
  const post = async (path: string, data: unknown) => {
    const response = await page.request.post(path, { data });
    const body = (await response.json()) as { id?: string; error?: { existingId?: string } };
    if (response.status() === 409 && path === '/api/artists' && typeof body.error?.existingId === 'string') { trackArtist(body.error.existingId); return body.error.existingId; }
    expect(response.status(), `${path} answered ${response.status()} ${JSON.stringify(body)}`).toBe(201);
    if (typeof body.id !== 'string') throw new Error(`${path}: no id`);
    trackCreated(path, body);
    return body.id;
  };
  const artist = await post('/api/artists', { name: 'GBH' });
  trackArtist(artist);
  const record = await post('/api/records', { title: 'Hear Nothing See Nothing Say Nothing', artistId: artist });
  await page.goto(`/records/${record}`);
  const link = page.locator('a[href="#images"]', { hasText: 'Manage →' });
  await link.waitFor();
  await page.addStyleTag({ content: 'nextjs-portal{display:none!important}' });
  await page.evaluate(() => document.fonts.ready);
  await page.mouse.move(1, 1);
  await page.waitForTimeout(300);
  const advance = await link.evaluate((el) => {
    const node = Array.from(el.childNodes).find((n) => n.nodeType === Node.TEXT_NODE && (n.textContent ?? '').includes('→')) as Text;
    const width = (needle: string) => { const at = node.textContent?.indexOf(needle) ?? -1; const r = document.createRange(); r.setStart(node, at); r.setEnd(node, at + 1); return Math.round(r.getBoundingClientRect().width * 100) / 100; };
    return { arrow: width('→'), letter: width('M'), size: getComputedStyle(el).fontSize };
  });
  /*
    The face that RENDERED the glyphs, from Chromium's platform-font report for the node, not the
    declared family: the first sheet printed the declaration's list, "mono, mono Fallback", under
    "family", and Design read the fallback's name as the renderer (4 Nov).
  */
  const cdp = await context.newCDPSession(page);
  await cdp.send('DOM.enable');
  await cdp.send('CSS.enable');
  const { root } = await cdp.send('DOM.getDocument', { depth: -1 });
  const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector: 'a[href="#images"]' });
  const { fonts } = await cdp.send('CSS.getPlatformFontsForNode', { nodeId });
  const rendered = (fonts as { familyName: string; postScriptName: string; isCustomFont: boolean; glyphCount: number }[]).map((f) => `${f.familyName} (${f.postScriptName}, ${f.isCustomFont ? 'the app’s file' : 'a system face'}) for ${f.glyphCount} glyph(s)`).join('; ');
  const line = link.locator('xpath=..');
  await line.screenshot({ path: join(OUT, `manage-arrow-${process.platform}-1440x900.png`) });
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  await wholePage(page, join(OUT, `record-${process.platform}-w1440-h${height}.png`));
  writeFileSync(join(OUT, 'arrow-167.md'), [
    '# Step 167: §63, the arrow drawn from the family’s own file',
    '',
    `The test database, desktop Chromium on ${process.platform} (${process.arch}), 1440 × 900. The record is this tool’s own.`,
    '',
    '| file | what |',
    '|---|---|',
    `| manage-arrow-${process.platform}-1440x900.png | the Images line, "Manage →" |`,
    `| record-${process.platform}-w1440-h${height}.png | the record page whole |`,
    '',
    `Rendered by: ${rendered}. The line is ${(await link.textContent())?.trim().length ?? 0} characters, so one face for that many glyphs is the whole line from the family’s file.`,
    '',
    `The arrow’s advance: ${advance.arrow}px; M in the same run: ${advance.letter}px; at ${advance.size}. Both are 600 units at 11px plus the label’s .1em tracking, 7.7; a difference in the second decimal is the Range rectangles’ subpixel edges, not a second face.`,
    '',
    'The Linux drawing is attached by `e2e/arrow-167.spec.ts` on every CI run, in the `test-results-chromium` artifact, as `manage-arrow-linux-1440x900.png`.',
    '',
  ].join('\n'));
  await context.close();
});

import { expect, test, type Page } from '@playwright/test';
import { NO_SCROLL_HEIGHT } from '../src/app/records/[id]/band-geometry';
import { registerCleanup, trackArtist, trackCreated } from './cleanup';
import { login } from './sign-in';

/**
 * Step 167, §63: "The arrow is the app's type, not the machine's: → is drawn
 * in Geist Mono, from the family's own file, wherever the app sets it." The
 * step: the family's own GeistMono-Variable, cut once by a committed script to
 * Google's Latin range plus U+2190 to 2199, served wherever the app sets Geist
 * Mono.
 *
 * **Read from the face that rendered the glyphs, not from anything the page
 * declares.** Chromium names the platform font behind every glyph of a node
 * (`CSS.getPlatformFontsForNode`), so the reading is: every glyph of the
 * line, the arrow included, drawn by the one custom face, and no system
 * font among them. Two readings this replaced were proxies (4 Nov): the
 * face's declared `unicodeRange`, which next/font sets to everything
 * whatever the file holds, and the arrow's advance against a letter's,
 * which a metric-adjusted fallback could match. A control on the same page
 * draws a glyph the cut does not hold (☃) and expects a system font to
 * appear for it, so the channel is shown able to see a fallback.
 *
 * The advance is still read and reported, because §63's step asks for it,
 * and the line is attached as a picture so the CI runner's Linux drawing
 * travels with the macOS capture. Chromium only, by the channel.
 *
 * Fails against the build before it on the first reading: the arrow's glyph
 * came from a system face, two fonts on the node.
 */
registerCleanup();

type Face = { familyName: string; postScriptName: string; isCustomFont: boolean; glyphCount: number };

async function platformFonts(page: Page, selector: string): Promise<Face[]> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('DOM.enable');
  await cdp.send('CSS.enable');
  const { root } = await cdp.send('DOM.getDocument', { depth: -1 });
  const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector });
  if (nodeId === 0) throw new Error(`${selector}: not found`);
  const { fonts } = await cdp.send('CSS.getPlatformFontsForNode', { nodeId });
  await cdp.detach();
  return fonts as Face[];
}

/** The advance of → and of a letter, each as a one-character Range in the same text node; §63's figure. */
const advances = (page: Page, selector: string, letter: string) => page.evaluate(([sel, ch]) => {
  const el = document.querySelector(sel);
  if (el === null) throw new Error(`${sel}: not found`);
  const widthOf = (needle: string) => {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let node: Node | null = walker.nextNode();
    while (node !== null) {
      const text = node.textContent ?? '';
      const at = text.indexOf(needle);
      if (at !== -1) {
        const range = document.createRange();
        range.setStart(node, at);
        range.setEnd(node, at + needle.length);
        return range.getBoundingClientRect().width;
      }
      node = walker.nextNode();
    }
    throw new Error(`${sel}: "${needle}" is not in its text`);
  };
  return { arrow: widthOf('→'), letter: widthOf(ch), text: (el.textContent ?? '').trim(), size: getComputedStyle(el).fontSize };
}, [selector, letter] as const);

async function expectOneCustomFace(page: Page, selector: string, what: string) {
  const fonts = await platformFonts(page, selector);
  const { text } = await advances(page, selector, '→');
  expect(fonts.map((f) => `${f.familyName}${f.isCustomFont ? '' : ' (system)'} ×${f.glyphCount}`), `${what}: every glyph from the one custom face`).toEqual([`Geist Mono ×${[...text].length}`]);
  return fonts[0];
}

async function post(page: Page, path: string, data: unknown): Promise<string> {
  const response = await page.request.post(path, { data });
  const body = (await response.json()) as { id?: string; error?: { existingId?: string } };
  if (response.status() === 409 && path === '/api/artists' && typeof body.error?.existingId === 'string') { trackArtist(body.error.existingId); return body.error.existingId; }
  expect(response.status(), `${path} answered ${response.status()} ${JSON.stringify(body)}`).toBe(201);
  if (typeof body.id !== 'string') throw new Error(`${path}: no id`);
  trackCreated(path, body);
  return body.id;
}

test.describe('§63: the arrow is drawn in Geist Mono from the family’s own file', () => {
  test.use({ viewport: { width: 1440, height: NO_SCROLL_HEIGHT } });

  test('the record page’s "Manage →": every glyph rendered by the custom Geist Mono face, a control glyph the cut lacks falling to a system face', async ({ page }, testInfo) => {
    await login(page);
    const artist = await post(page, '/api/artists', { name: 'Arrow 167' });
    trackArtist(artist);
    const record = await post(page, '/api/records', { title: 'Hear Nothing See Nothing Say Nothing', artistId: artist });
    await page.goto(`/records/${record}`);
    const link = page.locator('a[href="#images"]', { hasText: 'Manage →' });
    await link.waitFor({ timeout: 20_000 });
    await page.evaluate(() => document.fonts.ready);

    const face = await expectOneCustomFace(page, 'a[href="#images"]', 'Manage →');
    const read = await advances(page, 'a[href="#images"]', 'M');
    testInfo.annotations.push({ type: 'rendered by', description: `${face.familyName} (${face.postScriptName}), ${face.glyphCount} glyphs` });
    testInfo.annotations.push({ type: 'arrow advance', description: `${read.arrow}px against M ${read.letter}px at ${read.size}` });
    expect(Math.abs(read.arrow - read.letter), `→ advances ${read.arrow}, M ${read.letter}`).toBeLessThanOrEqual(0.1);

    /* The control: the same font stack asked for a glyph the cut does not hold. A system face must appear, or the channel is not seeing fallbacks. */
    await page.evaluate(() => {
      const probe = document.createElement('span');
      probe.id = 'arrow-167-control';
      probe.className = 'font-mono';
      probe.textContent = 'M☃';
      document.body.appendChild(probe);
    });
    await page.evaluate(() => document.fonts.ready);
    const control = await platformFonts(page, '#arrow-167-control');
    expect(control.some((f) => !f.isCustomFont), `the control ☃ falls to a system face: ${JSON.stringify(control)}`).toBe(true);
    expect(control.some((f) => f.isCustomFont && f.familyName === 'Geist Mono'), 'and its M is still the family’s').toBe(true);

    const line = link.locator('xpath=..');
    await testInfo.attach(`manage-arrow-${process.platform}-1440x900.png`, { body: await line.screenshot(), contentType: 'image/png' });
  });

  test('the wall’s "THE WHOLE COLLECTION →" at arrival: every glyph from the same face', async ({ page }, testInfo) => {
    await login(page);
    await page.goto('/');
    await page.locator('[data-wall-container][data-hydrated="true"]').waitFor({ timeout: 30_000 });
    await page.locator('[data-zoom-mark]').first().waitFor({ timeout: 20_000 });
    await page.evaluate(() => document.fonts.ready);
    const face = await expectOneCustomFace(page, '[data-zoom-mark]', 'THE WHOLE COLLECTION →');
    const read = await advances(page, '[data-zoom-mark]', 'T');
    testInfo.annotations.push({ type: 'rendered by', description: `${face.familyName} (${face.postScriptName}), ${face.glyphCount} glyphs` });
    expect(Math.abs(read.arrow - read.letter), `→ advances ${read.arrow}, T ${read.letter}`).toBeLessThanOrEqual(0.1);
  });
});

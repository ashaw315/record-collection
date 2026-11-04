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
 * Two readings, on the record page's "Manage →" at 1440 × 900 and on the
 * wall's "N RECORDS →":
 *
 * - **The face.** Among the loaded faces of the family the element resolves
 *   to, one covers U+2192. Google's slices never did: the latin file holds ↑ and
 *   ↓ and not →, and no other slice holds it either, so the machine's fallback
 *   drew it. `document.fonts.check` is not this reading: a family with no face
 *   for a character answers true, having nothing to load.
 * - **The advance.** In a monospace face every glyph has one advance, so the
 *   arrow's width equals a letter's in the same run; the fallback's does not.
 *   The advance is reported in the test's annotations, which is the figure
 *   §63's step asks for, and the line is attached as a picture at 1440 × 900
 *   so the CI runner's Linux drawing travels with the macOS one.
 *
 * Fails against the build before it on the face: no loaded face of the mono
 * family covers U+2192.
 */
registerCleanup();

const readArrow = (page: Page, selector: string, letter: string) => page.evaluate(async ([sel, ch]) => {
  const el = document.querySelector(sel);
  if (el === null) throw new Error(`${sel}: not found`);
  await document.fonts.ready;
  const family = getComputedStyle(el).fontFamily;
  const first = family.split(',')[0].trim().replace(/^["']|["']$/g, '');
  const inRange = (range: string, cp: number) => range.split(',').some((part) => {
    const m = part.trim().match(/^U\+([0-9A-F?]+)(?:-([0-9A-F]+))?$/i);
    if (m === null) return false;
    const lo = parseInt(m[1].replace(/\?/g, '0'), 16);
    const hi = m[2] === undefined ? parseInt(m[1].replace(/\?/g, 'F'), 16) : parseInt(m[2], 16);
    return cp >= lo && cp <= hi;
  });
  const faces = Array.from(document.fonts).filter((f) => f.family.replace(/^["']|["']$/g, '') === first && f.status === 'loaded');
  const covering = faces.filter((f) => inRange(f.unicodeRange, 0x2192)).length;
  /* The advance of → and of a letter, each as a one-character Range in the same text node. */
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
  return { family, faces: faces.length, covering, arrow: widthOf('→'), letter: widthOf(ch), size: getComputedStyle(el).fontSize };
}, [selector, letter] as const);

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

  test('the record page’s "Manage →": a loaded face of the mono family covers U+2192, and the arrow’s advance is a letter’s', async ({ page }, testInfo) => {
    await login(page);
    const artist = await post(page, '/api/artists', { name: 'Arrow 167' });
    trackArtist(artist);
    const record = await post(page, '/api/records', { title: 'Hear Nothing See Nothing Say Nothing', artistId: artist });
    await page.goto(`/records/${record}`);
    const link = page.locator('a[href="#images"]', { hasText: 'Manage →' });
    await link.waitFor({ timeout: 20_000 });
    const read = await readArrow(page, 'a[href="#images"]', 'M');
    testInfo.annotations.push({ type: 'arrow advance', description: `${read.arrow}px against M ${read.letter}px at ${read.size}, ${read.family}` });
    expect(read.faces, `loaded faces of ${read.family}`).toBeGreaterThan(0);
    expect(read.covering, `a loaded face of ${read.family} covers U+2192`).toBeGreaterThan(0);
    expect(Math.abs(read.arrow - read.letter), `→ advances ${read.arrow}, M ${read.letter}`).toBeLessThanOrEqual(0.1);
    const line = link.locator('xpath=..');
    await testInfo.attach(`manage-arrow-${process.platform}-1440x900.png`, { body: await line.screenshot(), contentType: 'image/png' });
  });

  test('the wall’s "THE WHOLE COLLECTION →" at arrival: the same face, the same advance', async ({ page }, testInfo) => {
    await login(page);
    await page.goto('/');
    await page.locator('[data-wall-container][data-hydrated="true"]').waitFor({ timeout: 30_000 });
    const mark = page.locator('[data-zoom-mark]').first();
    await mark.waitFor({ timeout: 20_000 });
    const read = await readArrow(page, '[data-zoom-mark]', 'T');
    testInfo.annotations.push({ type: 'arrow advance', description: `${read.arrow}px against T ${read.letter}px at ${read.size}, ${read.family}` });
    expect(read.covering, `a loaded face of ${read.family} covers U+2192`).toBeGreaterThan(0);
    expect(Math.abs(read.arrow - read.letter), `→ advances ${read.arrow}, T ${read.letter}`).toBeLessThanOrEqual(0.1);
  });
});

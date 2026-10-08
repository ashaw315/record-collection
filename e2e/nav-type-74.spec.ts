import { expect, test, type Page } from '@playwright/test';
import { registerCleanup, trackArtist } from './cleanup';
import { NO_SCROLL_HEIGHT } from '../src/app/records/[id]/band-geometry';
import { login } from './sign-in';

registerCleanup();

/**
 * Step 74: §G.1 to §G.4 and §G.6 -- the header in the record detail's system.
 *
 * "Set the wordmark and links in Geist Mono 11, uppercase, .12em; links not
 * current in oklch(0.44 0.008 70), wordmark and current link in ink; weights
 * 500 and 400 ... Fix the one-row height at 53 with the type centred ...
 * set the horizontal inset to 18 ... links 24 apart, with no padding of
 * their own. Set the header's type at line height 1 ... Mark the current
 * link with §3's 2px ink underline 7px below the baseline."
 *
 * Every assertion reads the rendered page: computed styles for the type,
 * colours compared with a reference element painted in the ruled colour
 * (so no serialisation is guessed), and measured boxes for the geometry.
 */

const INK = 'oklch(0.19 0.008 60)';
const LABEL = 'oklch(0.44 0.008 70)';

async function seedRecord(page: Page): Promise<string> {
  const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const artist = await page.request.post('/api/artists', { data: { name: `Nav74-${suffix}` } });
  const artistId = ((await artist.json()) as { id: string }).id;
  trackArtist(artistId);
  const record = await page.request.post('/api/records', { data: { title: `Nav74 ${suffix}`, artistId } });
  expect(record.status(), 'the fixture record exists').toBe(201);
  return ((await record.json()) as { id: string }).id;
}

async function seedWant(page: Page): Promise<string> {
  const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const artist = await page.request.post('/api/artists', { data: { name: `Nav74W-${suffix}` } });
  const artistId = ((await artist.json()) as { id: string }).id;
  trackArtist(artistId);
  const item = await page.request.post('/api/want-list', { data: { title: `Nav74 want ${suffix}`, artistId, priority: 3 } });
  expect(item.status(), 'the fixture want-list item exists').toBe(201);
  return ((await item.json()) as { id: string }).id;
}

async function open(page: Page, path: string, width: number, height = NO_SCROLL_HEIGHT) {
  await page.setViewportSize({ width, height });
  await page.goto(path);
  await page.locator('[data-app-nav]').waitFor({ timeout: 20_000 });
  await page.evaluate(() => document.fonts.ready);
}

/**
 * A colour as the pixel it paints, [r, g, b]. Comparing serialisations does
 * not work: a token resolved through Tailwind computes to lab(...) while the
 * same colour set inline stays oklch(...), and both are right.
 */
const PAINT = `(c) => { const k = document.createElement('canvas'); k.width = 1; k.height = 1; const x = k.getContext('2d'); x.fillStyle = c; x.fillRect(0, 0, 1, 1); return Array.from(x.getImageData(0, 0, 1, 1).data.slice(0, 3)); }`;
const painted = (page: Page, css: string) => page.evaluate(([fn, c]) => (eval(fn) as (c: string) => number[])(c), [PAINT, css] as const);
const samePaint = (a: number[], b: number[]) => a.every((v, i) => Math.abs(v - b[i]) <= 1);
const computedColour = painted;

/** The header's wordmark and links, with what each computes to and where it sits. */
const readHeader = (page: Page) =>
  page.evaluate((fn) => {
    const paint = eval(fn) as (c: string) => number[];
    const header = document.querySelector('[data-app-nav]') as HTMLElement;
    const bar = header.firstElementChild as HTMLElement;
    const style = (el: Element) => {
      const cs = getComputedStyle(el);
      /* The glyphs' own box, not the element's: the wordmark's element fills the 52 row, so its box is centred whatever the type does. */
      const range = document.createRange();
      range.selectNodeContents(el.firstChild ?? el);
      const r = range.getBoundingClientRect();
      return { text: (el.textContent ?? '').trim(), family: cs.fontFamily, size: cs.fontSize, transform: cs.textTransform, tracking: cs.letterSpacing, lineHeight: cs.lineHeight, weight: cs.fontWeight, colour: paint(cs.color), current: el.getAttribute('aria-current'), left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width };
    };
    const wordmark = header.querySelector('[data-wordmark]') as HTMLElement;
    const links = Array.from(header.querySelectorAll('nav[aria-label="Main"] a')).map(style);
    const hb = header.getBoundingClientRect();
    const bb = bar.getBoundingClientRect();
    return { header: { top: hb.top, height: hb.height }, bar: { left: bb.left, right: bb.right, top: bb.top, height: bb.height }, wordmark: style(wordmark), links, position: getComputedStyle(header).position };
  }, PAINT);

test.describe('§G.1: the header is set in the record detail’s type', () => {
  test.beforeEach(async ({ page }) => login(page));

  /* Fails against the built header: Inter Tight 14, mixed case, untracked, in the general muted token. */
  test('wordmark and links are Geist Mono 11, uppercase, .12em, line height 1; ink and label colour; 500 and 400', async ({ page }) => {
    await open(page, '/want-list', 1440);
    const ink = await computedColour(page, INK);
    const label = await computedColour(page, LABEL);
    const h = await readHeader(page);
    for (const item of [h.wordmark, ...h.links]) {
      expect(item.family, `${item.text}: Geist Mono`).toMatch(/Geist Mono/);
      expect(item.size, `${item.text}: 11px`).toBe('11px');
      expect(item.transform, `${item.text}: uppercase`).toBe('uppercase');
      expect(item.tracking, `${item.text}: .12em of 11px`).toBe('1.32px');
      expect(item.lineHeight, `${item.text}: line height 1`).toBe('11px');
    }
    expect(samePaint(h.wordmark.colour, ink), `the wordmark is ink: ${h.wordmark.colour} against ${ink}`).toBe(true);
    expect(h.wordmark.weight, 'the wordmark is 500').toBe('500');
    for (const link of h.links) {
      const isCurrent = link.current === 'page';
      expect(samePaint(link.colour, isCurrent ? ink : label), `${link.text}: ${isCurrent ? 'current, ink' : 'not current, the label colour'} (${link.colour})`).toBe(true);
      expect(link.weight, `${link.text}: ${isCurrent ? '500' : '400'}`).toBe(isCurrent ? '500' : '400');
    }
  });

  /* Fails against the built header, where the current link is 500 in Inter Tight, a proportional face that widens with weight. */
  test('the weight does not change Geist Mono’s advance: COLLECTION is as wide current at 500 as not current at 400', async ({ page }) => {
    await open(page, '/', 1440);
    const current = (await readHeader(page)).links.find((l) => l.text === 'Collection');
    await open(page, '/want-list', 1440);
    const notCurrent = (await readHeader(page)).links.find((l) => l.text === 'Collection');
    expect(current?.weight).toBe('500');
    expect(notCurrent?.weight).toBe('400');
    expect(current?.width, 'same advance at both weights').toBeCloseTo(notCurrent?.width ?? -1, 2);
  });
});

test.describe('§G.2 and §G.3: 53 on one row, the type centred, an 18 inset and a 24 gap', () => {
  test.beforeEach(async ({ page }) => login(page));

  /* Fails against the built header: its 53 came from 14px type plus padding, the inset was 16 and the links sat 4 apart inside 8px padding. */
  for (const width of [1000, 1440, 1920]) {
    test(`at ${width}: 53 tall, type centred, wordmark 18 in, links 24 apart`, async ({ page }) => {
      for (const path of ['/', '/want-list', '/stats', '/manage']) {
        await open(page, path, width);
        const h = await readHeader(page);
        expect(h.header.height, `${path}: the header is 53`).toBe(53);
        const rowCentre = h.bar.top + 52 / 2;
        for (const item of [h.wordmark, ...h.links]) {
          expect(Math.abs((item.top + item.bottom) / 2 - rowCentre), `${path}: ${item.text} is centred in the row`).toBeLessThanOrEqual(1);
        }
        expect(h.wordmark.left - h.bar.left, `${path}: the wordmark sits 18 in from the measure's edge`).toBeCloseTo(18, 0);
        for (let i = 1; i < h.links.length; i += 1) {
          expect(h.links[i].left - h.links[i - 1].right, `${path}: ${h.links[i - 1].text} to ${h.links[i].text} is 24`).toBeCloseTo(24, 0);
        }
      }
    });
  }

  /* Fails against the built header, whose bar had 16px side padding: Delete record ended 16 from the bar's right edge. */
  test('on the record detail at 1440 and 1920: 53 tall, and the slot ends 18 in from the right', async ({ page }) => {
    const id = await seedRecord(page);
    for (const width of [1440, 1920]) {
      await open(page, `/records/${id}`, width);
      const m = await page.evaluate(() => {
        const header = document.querySelector('[data-app-nav]') as HTMLElement;
        const bar = (header.firstElementChild as HTMLElement).getBoundingClientRect();
        const del = header.querySelector('[data-slot="actions"] [data-control="delete"]') as HTMLElement;
        return { height: header.getBoundingClientRect().height, gap: bar.right - del.getBoundingClientRect().right };
      });
      expect(m.height, `the record detail's header is 53 at ${width}`).toBe(53);
      expect(m.gap, `the slot ends 18 in at ${width}`).toBeCloseTo(18, 0);
    }
  });
});

test.describe('§G.2: a second row adds height below the first; it is never squeezed into the 53', () => {
  test.beforeEach(async ({ page }) => login(page));

  /*
    Fails against the first build of step 74, which made 52 the bar's minimum: the slot's row sat inside it and pushed the
    first row's type off centre (11 from the top, not 26). Found in the step's captures. Step 76 put the slot in line at
    1000, so the case is now 390, where the slot keeps its own row below the control's.
  */
  test('on the record detail at 390, the control is centred in the first 52 and the slot sits wholly below it', async ({ page }) => {
    const id = await seedRecord(page);
    await open(page, `/records/${id}`, 390);
    const m = await page.evaluate(() => {
      const header = document.querySelector('[data-app-nav]') as HTMLElement;
      const bar = (header.firstElementChild as HTMLElement).getBoundingClientRect();
      const c = (header.querySelector('[data-menu-control]') as HTMLElement).getBoundingClientRect();
      const slot = (header.querySelector('[data-slot="actions"]') as HTMLElement).getBoundingClientRect();
      return { centre: (c.top + c.bottom) / 2 - bar.top, slotTop: slot.top - bar.top, height: header.getBoundingClientRect().height };
    });
    expect(Math.abs(m.centre - 26), `the control is centred in the first 52 (centre at ${m.centre})`).toBeLessThanOrEqual(1);
    expect(m.slotTop, 'the slot starts below the first row').toBeGreaterThanOrEqual(52);
    expect(m.height, 'so the header is taller than 53 here').toBeGreaterThan(53);
  });
});

test.describe('§G.4: every screen marks where it belongs, with §3’s underline', () => {
  test.beforeEach(async ({ page }) => login(page));

  /* Fails against the built header: nothing was current on the three record screens or on Suggestions. */
  test('each of the twelve screens marks its section current, and only one', async ({ page }) => {
    const record = await seedRecord(page);
    const want = await seedWant(page);
    const expected: Array<[string, string]> = [
      ['/', 'Collection'],
      [`/records/${record}`, 'Collection'],
      [`/records/${record}/edit`, 'Collection'],
      ['/records/new', 'Collection'],
      ['/want-list', 'Want list'],
      ['/want-list/new', 'Want list'],
      [`/want-list/${want}`, 'Want list'],
      [`/want-list/${want}/edit`, 'Want list'],
      ['/suggestions', 'Want list'],
      ['/lookup', 'Look up'],
      ['/stats', 'Stats'],
      ['/manage', 'Manage'],
    ];
    for (const [path, section] of expected) {
      await open(page, path, 1440);
      const current = (await readHeader(page)).links.filter((l) => l.current === 'page').map((l) => l.text);
      expect(current, `${path} marks ${section}`).toEqual([section]);
    }
  });

  /* Fails against the built header, which drew no underline: the current link was marked by colour and weight alone. */
  test('the current link carries a 2px ink underline, 7px below the baseline, as wide as the link', async ({ page }) => {
    await open(page, '/stats', 1440);
    const ink = await computedColour(page, INK);
    const m = await page.evaluate((fn) => {
      const paint = eval(fn) as (c: string) => number[];
      const link = document.querySelector('nav[aria-label="Main"] a[aria-current="page"]') as HTMLElement;
      const mark = link.querySelector('[data-current-mark]') as HTMLElement | null;
      /* The baseline, measured: a zero-size inline-block sits on it. */
      const probe = document.createElement('span');
      probe.style.cssText = 'display:inline-block;width:0;height:0;vertical-align:baseline;';
      link.appendChild(probe);
      const baseline = probe.getBoundingClientRect().top;
      probe.remove();
      const l = link.getBoundingClientRect();
      if (mark === null) return null;
      const r = mark.getBoundingClientRect();
      return { top: r.top - baseline, height: r.height, left: r.left - l.left, right: l.right - r.right, colour: paint(getComputedStyle(mark).backgroundColor) };
    }, PAINT);
    expect(m, 'the current link draws a mark').not.toBeNull();
    expect(m?.height, '2px').toBeCloseTo(2, 1);
    expect(m?.top, '7px below the baseline').toBeCloseTo(7, 0);
    expect(m?.left, 'from the link’s left edge').toBeCloseTo(0, 0);
    expect(m?.right, 'to its right edge').toBeCloseTo(0, 0);
    expect(m !== null && samePaint(m.colour, ink), `in ink: ${m?.colour} against ${ink}`).toBe(true);
  });
});

test.describe('§G.6: the header is not sticky', () => {
  test.beforeEach(async ({ page }) => login(page));

  /* A guard, not a fail-first test: the built header already scrolls away, and §G.6 rules that it keeps doing so. */
  test('it scrolls away with the page', async ({ page }) => {
    /* A short window, so the page scrolls whatever the fixture holds. */
    await open(page, '/stats', 1440, 400);
    const m = await page.evaluate(async () => {
      window.scrollTo(0, 300);
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const header = document.querySelector('[data-app-nav]') as HTMLElement;
      return { scrolled: window.scrollY, top: header.getBoundingClientRect().top, position: getComputedStyle(header).position };
    });
    expect(m.scrolled, 'the page scrolled, so the test can say something').toBeGreaterThan(100);
    expect(m.top, 'the header moved up with it').toBeCloseTo(-m.scrolled, 0);
    expect(m.position, 'and is not positioned to stay').toBe('static');
  });
});

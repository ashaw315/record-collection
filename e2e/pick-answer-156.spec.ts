import { expect, test, type Page } from '@playwright/test';
import { registerCleanup, trackArtist } from './cleanup';
import { removeRecordsFor, seedRecords } from './seed';
import { login } from './sign-in';
import { wallMeasured } from './wall-measured';
import { WRITE_CAPTURES } from './write-captures';
import { nearViewMinWidth, shelfOfferedMinWidth } from '../src/app/wall/view-fork';

/**
 * Step 156 unit 3b, target §P.4: SURPRISE ME's answer in every view that
 * cannot pull. "On the table and the grid the answer is one cover, beneath
 * the control. It is §T.5's cell: the cover, its title and artist beneath it,
 * and the whole cell one link to its record... On the far view the answer is
 * the same cell, beneath the control." §P.2: the pool is what the screen
 * shows, the page holds one last-served record, and a navigation clears it.
 *
 * Each test seeds its own artist, so the pool is a filter to it and nothing
 * here depends on what else the database holds.
 */
registerCleanup();
test.beforeEach(async ({ page }) => login(page));

const BAND_WIDTHS = [shelfOfferedMinWidth(), nearViewMinWidth() - 1];

/** The far drawing's ink, not the svg's box: `meet` fits the drawing inside it. */
const ink = (page: Page) =>
  page.evaluate(() => {
    const marks = Array.from(document.querySelectorAll('[data-region="far"] svg[data-wall="overview"] :is([data-furniture], [data-far-seat])')).map((el) => el.getBoundingClientRect());
    const [top, bottom] = [Math.min(...marks.map((b) => b.top)), Math.max(...marks.map((b) => b.bottom))];
    return { top, bottom, height: bottom - top };
  });

async function artistWith(page: Page, records: Array<{ prefix: string; count: number }>): Promise<{ artistId: string; suffix: string }> {
  const suffix = `p156${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
  const artist = (await (await page.request.post('/api/artists', { data: { name: `Pick-${suffix}` } })).json()) as { id: string };
  trackArtist(artist.id);
  for (const r of records) await seedRecords(artist.id, r.prefix, suffix, r.count);
  return { artistId: artist.id, suffix };
}

async function open(page: Page, width: number, query: string, height = 900) {
  await page.setViewportSize({ width, height });
  await page.goto(`/${query}`);
  if (query.includes('view=')) await page.locator('[data-collection-filters][data-hydrated="true"]').first().waitFor({ timeout: 30_000 });
  else await wallMeasured(page);
  await page.addStyleTag({ content: 'nextjs-portal{display:none!important}' });
  await page.evaluate(() => document.fonts.ready);
}

/** The drawn control's button: a bare `/` carries two copies and a media query hides one. */
const press = (page: Page) => page.locator('[data-pick-control] button').filter({ visible: true }).click();

const answer = (page: Page) =>
  page.evaluate(() => {
    const drawn = (el: Element) => (el as HTMLElement).getClientRects().length > 0;
    const answers = Array.from(document.querySelectorAll('[data-pick-answer]')).filter(drawn);
    const control = Array.from(document.querySelectorAll('[data-pick-control]')).find(drawn) ?? null;
    const cell = answers[0] ?? null;
    const link = cell?.querySelector('a') ?? null;
    const box = (el: Element | null) => (el === null ? null : (({ top, bottom, left, right, height, width }) => ({ top, bottom, left, right, height, width }))(el.getBoundingClientRect()));
    return {
      count: answers.length,
      inControl: cell !== null && control !== null && control.contains(cell),
      href: link?.getAttribute('href') ?? null,
      title: cell?.querySelector('[data-grid-title]')?.textContent ?? null,
      artist: cell?.querySelector('[data-grid-artist]')?.textContent ?? null,
      cover: cell?.querySelector('[data-grid-cover]') !== null && cell !== null,
      cell: box(cell),
      button: box(control?.querySelector('button') ?? null),
      slot: box(control?.querySelector('[data-pick-slot]') ?? null),
      message: control?.querySelector('[data-pick-slot]')?.textContent ?? null,
      linkCovers: link === null || cell === null ? false : (() => { const a = getComputedStyle(link, '::after'); return a.position === 'absolute' && a.content !== 'none'; })(),
    };
  });

test.describe('§P.4: the answer on the table and the grid', () => {
  for (const view of ['table', 'grid'] as const) {
    test(`the ${view} at 1440: no answer until asked; then one cell beneath the control, from the matches, the whole cell one link; nothing else on the page moves`, async ({ page }) => {
      const { artistId, suffix } = await artistWith(page, [{ prefix: 'Pick', count: 3 }]);
      try {
        await open(page, 1440, `?view=${view}&artistId=${artistId}`);
        expect((await answer(page)).count, 'nothing is drawn before the ask').toBe(0);
        const url = page.url();
        const listed = await page.locator('[data-collection-content] a[href^="/records/"]').evaluateAll((as) => as.map((a) => a.getAttribute('href')));
        await page.evaluate(() => window.scrollTo(0, 0));
        await press(page);
        const a = await answer(page);
        expect(a.count).toBe(1);
        expect(a.inControl, 'drawn as part of the control').toBe(true);
        if (a.cell === null || a.slot === null) throw new Error('no cell');
        expect(a.cell.top, 'beneath the control and its slot').toBeGreaterThanOrEqual(a.slot.bottom);
        /* §P.4: "It is drawn at §T.5's 160, the least a cover is, and 24 below the slot." */
        expect(a.cell.top - a.slot.bottom, '24 below the slot').toBeCloseTo(24, 0);
        expect(a.cell.width, 'at §T.5’s 160').toBeCloseTo(160, 0);
        expect(a.title ?? '', 'a record the screen shows').toContain(suffix);
        expect(a.artist).toBe(`Pick-${suffix}`);
        expect(a.cover, 'the cover is the cell’s').toBe(true);
        expect(listed).toContain(a.href);
        expect(a.linkCovers, 'the whole cell is the link').toBe(true);
        expect(page.url(), 'the address does not change').toBe(url);
        expect(await page.evaluate(() => window.scrollY), 'nothing scrolls to the record').toBe(0);
        const after = await page.locator('[data-collection-content] a[href^="/records/"]').evaluateAll((as) => as.map((el) => el.getAttribute('href')));
        expect(after, 'the list is as it was').toEqual(listed);
      } finally {
        await removeRecordsFor(artistId);
      }
    });
  }

  /* §P.2: "The same record is not served twice in a row while another remains." §P.4: "A later answer replaces it in the same place." */
  test('the grid at 1440: a second ask serves another record, in the same place, and only one cell is ever drawn', async ({ page }) => {
    const { artistId } = await artistWith(page, [{ prefix: 'Pick', count: 3 }]);
    try {
      await open(page, 1440, `?view=grid&artistId=${artistId}`);
      const seen: string[] = [];
      let top: number | null = null;
      for (let i = 0; i < 6; i += 1) {
        await press(page);
        const a = await answer(page);
        expect(a.count).toBe(1);
        if (a.href === null || a.cell === null) throw new Error('no answer');
        if (seen.length > 0) expect(a.href, `ask ${i + 1} is not ask ${i}'s record`).not.toBe(seen[seen.length - 1]);
        expect(a.message, 'a new record, so the slot says nothing').toBe('');
        seen.push(a.href);
        if (top === null) top = a.cell.top;
        else expect(a.cell.top, 'replaced in place').toBeCloseTo(top, 1);
      }
    } finally {
      await removeRecordsFor(artistId);
    }
  });

  /*
    §P.2: "Under a filter or a search, an ask draws from the matches": every match, not the page's rows, since a record
    on page two is not one the filter hid. Math.random is held at its top, so the pick is the pool's last record, which
    in title order is on page two. Fails against a pool taken from the page.
  */
  test('the grid at 1440 with fifty-five matches: the pool is every match, page two included', async ({ page }) => {
    const { artistId, suffix } = await artistWith(page, [{ prefix: 'Pick', count: 55 }]);
    try {
      await open(page, 1440, `?view=grid&artistId=${artistId}`);
      /*
        Held only once the page is up. React names its internal node keys from Math.random so two copies on one page
        stay apart, and the dev server runs two: the page and Next's dev overlay, in nextjs-portal's shadow root. Held
        constant from the first script, both took the same key (zzzybj7u3bs), and the page never drew an answer, even
        with the real Math.random restored before the press. A varying stub did not do it (26 Oct). The app reads
        Math.random only in the press.
      */
      await page.evaluate(() => { Math.random = () => 0.999999; });
      const listed = await page.locator('[data-collection-grid] [data-grid-title]').allTextContents();
      expect(listed, 'the page shows fifty').toHaveLength(50);
      await press(page);
      const a = await answer(page);
      expect(a.title).toBe(`Pick 54 ${suffix}`);
      expect(listed, 'a match the page does not show').not.toContain(a.title);
    } finally {
      await removeRecordsFor(artistId);
    }
  });

  test('the grid at 390: the cell beneath the control in the band’s flow', async ({ page }) => {
    const { artistId, suffix } = await artistWith(page, [{ prefix: 'Pick', count: 2 }]);
    try {
      await open(page, 390, `?view=grid&artistId=${artistId}`, 844);
      await press(page);
      const a = await answer(page);
      expect(a.count).toBe(1);
      if (a.cell === null || a.slot === null) throw new Error('no cell');
      expect(a.cell.top).toBeGreaterThanOrEqual(a.slot.bottom);
      expect(a.cell.left, 'on the 18 inset').toBeCloseTo(18, 0);
      expect(a.cell.right).toBeLessThanOrEqual(390 - 18);
      expect(a.title ?? '').toContain(suffix);
    } finally {
      await removeRecordsFor(artistId);
    }
  });

  /* §P.2: "The selected moods and the last-served record are held by the page only... a navigation clears them." */
  test('a navigation clears the answer: the table’s answer is gone on the grid', async ({ page }) => {
    const { artistId } = await artistWith(page, [{ prefix: 'Pick', count: 2 }]);
    try {
      await open(page, 1440, `?view=table&artistId=${artistId}`);
      await press(page);
      expect((await answer(page)).count).toBe(1);
      await page.locator('[data-collection-sidebar] a[href*="view=grid"]').filter({ visible: true }).first().click();
      await page.waitForURL(/view=grid/);
      await page.locator('[data-collection-grid]').waitFor();
      expect((await answer(page)).count, 'held by the page only').toBe(0);
    } finally {
      await removeRecordsFor(artistId);
    }
  });

  /*
    §P.4: "Whether a different caption can change the cell's height, and so move what follows again, is measured by
    the step, not predicted here." Two records, one title short and one long enough to wrap at the cell's width; with
    two in the pool the last-served rule alternates them, so both are served. Reported, not held to a figure.
  */
  test('the table at 1440: a different caption’s effect on the cell’s height and on what follows, measured', async ({ page }) => {
    const { artistId } = await artistWith(page, [{ prefix: 'Go', count: 1 }, { prefix: 'A title long enough to run onto a second and a third line at the cell', count: 1 }]);
    try {
      await open(page, 1440, `?view=table&artistId=${artistId}`);
      const heights = new Map<string, { cell: number; next: number | null }>();
      for (let i = 0; i < 2; i += 1) {
        await press(page);
        const a = await answer(page);
        if (a.title === null || a.cell === null) throw new Error('no answer');
        const next = await page.evaluate(() => {
          const el = Array.from(document.querySelectorAll('[data-sidebar-fragment]')).find((e) => (e as HTMLElement).getClientRects().length > 0);
          return el === undefined ? null : el.getBoundingClientRect().top;
        });
        heights.set(a.title, { cell: a.cell.height, next });
      }
      expect(heights.size, 'both captions served').toBe(2);
      const [short, long] = [...heights.entries()].sort((x, y) => x[0].length - y[0].length).map(([, h]) => h);
      test.info().annotations.push({
        type: 'caption',
        description: `cell ${short.cell.toFixed(1)} tall with the short title, ${long.cell.toFixed(1)} with the long one; what follows (the fragment) at ${short.next?.toFixed(1) ?? 'not drawn'} and ${long.next?.toFixed(1) ?? 'not drawn'}`,
      });
    } finally {
      await removeRecordsFor(artistId);
    }
  });

  /*
    The coordinator, 26 Oct: Design asked for the windows where the fragment stops drawing, with the control in place.
    Swept on the table with the answer drawn; reported, not held.
  */
  test('the table: the windows where the fragment draws, with the control and an answer in place, reported', async ({ page }) => {
    const { artistId } = await artistWith(page, [{ prefix: 'Pick', count: 2 }]);
    try {
      await open(page, 1440, `?view=table&artistId=${artistId}`);
      await press(page);
      const drawnAt: number[] = [];
      for (let width = 1040; width <= 1100; width += 1) {
        await page.setViewportSize({ width, height: 900 });
        const drawn = await page.evaluate(() => Array.from(document.querySelectorAll('[data-sidebar-fragment]')).some((e) => (e as HTMLElement).getClientRects().length > 0));
        if (drawn) drawnAt.push(width);
      }
      for (const width of [1280, 1440, 1920]) {
        await page.setViewportSize({ width, height: 900 });
        if (await page.evaluate(() => Array.from(document.querySelectorAll('[data-sidebar-fragment]')).some((e) => (e as HTMLElement).getClientRects().length > 0))) drawnAt.push(width);
      }
      expect((await answer(page)).count, 'the answer is still drawn').toBe(1);
      test.info().annotations.push({ type: 'fragment', description: `drawn from ${drawnAt[0]} in 1040–1100; at 1280, 1440 and 1920: ${[1280, 1440, 1920].map((w) => (drawnAt.includes(w) ? 'drawn' : 'not drawn')).join(', ')}` });
      expect(drawnAt.length).toBeGreaterThan(0);
    } finally {
      await removeRecordsFor(artistId);
    }
  });
});

test.describe('§P.4: on the far view, the same cell beneath the control in the band', () => {
  for (const [width, height] of BAND_WIDTHS.flatMap((w) => [900, 768].map((h) => [w, h] as const))) {
    test(`at ${width}×${height}: the cell in the control's row, the drawing still whole in the window, what it costs the drawing measured and captured`, async ({ page }) => {
      const { artistId, suffix } = await artistWith(page, [{ prefix: 'Pick', count: 2 }]);
      try {
        await open(page, width, `?artistId=${artistId}`, height);
        const before = await ink(page);
        await press(page);
        const a = await answer(page);
        expect(a.count).toBe(1);
        if (a.cell === null || a.slot === null) throw new Error('no cell');
        expect(a.cell.top).toBeGreaterThanOrEqual(a.slot.bottom);
        expect(a.title ?? '').toContain(suffix);
        const after = await ink(page);
        test.info().annotations.push({ type: 'far', description: `cell ${a.cell.height.toFixed(1)} tall; the drawing ${before.height.toFixed(1)} tall before the ask and ${after.height.toFixed(1)} with the answer, ${after.top.toFixed(1)} to ${after.bottom.toFixed(1)} in a ${height} window` });
        expect(after.bottom, 'the drawing still ends above the window’s foot').toBeLessThanOrEqual(height);
        if (WRITE_CAPTURES) await page.screenshot({ path: `docs/captures/step156-3b-far-${width}x${height}-answer.png` });
      } finally {
        await removeRecordsFor(artistId);
      }
    });
  }

  /*
    The figure Adam judges (the coordinator, 26 Oct): unfiltered, so the count carries no "N of M records" line, and
    with the count beside the drawing as §W.28 rules it. The tests above filter to their own records, which adds that
    line and takes 25 from the drawing, so they are a worst case and not this. Reported, and held only to the window.
  */
  for (const [width, height] of BAND_WIDTHS.flatMap((w) => [768, 900].map((h) => [w, h] as const))) {
    test(`at ${width}×${height}, unfiltered: the far drawing with and without an answer, measured and captured`, async ({ page }) => {
      await open(page, width, '', height);
      const before = await ink(page);
      await press(page);
      const a = await answer(page);
      expect(a.count).toBe(1);
      const after = await ink(page);
      if (a.cell === null) throw new Error('no cell');
      test.info().annotations.push({ type: 'far, unfiltered', description: `drawing ${before.height.toFixed(1)} tall without an answer, ${after.height.toFixed(1)} with one (cell ${a.cell.height.toFixed(1)}), in a ${height} window` });
      expect(after.bottom).toBeLessThanOrEqual(height);
      /* Adam's pictures are the real collection's now (e2e/sheet/pick-far-156.sheet.ts); these are the fixture's, on request. */
      if (WRITE_CAPTURES) await page.screenshot({ path: `docs/captures/step156-3b-far-${width}x${height}-unfiltered-answer.png` });
    });
  }

  test('the near view at 1440 does not answer with a cell: its answer is the pull (unit 4)', async ({ page }) => {
    const { artistId } = await artistWith(page, [{ prefix: 'Pick', count: 2 }]);
    try {
      await open(page, 1440, `?artistId=${artistId}`);
      await press(page);
      expect((await answer(page)).count).toBe(0);
    } finally {
      await removeRecordsFor(artistId);
    }
  });
});

/*
  §P.4: "Where the answer is the record the cell already shows, the cell does not change and the slot says so... The
  message is §P.6's, as proposed there", and by §P.2 SURPRISE ME serves it again "where what the screen shows holds
  one". The first answer shows nothing yet, so it says nothing.
*/
test('the grid at 1440 with one record showing: a second ask serves it again, the cell does not move, and the slot says "The only one."', async ({ page }) => {
  const { artistId } = await artistWith(page, [{ prefix: 'Only', count: 1 }]);
  try {
    await open(page, 1440, `?view=grid&artistId=${artistId}`);
    await press(page);
    const first = await answer(page);
    expect(first.message, 'the first answer shows a record that was not shown').toBe('');
    await press(page);
    const second = await answer(page);
    expect(second.count).toBe(1);
    expect(second.href).toBe(first.href);
    expect(second.message).toBe('The only one.');
    if (first.cell === null || second.cell === null) throw new Error('no cell');
    expect(second.cell.top, 'nothing on the page moves').toBeCloseTo(first.cell.top, 1);
  } finally {
    await removeRecordsFor(artistId);
  }
});

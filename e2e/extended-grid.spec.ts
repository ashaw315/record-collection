/*
  Ornament locators are scoped to the REGION: §28's upper air (the identity band's fourth cell at 8 columns) carries a figure and a flat in the markup at every width, hidden by the fork stylesheet above 1439, and a page-wide `.first()` resolves to that hidden element. These tests state §26's rows, which are the region's.
*/
import { expect, test, type Page } from '@playwright/test';
import { registerCleanup, trackArtist } from './cleanup';
import { readSeventeen } from './seventeen';
import { DISC_REFERENCE_JS } from './disc-reading';
import { seedImage } from './seed';
import { getTestDb } from '../test/helpers/db';
import { sql } from 'drizzle-orm';
import { GRID_FORK } from '../src/app/records/[id]/band-geometry';
import { FIGURES, GATE_RATIO, SIZE_RATIO, figureBox } from '../src/app/records/[id]/ornament';
import { pageWidthAt } from '../src/app/records/[id]/region-rows';
import {
  CELL_PADDING,
  CONTROL_HEIGHT,
  FIELD_HEIGHT,
  LABEL_SPAN,
  MARK_HEIGHT,
  MARK_WIDTH,
  TYPED_SIZE,
} from '../src/app/records/[id]/extended-grid';
import { NO_SCROLL_HEIGHT } from '../src/app/records/[id]/band-geometry';

/**
 * **The bar needs a derived colour, and a seeded image does not produce one.**
 * `spine_colour` is computed by the import path from real artwork; `seedImage`
 * writes a row and nothing else, so a record built here has a null ladder and
 * correctly draws no bar. Set explicitly, so the fixture states what the test
 * depends on rather than inheriting it.
 */
async function giveSpineColour(recordId: string) {
  await getTestDb().execute(
    sql`UPDATE records SET spine_colour = ${'#a25829'} WHERE id = ${recordId}::uuid`,
  );
}

registerCleanup();

/**
 * §9.1 — the extended grid, measured on the rendering.
 *
 * The constants have their own unit test; what cannot be asserted there is that
 * the RAIL ACTUALLY LANDS at 34 and the content at 284, that the section rule
 * bleeds past both, and that the bar appears beside a section holding nothing
 * but a control. Those are the claims the structure exists to make.
 */

const PASSWORD = process.env.E2E_PASSWORD ?? 'test-password-for-e2e';

async function login(page: Page) {
  await page.goto('/login');
  await page.locator('form[data-hydrated="true"]').waitFor({ timeout: 15_000 });
  await page.getByLabel('Password').pressSequentially(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL('/');
}

function makeSuffix(): string {
  return `x${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
}

async function post(page: Page, path: string, data: unknown) {
  const response = await page.request.post(path, { data, failOnStatusCode: false });
  expect([200, 201], `${path} ${response.status()}`).toContain(response.status());
  return response.json();
}

/**
 * **The modal record — 16 of 17.** No plant, no weight, no colour variant, so
 * Pressing detail holds nothing and §9.1 does not render it at all.
 */
async function modalRecord(page: Page, suffix: string): Promise<string> {
  const artist = await post(page, '/api/artists', { name: `Donovan-${suffix}` });
  trackArtist(artist.id as string);
  const pressing = await post(page, '/api/pressings', {
    catalogNumber: `BN-${suffix}`,
    matrixRunout: `BNMX-${suffix}`,
    yearPressed: 1968,
    countryPressed: 'United States',
  });
  const record = await post(page, '/api/records', {
    title: `The Hurdy Gurdy Man ${suffix}`,
    artistId: artist.id,
    pressingId: pressing.id,
    releaseYear: 1968,
  });
  await seedImage({ recordId: record.id as string, imageType: 'cover' });
  await giveSpineColour(record.id as string);
  return record.id as string;
}

/** The richest record: the only one where Pressing detail has facts to hold. */
async function richRecord(page: Page, suffix: string): Promise<string> {
  const artist = await post(page, '/api/artists', { name: `Vandross-${suffix}` });
  trackArtist(artist.id as string);
  const pressing = await post(page, '/api/pressings', {
    catalogNumber: `FE-${suffix}`,
    matrixRunout: `FEMX-${suffix}`,
    pressingPlant: 'Terre Haute',
    yearPressed: 1981,
    countryPressed: 'United States',
    vinylWeightGrams: 180,
    colorVariant: 'Black',
  });
  const record = await post(page, '/api/records', {
    title: `Never Too Much ${suffix}`,
    artistId: artist.id,
    pressingId: pressing.id,
    releaseYear: 1981,
  });
  await seedImage({ recordId: record.id as string, imageType: 'cover' });
  await giveSpineColour(record.id as string);
  return record.id as string;
}

test.beforeEach(async ({ page }) => {
  await login(page);
});

test('every section and air column sits on the twelve columns (§26)', async ({ page }) => {
  /**
   * **The alignment the columns exist for, now measured on the row items.**
   *
   * §9.1 gave every section its own twelve-column grid, so every CELL edge
   * was a column edge. §26 gives the region varied spans — 7 + 5, 4 / 4 / 4,
   * 12, 6 / 6, 3 + 9 — so a section is an item in a row and its content
   * divides the section's own width by fractions. What must still land on a
   * column boundary is each section's and each air column's outer edges,
   * because that is what keeps the rows reading as one grid.
   */
  const suffix = makeSuffix();
  const id = await richRecord(page, suffix);
  await page.setViewportSize({ width: 1440, height: NO_SCROLL_HEIGHT });
  await page.goto(`/records/${id}`);
  await page.locator('[data-region="extended-grid"] [data-section]').first().waitFor({ timeout: 20_000 });

  const measured = await page.evaluate(() => {
    const column = window.innerWidth / 12;
    return Array.from(document.querySelectorAll('[data-region="extended-grid"] [data-section], [data-cell="air"]')).map((item) => {
      const box = item.getBoundingClientRect();
      return {
        name: item.getAttribute('data-section') ?? 'air',
        left: box.left / column,
        right: box.right / column,
      };
    });
  });

  expect(measured.length, 'rows rendered').toBeGreaterThan(0);

  for (const item of measured) {
    /* Within a tenth of a column: sub-pixel rounding, not a different grid. */
    expect(
      Math.abs(item.left - Math.round(item.left)),
      `${item.name} left edge at column ${item.left.toFixed(2)}`,
    ).toBeLessThan(0.1);
    expect(
      Math.abs(item.right - Math.round(item.right)),
      `${item.name} right edge at column ${item.right.toFixed(2)}`,
    ).toBeLessThan(0.1);
  }
});

test('the label sits above its content at the section’s own left edge (§26)', async ({ page }) => {
  /**
   * **§9.1's two-column label span does not survive §26's rows.** A section
   * of four columns cannot give two of them to a label. §26's drawing puts
   * the label at the top-left of each section with content beneath it.
   *
   * What that keeps of §9.1's argument — one edge that never moves as a
   * reader scrolls — is asserted here: each label starts at its own
   * section's left edge plus the cell padding, and the sections' edges are
   * column edges (the test above).
   */
  const suffix = makeSuffix();
  const id = await richRecord(page, suffix);
  await page.setViewportSize({ width: 1440, height: NO_SCROLL_HEIGHT });
  await page.goto(`/records/${id}`);
  await page.locator('[data-region="extended-grid"] [data-section]').first().waitFor({ timeout: 20_000 });

  const labels = await page.evaluate(() =>
    Array.from(document.querySelectorAll('[data-region="extended-grid"] [data-section]')).map((section) => {
      const cell = section.querySelector('[data-cell="label"]');
      const content = section.querySelector('[data-cell^="content"]');
      if (cell === null || content === null) return null;
      /*
        The label's TEXT, not its cell: the cell starts at the section's edge
        and holds the type 34 inside, which is the x a reader sees.
      */
      const text = cell.firstElementChild ?? cell;
      const l = text.getBoundingClientRect();
      const s = section.getBoundingClientRect();
      const c = content.getBoundingClientRect();
      return {
        name: section.getAttribute('data-section'),
        offsetFromSection: Math.round(l.left - s.left),
        aboveContent: l.bottom <= c.top + 1,
      };
    }),
  );

  for (const label of labels) {
    expect(label, 'every section has a label and content').not.toBeNull();
    if (label === null) continue;
    expect(label.offsetFromSection, `${label.name}: the label starts at the section's own edge, inside its padding`).toBe(CELL_PADDING);
    expect(label.aboveContent, `${label.name}: the label is above the content, not beside it`).toBe(true);
  }
});

/**
 * **§33 withdrew the content-cell dividers, and this test followed the ruling
 * rather than being deleted.** It asserted a 1px right rule on every content
 * cell but the last -- the label-to-value dividers -- which §33 names
 * directly: "A vertical rule runs its row's full height or is not drawn: the
 * label-to-value dividers inside Pressing detail and Market start below their
 * section labels, and a vertical that starts partway reads as a break. They
 * are withdrawn; the label and value columns are separated by space."
 *
 * The section-to-section rule runs the row's full height, so it stays.
 */
test('rules every row item but the last; content cells carry no divider (§26, §33)', async ({ page }) => {
  /**
   * **Two levels of rule now, because §26 gives the region two levels of
   * box.** A row's items are ruled between one another — that is the
   * vertical line between Acquisition, Tags and Market — and inside a
   * section its content cells are ruled between themselves. In both cases
   * the last carries none, because the next edge is the page's.
   */
  const suffix = makeSuffix();
  const id = await richRecord(page, suffix);
  await page.setViewportSize({ width: 1440, height: NO_SCROLL_HEIGHT });
  await page.goto(`/records/${id}`);
  await page.locator('[data-region="extended-grid"] [data-section]').first().waitFor({ timeout: 20_000 });

  const rows = await page.evaluate(() => {
    const items = Array.from(document.querySelectorAll('[data-region="extended-grid"] [data-section], [data-cell="air"]'));
    /* Group by top edge: items sharing a top are one row. */
    const byTop = new Map<number, Element[]>();
    for (const item of items) {
      const top = Math.round(item.getBoundingClientRect().top);
      byTop.set(top, [...(byTop.get(top) ?? []), item]);
    }
    return [...byTop.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([, group]) => {
        const ordered = group.sort((a, b) => a.getBoundingClientRect().left - b.getBoundingClientRect().left);
        return ordered.map((item) => ({
          name: item.getAttribute('data-section') ?? 'air',
          rule: getComputedStyle(item).borderRightWidth,
          cells: Array.from(item.querySelectorAll('[data-cell^="content"]')).map((cell) => getComputedStyle(cell).borderRightWidth),
        }));
      });
  });

  expect(rows.length, 'rows rendered').toBeGreaterThan(0);

  for (const row of rows) {
    row.forEach((item, index) => {
      /*
        **Air carries no rule.** A rule divides two cells; air is where the
        rhythm makes room, so a rule beside it would draw an edge around
        nothing — §3's vocabulary, where an inset hairline separates things
        inside one module. Only sections are ruled from their neighbours.
      */
      const expected = index === row.length - 1 || item.name === 'air' ? '0px' : '1px';
      expect(item.rule, `${item.name}: ${index === row.length - 1 ? 'last in its row, unruled' : item.name === 'air' ? 'air is unruled' : 'ruled from its neighbour'}`).toBe(expected);

      item.cells.forEach((cell, cellIndex) => {
        expect(cell, `${item.name} content ${cellIndex}: §33 withdrew the divider`).toBe('0px');
      });
    });
  }
});

test('holds content at 34px inside every cell', async ({ page }) => {
  const suffix = makeSuffix();
  const id = await richRecord(page, suffix);
  await page.goto(`/records/${id}`);
  await page.locator('[data-region="extended-grid"] [data-section]').first().waitFor({ timeout: 20_000 });

  const paddings = await page.evaluate(() =>
    Array.from(document.querySelectorAll('[data-region="extended-grid"] [data-section] [data-cell]')).map((cell) => {
      const style = getComputedStyle(cell);
      return `${style.paddingTop}|${style.paddingLeft}`;
    }),
  );

  expect(paddings.length).toBeGreaterThan(0);
  for (const padding of paddings) {
    expect(padding).toBe(`${CELL_PADDING}px|${CELL_PADDING}px`);
  }
});

/**
 * **§33: the row's rule is ONE element per row, not a border on each item.**
 *
 * This asserted a 1px top border on every item so "they line up". §33 found
 * the defect in that: "A row's horizontal rule runs full-bleed across every
 * cell, occupied or empty; the build drew each cell's rule, so the empty cell
 * of the four-by-three row left a gap." A rule drawn per item spans only the
 * items that render, and §26's rows may hold fewer. So each row now carries
 * exactly one `[data-row-rule]` spanning the composition, and the items
 * carry none -- both halves asserted, since a leftover item border would
 * double the line.
 */
test('each row’s rule is one full-bleed element, and no item carries its own (§26, §33)', async ({ page }) => {
  const suffix = makeSuffix();
  const id = await richRecord(page, suffix);
  await page.setViewportSize({ width: 1440, height: NO_SCROLL_HEIGHT });
  await page.goto(`/records/${id}`);
  await page.locator('[data-region="extended-grid"] [data-section]').first().waitFor({ timeout: 20_000 });

  const measured = await page.evaluate(() => {
    const items = Array.from(document.querySelectorAll('[data-region="extended-grid"] [data-section], [data-cell="air"]'));
    const byTop = new Map<number, Element[]>();
    for (const item of items) {
      const top = Math.round(item.getBoundingClientRect().top);
      byTop.set(top, [...(byTop.get(top) ?? []), item]);
    }
    const rules = Array.from(document.querySelectorAll('[data-row-rule]')).map((r) => {
      const b = r.getBoundingClientRect();
      return { index: r.getAttribute('data-row-rule'), top: Math.round(b.top), left: Math.round(b.left), right: Math.round(b.right), border: getComputedStyle(r).borderTopWidth };
    });
    return {
      viewport: window.innerWidth,
      rows: [...byTop.entries()].sort((a, b) => a[0] - b[0]).map(([top, group]) => ({
        top,
        itemBorders: group.map((g) => getComputedStyle(g).borderTopWidth),
        rules: rules.filter((r) => Math.abs(r.top - top) <= 1),
      })),
    };
  });

  expect(measured.rows.length, 'rows rendered').toBeGreaterThan(0);

  for (const row of measured.rows) {
    /*
      At least one rule at the row's top, not exactly one: a region row that
      renders no section collapses to nothing and its rule coincides with the
      next row's. Two rules in the same place draw one line; the doubling to
      forbid is two rules a pixel apart, asserted below on every pair.
    */
    expect(row.rules.length, `row at ${row.top}: a rule at its top, found ${JSON.stringify(row.rules)}`).toBeGreaterThanOrEqual(1);
    for (const rule of row.rules) {
      expect(rule.border, `row at ${row.top}: the rule is a hairline`).toBe('1px');
      expect(rule.left, `row at ${row.top}: the rule starts at the composition edge`).toBe(0);
      expect(rule.right, `row at ${row.top}: and runs to it, whatever the row holds`).toBe(measured.viewport);
    }
    for (const border of row.itemBorders) {
      expect(border, `row at ${row.top}: no item carries its own rule -- that would double the line`).toBe('0px');
    }
  }

  /*
    **No doubled hairline anywhere.** Measured before the fix: an empty row's
    rule at 1111 and the next row's at 1112, a 2px line where the page has
    one. Two rules may share a y (an empty row collapsed onto the next) or be
    a full row apart; a pixel apart is the defect.
  */
  const tops = measured.rows.flatMap((r) => r.rules.map((rule) => rule.top));
  for (let i = 0; i < tops.length; i += 1) {
    for (let j = i + 1; j < tops.length; j += 1) {
      const d = Math.abs(tops[i] - tops[j]);
      expect(d === 0 || d > 1, `rules at ${tops[i]} and ${tops[j]} are ${d}px apart: a doubled hairline`).toBe(true);
    }
  }
});

test('draws the bar beside a control-only section, because marking is by schema', async ({
  page,
}) => {
  /**
   * **The ruling that would be easiest to get wrong by building the obvious
   * thing.** On the modal record — 16 of 17 — Images and Journal hold nothing
   * but their controls, and both still carry a bar.
   *
   * Per-record marking would make the mark encode data: a bar appearing when a
   * record has images and vanishing when it does not is an indicator of that
   * fact. A control-only Images section is still where this record's images go.
   */
  const suffix = makeSuffix();
  const id = await modalRecord(page, suffix);
  await page.goto(`/records/${id}`);
  await page.locator('[data-region="extended-grid"] [data-section]').first().waitFor({ timeout: 20_000 });

  const marked = await page.evaluate(() =>
    Array.from(document.querySelectorAll('[data-region="extended-grid"] [data-section]')).map((section) => ({
      name: section.getAttribute('data-section'),
      hasBar: section.querySelector('[data-mark="section-bar"]') !== null,
    })),
  );

  const names = marked.map((row) => row.name);
  expect(names, 'Pressing detail holds nothing on this record').not.toContain('pressing-detail');

  for (const row of marked.filter((r) => r.name === 'images' || r.name === 'journal')) {
    expect(row.hasBar, `${row.name}: control-only, still marked`).toBe(true);
  }
});

test('the bar is 44 × 10 and sits at its section’s own left edge (§26)', async ({ page }) => {
  const suffix = makeSuffix();
  const id = await richRecord(page, suffix);
  await page.setViewportSize({ width: 1440, height: NO_SCROLL_HEIGHT });
  await page.goto(`/records/${id}`);
  await page.locator('[data-mark="section-bar"]').first().waitFor({ timeout: 20_000 });

  const bars = await page.evaluate(() =>
    Array.from(document.querySelectorAll('[data-mark="section-bar"]')).map((bar) => {
      const box = bar.getBoundingClientRect();
      const section = bar.closest('[data-region="extended-grid"] [data-section]')!.getBoundingClientRect();
      return {
        name: bar.closest('[data-region="extended-grid"] [data-section]')!.getAttribute('data-section'),
        offset: Math.round(box.left - section.left),
        w: Math.round(box.width),
        h: Math.round(box.height),
      };
    }),
  );

  expect(bars.length, 'at least one bar').toBeGreaterThan(0);
  for (const bar of bars) {
    expect(bar.w).toBe(MARK_WIDTH);
    expect(bar.h).toBe(MARK_HEIGHT);
    /*
      **Under the label, at the section's own edge.** §9.1 put every bar at
      the page's x = 34 because every label was there; §26's sections start
      at different columns, so the bar follows its own label — which is what
      "a mark at the label column's x" meant.
    */
    expect(bar.offset, `${bar.name}: the bar sits under its label`).toBe(CELL_PADDING);
  }
});

test('renders no empty section, and no diagonal below the fold', async ({ page }) => {
  /**
   * §9.1: an empty section is not rendered at all — no diagonal, no label, no
   * reserved space — and §6's one-diagonal rule does not cross the fold.
   *
   * The asymmetry is exact: above, absence must be drawn because the geometry
   * is fixed and a hole reads as a mistake; below, absence costs nothing to
   * omit and drawing it would be inventing content.
   */
  const suffix = makeSuffix();
  const id = await modalRecord(page, suffix);
  await page.goto(`/records/${id}`);
  await page.locator('[data-region="extended-grid"] [data-section]').first().waitFor({ timeout: 20_000 });

  const below = await page.evaluate(() => {
    const frame = document.querySelector('[data-testid="record-page-8a"]')!;
    const diagonals = Array.from(document.querySelectorAll('[data-diagonal]')).filter(
      (mark) => !frame.contains(mark),
    );
    const empty = Array.from(document.querySelectorAll('[data-region="extended-grid"] [data-section]')).filter((section) => {
      const cells = Array.from(section.querySelectorAll('[data-cell^="content"]'));
      return cells.length > 0 && cells.every((cell) => (cell.textContent ?? '').trim() === '');
    });
    return {
      diagonals: diagonals.length,
      empty: empty.map((section) => section.getAttribute('data-section')),
      all: Array.from(document.querySelectorAll('[data-region="extended-grid"] [data-section]')).map((x) => x.getAttribute('data-section')),
    };
  });

  expect(below.diagonals, 'no diagonal crosses the fold').toBe(0);
  expect(below.empty, `no section renders with empty content (all: ${below.all.join(', ')})`).toEqual([]);
});

test('the journal has one label, because it has no trigger', async ({ page }) => {
  /**
   * **§8.1's rule is now vacuous rather than violated, and that is the claim.**
   *
   * It forbids a form's submit from sharing a label with the trigger that
   * opened it — the frame carried `Add entry` and the section `Save entry`.
   * With the journal cell gone from the frame there is no trigger, so there is
   * only one label and nothing to share.
   *
   * The section keeps its submit: a target without one is a dead end, and the
   * journal is reached by scrolling rather than by a control.
   *
   * **Written as a count over the page**, so it fails if a second entry point
   * reappears anywhere — which is what the original rule was protecting
   * against, one control announced in two places.
   */
  const suffix = makeSuffix();
  const id = await richRecord(page, suffix);
  await page.goto(`/records/${id}`);
  await page.locator('[data-section="journal"]').waitFor({ timeout: 20_000 });

  await expect(
    page.locator('[data-section="journal"]').getByRole('button', { name: 'Save entry' }),
    "the section's submit",
  ).toHaveCount(1);

  await expect(
    page.locator('main').getByText('Add entry', { exact: true }),
    'no trigger anywhere, so no label is shared',
  ).toHaveCount(0);

  await expect(
    page.locator('main').getByText('Save entry', { exact: true }),
    'and the submit is named once',
  ).toHaveCount(1);
});

test('the journal controls are §9.2 rather than browser defaults', async ({ page }) => {
  /**
   * The date field, the textarea and the submit were a shadcn `Input`, a
   * bordered box and a filled `Button` — three vocabularies, none of them §9.2.
   *
   * Asserted on computed geometry rather than class names: a `border-radius`
   * cancelled by an ancestor passes a class check, which is unit 20's breakout
   * defect exactly.
   */
  const suffix = makeSuffix();
  const id = await richRecord(page, suffix);
  await page.goto(`/records/${id}`);
  await page.locator('[data-section="journal"]').waitFor({ timeout: 20_000 });

  const measured = await page.evaluate(() => {
    const scope = document.querySelector('[data-section="journal"]')!;
    const date = scope.querySelector('#entry-date') as HTMLElement | null;
    const note = scope.querySelector('#journal-note') as HTMLElement | null;
    const save = Array.from(scope.querySelectorAll('button')).find(
      (button) => button.textContent?.trim() === 'Save entry',
    );
    const read = (el: HTMLElement | null | undefined) => {
      if (el == null) return null;
      const style = getComputedStyle(el);
      return {
        height: Math.round(el.getBoundingClientRect().height),
        radius: style.borderRadius,
        fontSize: style.fontSize,
        family: style.fontFamily.split(',')[0].replace(/['"]/g, ''),
        bottomBorder: style.borderBottomWidth,
        background: style.backgroundColor,
      };
    };
    return { date: read(date), note: read(note), save: read(save) };
  });

  expect(measured.date, 'the date field renders').not.toBeNull();
  expect(measured.save, 'the submit renders').not.toBeNull();
  if (measured.date === null || measured.save === null || measured.note === null) return;

  /* A ruled field: 34px, no radius, a 1px underline, mono because it takes data. */
  expect(measured.date.height, 'field height').toBe(FIELD_HEIGHT);
  expect(measured.date.radius, 'no radius').toBe('0px');
  expect(measured.date.bottomBorder, 'the 1px rule under the line').toBe('1px');
  expect(measured.date.fontSize, "A67's typed line").toBe(`${TYPED_SIZE}px`);

  /* The textarea takes 16 too: it is a region of text the user types into. */
  expect(measured.note.fontSize, 'the typed line in a region').toBe(`${TYPED_SIZE}px`);

  /* A control: 44px, no radius, no fill. */
  expect(measured.save.height, 'control height').toBe(CONTROL_HEIGHT);
  expect(measured.save.radius, 'no radius').toBe('0px');
  expect(
    measured.save.background,
    'no fill — a filled button would be the only solid non-derived mass',
  ).toMatch(/rgba\(0, 0, 0, 0\)|transparent/);
});

test('no cell overlaps another, at mobile width', async ({ page }) => {
  /**
   * **A section that declares a split must fill it.**
   *
   * `Section` renders one cell per span, so a `pair` or `body` section passing
   * a single child left the second cell empty — and an empty cell is not
   * harmless: at 390px it sat on top of the content beside it and swallowed
   * clicks. `record-detail.spec.ts` caught it as a 30s timeout on a Delete
   * button that was enabled, visible, and motionless, because the failure was
   * neither state nor stability but a hit test.
   *
   * Asserted by hit-testing every interactive element against what is actually
   * on top of it — a geometric overlap check would pass on two cells that
   * merely abut, and the defect is that the wrong one receives the click.
   */
  const suffix = makeSuffix();
  const id = await richRecord(page, suffix);
  /*
    **With a journal entry**, because the first version of this test used a
    record that had none — so the control the defect actually covered was not
    on the page and the test passed against the bug. A fixture that cannot
    contain the defect is the shape this repo has recorded three times.
  */
  await post(page, `/api/records/${id}/journal`, {
    note: `an entry to delete ${suffix}`,
    entryDate: '2024-03-14',
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/records/${id}`);
  await page.locator('[data-region="extended-grid"] [data-section]').first().waitFor({ timeout: 20_000 });

  const blocked = await page.evaluate(() => {
    const out: string[] = [];
    for (const section of Array.from(document.querySelectorAll('[data-region="extended-grid"] [data-section]'))) {
      for (const cell of Array.from(section.querySelectorAll('[data-cell]'))) {
        const bounds = cell.getBoundingClientRect();
        for (const control of Array.from(
          cell.querySelectorAll('button, a, input, select, textarea'),
        )) {
          const box = control.getBoundingClientRect();
          if (box.width === 0 || box.height === 0) continue;

          /*
            **Containment, not a centre-point hit test.** The first version
            sampled each control's centre and passed against the real defect:
            the journal's Delete button overflowed its 193px cell at 390px, but
            its CENTRE still landed on itself — only the part past the cell edge
            was over the neighbour. A control that leaves its cell is covered
            wherever it overlaps, which a single point cannot see.
          */
          if (box.right > bounds.right + 1 || box.left < bounds.left - 1) {
            out.push(
              `${section.getAttribute('data-section')}: ${control.tagName} ` +
                `[${Math.round(box.left)}..${Math.round(box.right)}] escapes ` +
                `${cell.getAttribute('data-cell')} [${Math.round(bounds.left)}..${Math.round(bounds.right)}]`,
            );
          }
        }
      }
    }
    return out;
  });

  expect(blocked, `controls escaping their cell:\n${blocked.join('\n')}`).toEqual([]);
});

test('renders exactly one cell per span in its split', async ({ page }) => {
  /*
    The structural half of the same defect, checked directly: a `pair` section
    has two content cells and a `one` section has one. A section passing fewer
    children than its split declares gets an empty cell it did not intend.
  */
  const suffix = makeSuffix();
  const id = await richRecord(page, suffix);
  await page.goto(`/records/${id}`);
  await page.locator('[data-region="extended-grid"] [data-section]').first().waitFor({ timeout: 20_000 });

  const sections = await page.evaluate(() =>
    Array.from(document.querySelectorAll('[data-region="extended-grid"] [data-section]')).map((section) => ({
      name: section.getAttribute('data-section'),
      shape: section.getAttribute('data-shape'),
      cells: section.querySelectorAll('[data-cell^="content"]').length,
      empty: Array.from(section.querySelectorAll('[data-cell^="content"]')).filter(
        (cell) => (cell.textContent ?? '').trim() === '' && cell.children.length === 0,
      ).length,
    })),
  );

  const expected: Record<string, number> = { one: 1, pair: 2, body: 2 };

  for (const section of sections) {
    expect(section.cells, `${section.name} (${section.shape}) cell count`).toBe(
      expected[section.shape ?? ''],
    );
    expect(section.empty, `${section.name} renders no empty cell`).toBe(0);
  }
});

test('ornament sits behind everything, structurally rather than per element', async ({ page }) => {
  /**
   * **The stacking layer moved from the cell to the SECTION (§26).**
   *
   * §25 sizes a figure at 0.855 of the SECTION's height, and a percentage
   * resolves against the positioned ancestor — so the section must be it.
   * §26 puts the clip there too: "each figure's clip is its own cell, so it
   * can never enter another". The cells inside a section hold content and
   * carry no layer of their own.
   *
   * The second half is unchanged and is the defect this replaced: nothing
   * inside lifts itself. A list of things to raise is a list someone has to
   * keep complete, and it failed as three patches before it went structural.
   */
  const suffix = makeSuffix();
  const id = await richRecord(page, suffix);
  await page.goto(`/records/${id}`);
  await page.locator('[data-region="extended-grid"] [data-section]').first().waitFor({ timeout: 20_000 });

  const layer = await page.evaluate(() => {
    const hosts = Array.from(document.querySelectorAll('[data-region="extended-grid"] [data-section], [data-cell="air"]'));
    const wrong = hosts
      .map((host) => {
        const style = getComputedStyle(host);
        return {
          name: host.getAttribute('data-section') ?? 'air',
          position: style.position,
          isolation: style.isolation,
          overflow: style.overflow,
        };
      })
      .filter(
        (row) =>
          row.position !== 'relative' || row.isolation !== 'isolate' || row.overflow !== 'hidden',
      );

    /* Anything inside that lifts itself — the defect this replaces. */
    const lifted: string[] = [];
    for (const host of hosts) {
      for (const node of Array.from(host.querySelectorAll('*'))) {
        if (node.getAttribute('data-ornament') !== null) continue;
        const z = getComputedStyle(node).zIndex;
        if (z !== 'auto' && z !== '0') lifted.push(`${node.tagName} z-index:${z}`);
      }
    }
    return { hosts: hosts.length, wrong, lifted };
  });

  expect(layer.hosts, 'sections and air rendered').toBeGreaterThan(0);
  expect(
    layer.wrong,
    `row items missing the structural layer:\n${JSON.stringify(layer.wrong, null, 2)}`,
  ).toEqual([]);
  expect(
    layer.lifted,
    `elements lifting themselves instead of relying on flow:\n${layer.lifted.join('\n')}`,
  ).toEqual([]);
});

test('no ornament covers a control or a ruled field', async ({ page }) => {
  /**
   * §9.2's clearance, checked on the rendering rather than on the placement
   * rule: no solid may intersect a control's box or come within half a column.
   *
   * **Measured as overlap in both directions**, because the failure mode is a
   * solid painting over an underline — which is what the first version of the
   * drawing did to 120px of the Date field. A test asserting only "ornament is
   * behind" would pass on a solid sitting exactly on top of a field at a lower
   * layer, and the reader still cannot see the underline.
   */
  const suffix = makeSuffix();
  const id = await richRecord(page, suffix);
  await page.goto(`/records/${id}`);
  await page.locator('[data-region="extended-grid"] [data-section]').first().waitFor({ timeout: 20_000 });

  const collisions = await page.evaluate(() => {
    const CLEARANCE = 60;
    const out: string[] = [];
    const solids = Array.from(document.querySelectorAll('[data-region="extended-grid"] [data-ornament="figure"]'));
    const controls = Array.from(
      document.querySelectorAll('[data-region="extended-grid"] [data-section] button, [data-region="extended-grid"] [data-section] input, [data-region="extended-grid"] [data-section] select, [data-region="extended-grid"] [data-section] textarea, [data-region="extended-grid"] [data-section] a'),
    );

    for (const solid of solids) {
      const s = solid.getBoundingClientRect();
      for (const control of controls) {
        const c = control.getBoundingClientRect();
        if (c.width === 0 || c.height === 0) continue;

        const gapX = Math.max(c.left - s.right, s.left - c.right);
        const gapY = Math.max(c.top - s.bottom, s.top - c.bottom);
        const clear = Math.max(gapX, gapY);

        if (clear < CLEARANCE) {
          out.push(
            `${control.tagName} is ${Math.round(clear)}px from a solid (needs ${CLEARANCE})`,
          );
        }
      }
    }
    return out;
  });

  expect(collisions, `ornament too close to a control:\n${collisions.join('\n')}`).toEqual([]);

  /*
    **And the check was not vacuous.** A clearance test passes trivially when no
    solid renders at all, which is the state this whole subsection is one
    mistake away from — the first gate permitted zero positions while the
    drawing showed two.
  */
  const solids = await page.locator('[data-ornament="figure"]').count();
  expect(solids, 'figures actually rendered, so the clearance was tested').toBeGreaterThan(0);
});

test('the region caps with the frame, so the page is one grid', async ({ page }) => {
  /**
   * **§9.1's boundaries bleed to the COMPOSITION's edge — the viewport up to
   * the cap, the capped container beyond it.**
   *
   * Measured on the REGION rather than on each section: §26 gives sections
   * spans of their row, so Pressing detail is 7 of 12 columns and only the
   * region itself is the composition's width. The claim is unchanged — the
   * page is one grid rendered at one width — and what moved is which box
   * carries it.
   *
   * **Measured wide, because at 1440 the region and the viewport are
   * identical and the defect is invisible** — which is why it shipped.
   */
  const suffix = makeSuffix();
  const id = await richRecord(page, suffix);

  for (const width of [1440, GRID_FORK, 2560, 3440]) {
    await page.setViewportSize({ width, height: NO_SCROLL_HEIGHT });
    await page.goto(`/records/${id}`);
    await page.locator('[data-region="extended-grid"] [data-section]').first().waitFor({ timeout: 20_000 });

    const measured = await page.evaluate(() => {
      const frame = document.querySelector('[data-testid="record-page-8a"]')!.getBoundingClientRect();
      const region = document.querySelector('[data-region="extended-grid"]')!.getBoundingClientRect();
      const sections = Array.from(document.querySelectorAll('[data-region="extended-grid"] [data-section]')).map((section) => {
        const box = section.getBoundingClientRect();
        return { name: section.getAttribute('data-section'), left: Math.round(box.left), right: Math.round(box.right) };
      });
      return {
        frame: { left: Math.round(frame.left), width: Math.round(frame.width) },
        region: { left: Math.round(region.left), width: Math.round(region.width) },
        sections,
      };
    });

    /* §30: the page takes the window to a 1920 ceiling, not a flat 1440 cap. */
    const expected = pageWidthAt(width);

    expect(measured.frame.width, `frame at ${width}`).toBe(expected);
    expect(measured.region.width, `region at ${width}`).toBe(expected);
    expect(measured.region.left, `region left at ${width}`).toBe(measured.frame.left);

    /* And every section lies inside that measure — no row item escapes the grid. */
    for (const section of measured.sections) {
      expect(section.left, `${section.name} at ${width} starts inside the region`).toBeGreaterThanOrEqual(measured.region.left);
      expect(section.right, `${section.name} at ${width} ends inside it`).toBeLessThanOrEqual(measured.region.left + measured.region.width);
    }
  }
});

/**
 * Every row item — sections AND air columns — with the ornament it carries.
 *
 * §26 puts the pair in Pressing detail's AIR rather than in the section, so a
 * helper walking `[data-section]` alone cannot see it, and "no section
 * carries two figures" would pass on a page whose pair never rendered.
 */
const figureSections = (
  page: Page,
): Promise<Array<{ name: string; kind: string; figures: number; flats: Array<string | null> }>> =>
  page.evaluate(() =>
    Array.from(document.querySelectorAll('[data-region="extended-grid"] [data-section], [data-cell="air"]')).map((item) => ({
      name: item.getAttribute('data-section') ?? 'air',
      kind: item.hasAttribute('data-section') ? 'section' : 'air',
      figures: item.querySelectorAll('[data-ornament="figure"]').length,
      flats: Array.from(item.querySelectorAll('[data-ornament="flat"]')).map((f) => f.getAttribute('data-flat')),
    })),
  );

test('places figures only where §26 does, never in consecutive sections', async ({ page }) => {
  const suffix = makeSuffix();
  const id = await richRecord(page, suffix);
  await page.goto(`/records/${id}`);
  /* Attached and settled, not visible: §58 hosts the solo in a column that may leave it below §29's bound and hidden; what this test reads survives that. */
  await page.locator('[data-region="extended-grid"] [data-ornament="figure"]').first().waitFor({ state: 'attached', timeout: 20_000 });
  await page.waitForFunction(`Array.from(document.querySelectorAll('[data-region="extended-grid"] [data-ornament="figure"]')).every((f) => f.getAttribute('data-figure-state') !== 'measuring')`, undefined, { timeout: 10_000 });

  const placed = await figureSections(page);
  const carrying = placed.filter((row) => row.figures > 0).map((row) => row.name);

  /* The positive half first, or the exclusions below pass on a page with no ornament. */
  expect(carrying, 'the solo in Price history').toContain('price-history');
  expect(carrying, 'the pair in Pressing detail’s air column').toContain('air');
  /* Two figures on the page and no more — §26 places two in eight sections. */
  expect(placed.reduce((sum, row) => sum + row.figures, 0), 'two figures in all').toBe(2);
  const ruled = new Set([...Object.keys(FIGURES).map((key) => key.split(':')[0]), 'air']);
  for (const name of carrying) expect(ruled.has(name), `${name} is one of §26's two hosts`).toBe(true);
  for (const row of placed) expect(row.figures, `${row.name}: one figure at most`).toBeLessThanOrEqual(1);

  /* Never consecutive, in the page's own order. */
  for (let i = 1; i < placed.length; i++) {
    expect(placed[i].figures > 0 && placed[i - 1].figures > 0, `${placed[i - 1].name} then ${placed[i].name}: consecutive figures`).toBe(false);
  }
  /* And §9.4's fill is withdrawn by §26's flats. */
  expect(await page.locator('[data-ornament="fill"]').count(), 'no full fill anywhere').toBe(0);
});

test('the pair is 0.855 of its air column, shows two-thirds, and is cut by its foot alone; the solo sits inside the strip on its inset (§57)', async ({ page }) => {
  /**
   * **The size rule is the gate itself.** Height is the governed term and it
   * is the SECTION's; the visible part is exactly the two-thirds ceiling and
   * the rest bleeds below the cell's foot. Measured at four viewports because
   * the size must track the section and not the window.
   *
   * **Clipping is a boundary, not a treatment**: the clip is the figure's own
   * cell, and a figure is cut by at most one edge — its foot. A second cut
   * edge reads as a figure too big for its box.
   *
   * **§57 takes the Price history solo out of the section rule**: it is sized
   * to the strip's free height below its entries and drawn only where that
   * clears §29's bound, so here it is asserted inside the strip, on the
   * inset, cut by no edge, or not shown at all. Its size against the entries
   * is `figures-type-57.spec.ts`'s.
   */
  const suffix = makeSuffix();
  const id = await richRecord(page, suffix);

  for (const width of [1440, GRID_FORK, 2560, 3440]) {
    await page.setViewportSize({ width, height: NO_SCROLL_HEIGHT });
    await page.goto(`/records/${id}`);
    /* Attached, not visible: §57 hides a figure over type or under §29's bound, and the solo is served measuring. */
    await page.locator('[data-region="extended-grid"] [data-ornament="figure"]').first().waitFor({ state: 'attached', timeout: 20_000 });
    await page.waitForFunction(`Array.from(document.querySelectorAll('[data-region="extended-grid"] [data-ornament="figure"]')).every((f) => f.getAttribute('data-figure-state') !== 'measuring')`, undefined, { timeout: 10_000 });
    await page.waitForTimeout(250);

    const figures = await page.evaluate(() =>
      Array.from(document.querySelectorAll('[data-region="extended-grid"] [data-ornament="figure"]')).map((figure) => {
        /*
          §26 makes the host the SECTION or the AIR column, not a cell inside
          one: a figure's clip is its own cell in §26's sense, which is the
          row item it belongs to.
        */
        const host = figure.closest('[data-region="extended-grid"] [data-section], [data-cell="air"]')!;
        const f = figure.getBoundingClientRect();
        const c = host.getBoundingClientRect();
        return {
          name: host.getAttribute('data-section') ?? 'air',
          kind: figure.getAttribute('data-figure'),
          state: figure.getAttribute('data-figure-state'),
          shown: getComputedStyle(figure).display !== 'none',
          sectionHeight: c.height,
          sectionBottom: c.bottom,
          bottom: f.bottom,
          height: f.height,
          width: f.width,
          visible: Math.max(0, Math.min(f.bottom, c.bottom) - Math.max(f.top, c.top)),
          cutEdges: [f.top < c.top, f.bottom > c.bottom, f.left < c.left, f.right > c.right].filter(Boolean).length,
          cutFoot: f.bottom > c.bottom,
        };
      }),
    );
    expect(figures.length, `figures at ${width}`).toBeGreaterThan(0);

    for (const figure of figures) {
      const label = `${figure.name} (${figure.kind}) at ${width}: ${Math.round(figure.height)}px in a ${Math.round(figure.sectionHeight)}px section`;
      if (figure.name === 'price-history') {
        expect(['drawn', 'below-bound'], `${label}: §57 sizes the solo by its free height, drawn or not`).toContain(figure.state);
        if (!figure.shown) continue;
        expect(figure.cutEdges, `${label}: inside the strip, cut by no edge`).toBe(0);
        expect(figure.sectionBottom - figure.bottom, `${label}: on the strip's inset`).toBeCloseTo(CELL_PADDING, 0);
        expect(figure.height / figure.sectionHeight, `${label}: not the section rule`).not.toBeCloseTo(SIZE_RATIO, 2);
        continue;
      }
      expect(figure.height / figure.sectionHeight, label).toBeCloseTo(SIZE_RATIO, 2);
      expect(figure.visible / figure.sectionHeight, `${label}: visible`).toBeCloseTo(GATE_RATIO, 2);
      expect(figure.cutFoot, `${label}: bleeds below the foot`).toBe(true);
      /*
        **Figures only** (step 28): "Apply the one-edge clip to figures only.
        Flats follow §21: the quarter-disc bleeds off the page edge and is
        never cut by its host cell." This loop reads
        `[data-ornament="figure"]`, so flats are out of scope by
        construction — and the converse is asserted below.
      */
      expect(figure.cutEdges, `${label}: cut by one edge only`).toBe(1);

      /* Width follows the figure's projected box, never a constant. */
      const spec =
        figure.name === 'air'
          ? FIGURES['pressing-detail:air']
          : FIGURES[`${figure.name}:strip`] ?? FIGURES[`${figure.name}:air`];
      expect(spec, `${figure.name} is a ruled figure`).toBeDefined();
      if (spec === undefined) continue;
      const box = figureBox(spec);
      expect(figure.width / figure.height, `${label}: aspect`).toBeCloseTo(box.width / box.height, 1);
    }
  }
});

test('a figure’s faces are the ladder’s top, base and shade; a flat is tint or base (§25, §26)', async ({ page }) => {
  /**
   * §26's four steps on the route: a solid's top at 0.745 (a face only), base
   * on the left, shade on the right — three different fills at opacity 1,
   * never the §5.1 opacity variant. The flat beside About this record is one
   * fill at BASE and carries no face. The matrix keeps its own greys (§5).
   */
  const suffix = makeSuffix();
  const id = await richRecord(page, suffix);
  await page.goto(`/records/${id}`);
  /* Attached and settled, not visible: §58 hosts the solo in a column that may leave it below §29's bound and hidden; what this test reads survives that. */
  await page.locator('[data-region="extended-grid"] [data-ornament="figure"]').first().waitFor({ state: 'attached', timeout: 20_000 });
  await page.waitForFunction(`Array.from(document.querySelectorAll('[data-region="extended-grid"] [data-ornament="figure"]')).every((f) => f.getAttribute('data-figure-state') !== 'measuring')`, undefined, { timeout: 10_000 });

  const drawn = await page.evaluate(() => {
    const read = (el: Element) => getComputedStyle(el);
    const figures = Array.from(document.querySelectorAll('[data-region="extended-grid"] [data-ornament="figure"]')).map((svg) => ({
      section: svg.closest('[data-region="extended-grid"] [data-section]')?.getAttribute('data-section') ?? '?',
      faces: Array.from(svg.querySelectorAll('polygon')).map((p) => ({
        face: p.getAttribute('data-face'),
        fill: read(p).fill,
        opacity: read(p).opacity,
      })),
    }));
    const flats = Array.from(document.querySelectorAll('[data-region="extended-grid"] [data-ornament="flat"]')).map((el) => ({
      shape: el.getAttribute('data-flat'),
      section: el.closest('[data-region="extended-grid"] [data-section]')?.getAttribute('data-section') ?? '?',
      fill: read(el).backgroundColor,
      polygons: el.querySelectorAll('polygon').length,
    }));
    const bar = document.querySelector('[data-mark="section-bar"]');
    const matrix = document.querySelector('[data-mark="matrixSolid"]');
    return {
      figures,
      flats,
      /* The section bar is the record's BASE on the route: the flat must match it. */
      base: bar === null ? null : read(bar).backgroundColor,
      matrix: matrix === null ? null : Array.from(matrix.querySelectorAll('polygon')).map((p) => read(p).fill),
    };
  });

  expect(drawn.figures.length, 'the region draws figures at all').toBeGreaterThan(0);
  for (const figure of drawn.figures) {
    const byFace = new Map(figure.faces.map((f) => [f.face, f.fill]));
    expect([...byFace.keys()].sort(), `${figure.section}: the three faces`).toEqual(['base', 'shade', 'top']);
    expect(new Set(byFace.values()).size, `${figure.section}: three DIFFERENT fills`).toBe(3);
    expect(byFace.get('base'), `${figure.section}: the left face is the record's base, as the bar is`).toBe(drawn.base);
    for (const f of figure.faces) expect(Number(f.opacity), `${figure.section}: §5.1 forbids an opacity variant`).toBe(1);
  }

  const disc = drawn.flats.find((f) => f.shape === 'quarterDisc');
  expect(disc, 'the base quarter-disc renders').toBeDefined();
  /* §53 (steps 60b, 61): the lower About row is gone; the disc's host is Images. */
  expect(disc?.section, 'beside Images').toBe('images');
  expect(disc?.polygons, 'one fill, no faces').toBe(0);
  expect(disc?.fill, 'at BASE').toBe(drawn.base);

  if (drawn.matrix !== null) {
    expect(new Set(drawn.matrix).size, 'the matrix has three tones of its own').toBe(3);
    for (const fill of drawn.matrix) expect(fill, 'grey, never the record’s colour').toMatch(/0\.004 80|rgb\((\d+), \1, /);
  }
});

test('the quarter-disc is sized against §60’s reference within §29’s bounds and §59’s caption, and bleeds off the right page edge', async ({ page }) => {
  /**
   * **§29: a flat's size follows its host, and no section fixes it at 150.**
   *
   * The specimen's "r 150" is one drawn instance on a sheet. The visible
   * part is at most two-thirds of the host's HEIGHT and at most a quarter of
   * the section's WIDTH, whichever is smaller — so on the About section it
   * is whichever bound binds, and on a record with no snippet (a 104px host)
   * it is 69 rather than 150.
   *
   * Measured as a quadrant: a full disc centred on the host's bottom-right
   * corner, so the host's clip shows one quarter and the page edge masks the
   * rest. That is how "more than a third outside" is made rather than drawn.
   */
  const suffix = makeSuffix();
  const id = await richRecord(page, suffix);
  await page.setViewportSize({ width: 1440, height: NO_SCROLL_HEIGHT });
  await page.goto(`/records/${id}`);
  await page.locator('[data-region="extended-grid"] [data-ornament="flat"]').first().waitFor({ timeout: 20_000 });
  /* §59, §60: the disc measures in the browser; read it settled, not at the CSS bounds it is served at. */
  await page.waitForFunction(`document.querySelector('[data-flat="quarterDisc"]')?.getAttribute('data-disc-state') !== 'measuring'`, undefined, { timeout: 10_000 });

  const disc = await page.evaluate((referenceJs) => {
    const el = document.querySelector('[data-flat="quarterDisc"]');
    if (el === null) return null;
    const d = el.getBoundingClientRect();
    const hostEl = el.closest('[data-region="extended-grid"] [data-section], [data-cell="air"]')!;
    const host = hostEl.getBoundingClientRect();
    const frame = document.querySelector('[data-testid="record-page-8a"]')!.getBoundingClientRect();
    /* §60: the height term is against the stated reference, not the host's rendering; §59: and the free height below the caption in the disc's reach. */
    const reference = (new Function('return ' + referenceJs)() as (sec: Element) => { reference: number })(hostEl).reference;
    const sized = Math.min(reference * (2 / 3), host.width / 4);
    let lowest = host.top;
    for (const t of Array.from(hostEl.querySelectorAll('*'))) {
      if (t.closest('[aria-hidden="true"]') !== null) continue;
      for (const n of Array.from(t.childNodes)) {
        if (n.nodeType !== Node.TEXT_NODE || (n.textContent ?? '').trim() === '') continue;
        const range = document.createRange(); range.selectNodeContents(n);
        for (const g of Array.from(range.getClientRects())) if (g.width > 0 && g.right > host.right - sized) lowest = Math.max(lowest, g.bottom);
      }
    }
    return {
      reference,
      free: host.bottom - lowest,
      width: d.width,
      radius: getComputedStyle(el).borderRadius,
      visibleWidth: Math.max(0, Math.min(d.right, host.right) - Math.max(d.left, host.left)),
      visibleHeight: Math.max(0, Math.min(d.bottom, host.bottom) - Math.max(d.top, host.top)),
      hostHeight: host.height,
      hostWidth: host.width,
      hostEndsAtPageEdge: Math.abs(host.right - frame.right) < 1,
    };
  }, DISC_REFERENCE_JS);
  expect(disc, 'the disc renders').not.toBeNull();
  if (disc === null) return;

  expect(disc.radius, 'a disc, not a box').toBe('50%');
  expect(disc.hostEndsAtPageEdge, 'its host ends at the page edge, so the mask is the page edge').toBe(true);

  /*
    §29's two bounds, whichever is smaller. Within 1.5px: the percentage
    resolves against the host's padding box, which excludes its 1px top
    rule, so two-thirds of it is a fraction of a pixel under two-thirds of
    the border box the test measures.
  */
  const bound = Math.min(disc.reference * (2 / 3), disc.hostWidth * (1 / 4), disc.free);
  expect(disc.visibleWidth, `visible radius against §29's bound on a reference of ${Math.round(disc.reference)} (§60) with ${Math.round(disc.free)} free below the caption (§59), host ${Math.round(disc.hostHeight)} tall`).toBeGreaterThan(bound - 1.5);
  expect(disc.visibleWidth, 'and never over it').toBeLessThanOrEqual(bound + 0.5);
  expect(disc.visibleHeight, 'and the same up the page').toBeGreaterThan(bound - 1.5);
  /* Exactly one quadrant: the disc is twice the visible radius on each axis. */
  expect(disc.width, 'the whole disc is twice what shows').toBeGreaterThan(bound * 2 - 3);
  expect(disc.visibleWidth, 'more than a third lies outside').toBeLessThan(disc.width * (2 / 3));
});

test('§26 and §21: BOTH flats bleed off a page edge, a third or more outside', async ({ page }) => {
  /**
   * **§26 states the placement with the bleed in it:** "The tint triangle
   * bleeds off the left edge in that column; the base quarter-disc bleeds
   * off the right edge beside About this record."
   *
   * §21 gives the threshold: "a field bleeds at a page edge, never at a cell
   * edge, and **at least a third of it lies outside the frame**... A third
   * is a threshold, not a measurement... large enough that no reader wonders
   * whether the shape was cut."
   *
   * Both clauses apply to both flats. An earlier version of this test
   * asserted the triangle does NOT bleed, on the strength of §26's VALUE
   * paragraph — "tint to the triangle on the left edge in the last row" —
   * which omits the bleed the placement paragraph states. The section says
   * the triangle twice and only once completely.
   */
  const suffix = makeSuffix();
  const id = await richRecord(page, suffix);
  await page.setViewportSize({ width: 1440, height: NO_SCROLL_HEIGHT });
  await page.goto(`/records/${id}`);
  await page.locator('[data-region="extended-grid"] [data-ornament="flat"]').first().waitFor({ timeout: 20_000 });

  const flats = await page.evaluate(() => {
    const frame = document.querySelector('[data-testid="record-page-8a"]')!.getBoundingClientRect();
    return Array.from(document.querySelectorAll('[data-region="extended-grid"] [data-ornament="flat"]'))
      .filter((el) => el.getClientRects().length > 0)
      .map((el) => {
        const b = el.getBoundingClientRect();
        const host = el.closest('[data-region="extended-grid"] [data-section], [data-cell="air"]')!.getBoundingClientRect();
        const outside = Math.max(0, frame.left - b.left) + Math.max(0, b.right - frame.right);
        return {
          shape: el.getAttribute('data-flat'),
          bleedsLeft: b.left < frame.left - 0.5,
          bleedsRight: b.right > frame.right + 0.5,
          outsideFraction: b.width > 0 ? outside / b.width : 0,
          /* Its host must reach the page edge it bleeds at, or the cut is a CELL edge (§21). */
          hostOnPageEdge: Math.abs(host.left - frame.left) < 1 || Math.abs(host.right - frame.right) < 1,
        };
      });
  });

  expect(flats.map((f) => f.shape).sort(), 'both flats render').toEqual(['quarterDisc', 'triangle']);

  for (const flat of flats) {
    expect(flat.bleedsLeft || flat.bleedsRight, `${flat.shape} bleeds off a page edge (§26)`).toBe(true);
    expect(flat.hostOnPageEdge, `${flat.shape} bleeds at a PAGE edge, never a cell edge (§21)`).toBe(true);
    expect(flat.outsideFraction, `${flat.shape}: at least a third outside the frame (§21)`).toBeGreaterThanOrEqual(1 / 3);
  }

  /* And they leave by opposite edges, which is what §26's cleared column is for. */
  expect(flats.find((f) => f.shape === 'triangle')!.bleedsLeft, 'the tint triangle leaves by the LEFT').toBe(true);
  expect(flats.find((f) => f.shape === 'quarterDisc')!.bleedsRight, 'the base quarter-disc by the RIGHT').toBe(true);
});

/**
 * **§53 (step 61): the disc's host on every record at every width.** "Assert
 * on every record at 390, 768, 1000, 1439, 1440, 1680 and 1920 that the
 * disc's host is Images, at the page's right edge, in a row above the
 * triangle's, and within §29's bound; any width where it is not is a
 * failure, not a suppression." Before 60b the model still held the images
 * row as a pair and gave its surplus to air on the right above the fork, so
 * the host left the page edge at 1680 and 1920 (NOTES, step 61 measured).
 */
test('§53, §59, §60: the quarter-disc is hosted by Images, at the page’s right edge, above the triangle’s row, within §29’s bound against the stated reference and below its caption, on every record at seven widths', async ({ page }) => {
  test.setTimeout(900_000);
  await login(page);
  const WIDTHS = [390, 768, 1000, 1439, 1440, 1680, 1920];
  const bad: string[] = [];
  const report: string[] = [];
  for (const r of readSeventeen()) {
    await page.setViewportSize({ width: WIDTHS[0], height: 844 });
    await page.goto(`/records/${r.id}`);
    await page.locator('[data-region="extended-grid"]').waitFor({ timeout: 20_000 });
    const line: string[] = [];
    for (const w of WIDTHS) {
      await page.setViewportSize({ width: w, height: w < 480 ? 844 : NO_SCROLL_HEIGHT });
      await page.waitForTimeout(250);
      const m = await page.evaluate((referenceJs) => {
        const R = (el: Element) => el.getBoundingClientRect();
        const disc = document.querySelector('[data-region="extended-grid"] [data-flat="quarterDisc"]');
        const tri = document.querySelector('[data-region="extended-grid"] [data-flat="triangle"]');
        const frame = document.querySelector('[data-testid="record-page-8a"]');
        if (!disc || !frame) return null;
        const host = disc.closest('[data-region="extended-grid"] [data-section], [data-cell="air"]');
        if (!host) return null;
        const h = R(host); const d = R(disc); const f = R(frame);
        /* §44: the region has no air below 960 and the triangle rides the upper air from 960, so the region's triangle is laid out only above the fork; an undrawn one has no row to be above. */
        const triDrawn = tri !== null && tri.getClientRects().length > 0 && R(tri).width > 0;
        const triHost = triDrawn ? tri.closest('[data-region="extended-grid"] [data-section], [data-cell="air"]') : null;
        /* §60: §29's height term is against the stated reference, not the host's rendering; §59: the disc yields to its caption -- the free height below the lowest glyph within the disc's reach at that size. */
        const reference = (new Function('return ' + referenceJs)() as (sec: Element) => { reference: number })(host).reference;
        const sized = Math.min(reference * (2 / 3), h.width / 4);
        let lowest = h.top;
        for (const el of Array.from(host.querySelectorAll('*'))) {
          if (el.closest('[aria-hidden="true"]') !== null) continue;
          for (const n of Array.from(el.childNodes)) {
            if (n.nodeType !== Node.TEXT_NODE || (n.textContent ?? '').trim() === '') continue;
            const range = document.createRange(); range.selectNodeContents(n);
            for (const g of Array.from(range.getClientRects())) if (g.width > 0 && g.right > h.right - sized) lowest = Math.max(lowest, g.bottom);
          }
        }
        return { host: host.getAttribute('data-section') ?? host.getAttribute('data-cell'), hostRight: h.right, frameRight: f.right, hostTop: h.top, triangleTop: triHost ? R(triHost).top : null, hostW: h.width, hostH: h.height, reference, free: h.bottom - lowest, visible: Math.max(0, Math.min(d.right, h.right) - Math.max(d.left, h.left)), drawn: d.width > 0 };
      }, DISC_REFERENCE_JS);
      const where = `${r.title.split(':')[0]} @${w}`;
      if (m === null) { bad.push(`${where}: no disc, or no host`); line.push(`${w}: none`); continue; }
      /* §29's two bounds with the height one against §60's reference, and §59's third: the free height below the caption in the disc's reach. */
      const bound = Math.min(m.reference * (2 / 3), m.hostW / 4, m.free);
      if (m.host !== 'images') bad.push(`${where}: hosted by ${m.host}, not Images`);
      if (Math.abs(m.hostRight - m.frameRight) >= 1) bad.push(`${where}: the host ends at ${m.hostRight.toFixed(1)}, the page at ${m.frameRight.toFixed(1)}`);
      if (m.triangleTop !== null && !(m.hostTop < m.triangleTop)) bad.push(`${where}: the host's row is not above the triangle's`);
      if (m.visible > bound + 0.5) bad.push(`${where}: visible radius ${m.visible.toFixed(1)} is over §29's bound ${bound.toFixed(1)}`);
      if (m.visible < Math.min(bound, 150) - 1.5) bad.push(`${where}: visible radius ${m.visible.toFixed(1)} is under the bound ${Math.min(bound, 150).toFixed(1)} it should fill`);
      line.push(`${w}: ${m.host} ${Math.round(m.hostW)}×${Math.round(m.hostH)} ref ${Math.round(m.reference)} r${m.visible.toFixed(0)}/${Math.min(bound, 150).toFixed(0)}${m.free < Math.min(m.reference * (2 / 3), m.hostW / 4) ? ` (caption: ${m.free.toFixed(0)} free)` : ''}${m.triangleTop === null ? ' (only flat)' : ''}`);
    }
    report.push(`${r.title.split(':')[0]}: ${line.join(' · ')}`);
  }
  console.log(`  §53 QUARTER-DISC HOST:\n    ${report.join('\n    ')}`);
  expect(report).toHaveLength(readSeventeen().length);
  expect(bad, `the disc's host:\n  ${bad.join('\n  ')}`).toEqual([]);
});

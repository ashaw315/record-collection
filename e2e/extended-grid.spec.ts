import { expect, test, type Page } from '@playwright/test';
import { registerCleanup, trackArtist } from './cleanup';
import { seedImage } from './seed';
import { getTestDb } from '../test/helpers/db';
import { sql } from 'drizzle-orm';
import { GRID_FORK } from '../src/app/records/[id]/band-geometry';
import { FIGURES, GATE_RATIO, SIZE_RATIO, figureBox } from '../src/app/records/[id]/ornament';
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

test('every section is on the same twelve columns', async ({ page }) => {
  /**
   * **The alignment the columns exist for.** A rail gave every section one
   * shared x; twelve columns give every CELL EDGE a shared x, which is what
   * lets sections of different shapes sit under one another without drifting.
   *
   * Asserted as: every cell edge in the region falls on a column boundary. A
   * section on its own grid passes nothing here, and a section using a fourth
   * split fails on the boundary its span does not reach.
   */
  const suffix = makeSuffix();
  const id = await richRecord(page, suffix);
  await page.setViewportSize({ width: 1440, height: NO_SCROLL_HEIGHT });
  await page.goto(`/records/${id}`);
  await page.locator('[data-section]').first().waitFor({ timeout: 20_000 });

  const measured = await page.evaluate(() => {
    const column = window.innerWidth / 12;
    return Array.from(document.querySelectorAll('[data-section]')).map((section) => ({
      name: section.getAttribute('data-section'),
      shape: section.getAttribute('data-shape'),
      edges: Array.from(section.querySelectorAll('[data-cell]')).map((cell) => {
        const box = cell.getBoundingClientRect();
        return { left: box.left / column, right: box.right / column };
      }),
    }));
  });

  expect(measured.length, 'sections rendered').toBeGreaterThan(0);

  for (const section of measured) {
    for (const edge of section.edges) {
      /* Within a tenth of a column: sub-pixel rounding, not a different grid. */
      expect(
        Math.abs(edge.left - Math.round(edge.left)),
        `${section.name} (${section.shape}) left edge at column ${edge.left.toFixed(2)}`,
      ).toBeLessThan(0.1);
      expect(
        Math.abs(edge.right - Math.round(edge.right)),
        `${section.name} (${section.shape}) right edge at column ${edge.right.toFixed(2)}`,
      ).toBeLessThan(0.1);
    }
  }
});

test('the label takes the first two columns on every section', async ({ page }) => {
  /*
    The label survives the rail as a SPAN. Its x is a column edge rather than an
    invented one, which is what lines it up with the identity cell above.
  */
  const suffix = makeSuffix();
  const id = await richRecord(page, suffix);
  await page.setViewportSize({ width: 1440, height: NO_SCROLL_HEIGHT });
  await page.goto(`/records/${id}`);
  await page.locator('[data-section]').first().waitFor({ timeout: 20_000 });

  const labels = await page.evaluate(() => {
    const column = window.innerWidth / 12;
    return Array.from(document.querySelectorAll('[data-section]')).map((section) => {
      const label = section.querySelector('[data-cell="label"]');
      if (label === null) return null;
      const box = label.getBoundingClientRect();
      return {
        name: section.getAttribute('data-section'),
        startColumn: Math.round(box.left / column),
        spanColumns: Math.round(box.width / column),
      };
    });
  });

  for (const label of labels) {
    expect(label, 'every section has a label cell').not.toBeNull();
    if (label === null) continue;
    expect(label.startColumn, `${label.name} starts at column 0`).toBe(0);
    expect(label.spanColumns, `${label.name} spans two`).toBe(LABEL_SPAN);
  }
});

test('rules every cell but the last in each section', async ({ page }) => {
  /**
   * **The thing a rail structurally could not do.** A rail has one edge; a grid
   * has as many as it has cells. §2.1 draws a 1px vertical on the right of
   * every cell but the last, and the region now divides horizontally the way
   * the frame does.
   *
   * The "but the last" half matters: a rule on the final cell would sit on the
   * composition's edge, where §3 reserves the full-bleed weight for section
   * boundaries.
   */
  const suffix = makeSuffix();
  const id = await richRecord(page, suffix);
  await page.goto(`/records/${id}`);
  await page.locator('[data-section]').first().waitFor({ timeout: 20_000 });

  const sections = await page.evaluate(() =>
    Array.from(document.querySelectorAll('[data-section]')).map((section) => ({
      name: section.getAttribute('data-section'),
      rules: Array.from(section.querySelectorAll('[data-cell]')).map(
        (cell) => getComputedStyle(cell).borderRightWidth,
      ),
    })),
  );

  for (const section of sections) {
    const last = section.rules.length - 1;
    section.rules.forEach((width, index) => {
      if (index === last) {
        expect(width, `${section.name}: the last cell carries no rule`).toBe('0px');
      } else {
        expect(width, `${section.name}: cell ${index} is ruled`).toBe('1px');
      }
    });
  }
});

test('holds content at 34px inside every cell', async ({ page }) => {
  const suffix = makeSuffix();
  const id = await richRecord(page, suffix);
  await page.goto(`/records/${id}`);
  await page.locator('[data-section]').first().waitFor({ timeout: 20_000 });

  const paddings = await page.evaluate(() =>
    Array.from(document.querySelectorAll('[data-section] [data-cell]')).map((cell) => {
      const style = getComputedStyle(cell);
      return `${style.paddingTop}|${style.paddingLeft}`;
    }),
  );

  expect(paddings.length).toBeGreaterThan(0);
  for (const padding of paddings) {
    expect(padding).toBe(`${CELL_PADDING}px|${CELL_PADDING}px`);
  }
});

test('the section rule bleeds past the tracks it contains', async ({ page }) => {
  /**
   * §3's distinction is load-bearing: a full-bleed rule separates modules, an
   * inset one separates things inside one module, and each section is a module.
   * Drawn inset, the region's only structural element would be the wrong kind
   * of edge by this file's own vocabulary.
   *
   * Asserted as the section spanning wider than its own content, which is what
   * "bleeds past" means geometrically.
   */
  const suffix = makeSuffix();
  const id = await richRecord(page, suffix);
  await page.setViewportSize({ width: 1440, height: NO_SCROLL_HEIGHT });
  await page.goto(`/records/${id}`);
  await page.locator('[data-section]').first().waitFor({ timeout: 20_000 });

  const measured = await page.evaluate(() => {
    const section = document.querySelector('[data-section]')!;
    const rail = section.querySelector('[data-cell="label"]')!;
    const style = getComputedStyle(section);
    return {
      left: Math.round(section.getBoundingClientRect().left),
      right: Math.round(section.getBoundingClientRect().right),
      labelLeft: Math.round(rail.getBoundingClientRect().left),
      borderTop: style.borderTopWidth,
      viewport: window.innerWidth,
    };
  });

  expect(measured.left, 'the rule starts at the composition edge').toBe(0);
  expect(measured.right, 'and runs to it').toBe(measured.viewport);
  expect(measured.labelLeft, 'while the label cell starts at the composition edge').toBe(
    measured.left,
  );
  expect(measured.borderTop, 'one hairline').toBe('1px');
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
  await page.locator('[data-section]').first().waitFor({ timeout: 20_000 });

  const marked = await page.evaluate(() =>
    Array.from(document.querySelectorAll('[data-section]')).map((section) => ({
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

test('the bar is 44 × 10 and sits on the rail', async ({ page }) => {
  const suffix = makeSuffix();
  const id = await richRecord(page, suffix);
  await page.setViewportSize({ width: 1440, height: NO_SCROLL_HEIGHT });
  await page.goto(`/records/${id}`);
  await page.locator('[data-mark="section-bar"]').first().waitFor({ timeout: 20_000 });

  const bars = await page.evaluate(() =>
    Array.from(document.querySelectorAll('[data-mark="section-bar"]')).map((bar) => {
      const box = bar.getBoundingClientRect();
      return { x: Math.round(box.left), w: Math.round(box.width), h: Math.round(box.height) };
    }),
  );

  expect(bars.length, 'at least one bar').toBeGreaterThan(0);

  for (const bar of bars) {
    expect(bar.w).toBe(MARK_WIDTH);
    expect(bar.h).toBe(MARK_HEIGHT);
    /* On the rail — the same x as every label, which is the whole argument. */
    /* In the label span, indented by the cell's own 34px padding. */
    expect(bar.x, 'the bar sits in the label span').toBe(CELL_PADDING);
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
  await page.locator('[data-section]').first().waitFor({ timeout: 20_000 });

  const below = await page.evaluate(() => {
    const frame = document.querySelector('[data-testid="record-page-8a"]')!;
    const diagonals = Array.from(document.querySelectorAll('[data-diagonal]')).filter(
      (mark) => !frame.contains(mark),
    );
    const empty = Array.from(document.querySelectorAll('[data-section]')).filter((section) => {
      const cells = Array.from(section.querySelectorAll('[data-cell^="content"]'));
      return cells.length > 0 && cells.every((cell) => (cell.textContent ?? '').trim() === '');
    });
    return {
      diagonals: diagonals.length,
      empty: empty.map((section) => section.getAttribute('data-section')),
      all: Array.from(document.querySelectorAll('[data-section]')).map((x) => x.getAttribute('data-section')),
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
  await page.locator('[data-section]').first().waitFor({ timeout: 20_000 });

  const blocked = await page.evaluate(() => {
    const out: string[] = [];
    for (const section of Array.from(document.querySelectorAll('[data-section]'))) {
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
  await page.locator('[data-section]').first().waitFor({ timeout: 20_000 });

  const sections = await page.evaluate(() =>
    Array.from(document.querySelectorAll('[data-section]')).map((section) => ({
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
   * §9.2's layer, which is the part most easily built wrong.
   *
   * **Every §9 cell isolates and the ornament sits at `z-index: -1` inside
   * it.** Nothing else carries a z-index: controls, ruled fields, chips,
   * uploaders, textareas and type runs are above ornament because they are IN
   * FLOW, not because each was named. Design's first implementation lifted
   * eleven elements by matching control heights and missed the textarea, the
   * uploader and the three tag chips — a list of things to raise is a list
   * someone has to keep complete.
   *
   * So this asserts the mechanism AND its absence: the cells isolate, and no
   * content element in the region carries a stacking value of its own.
   */
  const suffix = makeSuffix();
  const id = await richRecord(page, suffix);
  await page.goto(`/records/${id}`);
  await page.locator('[data-section]').first().waitFor({ timeout: 20_000 });

  const layer = await page.evaluate(() => {
    const cells = Array.from(document.querySelectorAll('[data-section] [data-cell]'));
    const wrong = cells
      .map((cell) => {
        const style = getComputedStyle(cell);
        return {
          cell: cell.getAttribute('data-cell'),
          position: style.position,
          isolation: style.isolation,
          overflow: style.overflow,
        };
      })
      .filter(
        (row) =>
          row.position !== 'relative' || row.isolation !== 'isolate' || row.overflow !== 'hidden',
      );

    /* Anything inside a cell that lifts itself — the defect this replaces. */
    const lifted: string[] = [];
    for (const cell of cells) {
      for (const node of Array.from(cell.querySelectorAll('*'))) {
        if (node.getAttribute('data-ornament') !== null) continue;
        const z = getComputedStyle(node).zIndex;
        if (z !== 'auto' && z !== '0') lifted.push(`${node.tagName} z-index:${z}`);
      }
    }
    return { cells: cells.length, wrong, lifted };
  });

  expect(layer.cells, 'cells rendered').toBeGreaterThan(0);
  expect(
    layer.wrong,
    `cells missing the structural layer:\n${JSON.stringify(layer.wrong, null, 2)}`,
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
  await page.locator('[data-section]').first().waitFor({ timeout: 20_000 });

  const collisions = await page.evaluate(() => {
    const CLEARANCE = 60;
    const out: string[] = [];
    const solids = Array.from(document.querySelectorAll('[data-ornament="figure"]'));
    const controls = Array.from(
      document.querySelectorAll('[data-section] button, [data-section] input, [data-section] select, [data-section] textarea, [data-section] a'),
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
   * The cap is §18's `GRID_FORK` now rather than the old 1728: the bands are
   * `repeat(12, 120px)` and fixed, so the composition is 1440 at every width
   * above the fork. The CLAIM here is unchanged and is the reason the swap is
   * safe — the page is one grid, rendered at one width — and only the figure
   * it caps at moved.
   *
   * They were bleeding to the viewport at every width, so at 3440 the frame
   * sat at 1728@856 while every section below started at 0: one grid rendered
   * at two widths, and the frame appeared to start a long way in from the left.
   *
   * **Measured wide, because at 1440 the two are identical and the defect is
   * invisible** — which is why it shipped.
   */
  const suffix = makeSuffix();
  const id = await richRecord(page, suffix);

  for (const width of [1440, GRID_FORK, 2560, 3440]) {
    await page.setViewportSize({ width, height: NO_SCROLL_HEIGHT });
    await page.goto(`/records/${id}`);
    await page.locator('[data-section]').first().waitFor({ timeout: 20_000 });

    const measured = await page.evaluate(() => {
      const frame = document.querySelector('[data-testid="record-page-8a"]')!.getBoundingClientRect();
      const sections = Array.from(document.querySelectorAll('[data-section]')).map((section) => {
        const box = section.getBoundingClientRect();
        return { left: Math.round(box.left), width: Math.round(box.width) };
      });
      return {
        frame: { left: Math.round(frame.left), width: Math.round(frame.width) },
        sections,
      };
    });

    const expected = Math.min(width, GRID_FORK);

    expect(measured.frame.width, `frame at ${width}`).toBe(expected);

    for (const section of measured.sections) {
      /* Same measure AND same edge: equal widths at different x still misalign. */
      expect(section.width, `section width at ${width}`).toBe(expected);
      expect(section.left, `section left at ${width} (frame ${measured.frame.left})`).toBe(
        measured.frame.left,
      );
    }
  }
});

/**
 * §25 and §26: the figures and flats, measured on the route.
 *
 * Distribution is §26's placement and not a rule about sections: two figures
 * in eight sections, never consecutive — the pair in Pressing detail's air,
 * the solo in Price history's strip — and two flats on opposite page edges.
 * Until §26's rows exist the air column has no host, so the pair and the
 * triangle are asserted by their absence from every OTHER section here and by
 * their presence in step 18's spec.
 */
const figureSections = (page: Page) =>
  page.evaluate(() =>
    Array.from(document.querySelectorAll('[data-section]')).map((section) => ({
      name: section.getAttribute('data-section') ?? '?',
      figures: section.querySelectorAll('[data-ornament="figure"]').length,
      flats: Array.from(section.querySelectorAll('[data-ornament="flat"]')).map((f) => f.getAttribute('data-flat')),
    })),
  );

test('places figures only where §26 does, never in consecutive sections', async ({ page }) => {
  const suffix = makeSuffix();
  const id = await richRecord(page, suffix);
  await page.goto(`/records/${id}`);
  await page.locator('[data-ornament="figure"]').first().waitFor({ timeout: 20_000 });

  const placed = await figureSections(page);
  const carrying = placed.filter((row) => row.figures > 0).map((row) => row.name);

  /* The positive half first, or the exclusions below pass on a page with no ornament. */
  expect(carrying, 'the solo in Price history').toContain('price-history');
  const ruled = new Set(Object.keys(FIGURES).map((key) => key.split(':')[0]));
  for (const name of carrying) expect(ruled.has(name), `${name} is one of §26's two hosts`).toBe(true);
  for (const row of placed) expect(row.figures, `${row.name}: one figure at most`).toBeLessThanOrEqual(1);

  /* Never consecutive, in the page's own order. */
  for (let i = 1; i < placed.length; i++) {
    expect(placed[i].figures > 0 && placed[i - 1].figures > 0, `${placed[i - 1].name} then ${placed[i].name}: consecutive figures`).toBe(false);
  }
  /* And §9.4's fill is withdrawn by §26's flats. */
  expect(await page.locator('[data-ornament="fill"]').count(), 'no full fill anywhere').toBe(0);
});

test('a figure is 0.855 of its section, shows two-thirds, and is cut by its foot alone', async ({ page }) => {
  /**
   * **The size rule is the gate itself.** Height is the governed term and it
   * is the SECTION's; the visible part is exactly the two-thirds ceiling and
   * the rest bleeds below the cell's foot. Measured at four viewports because
   * the size must track the section and not the window.
   *
   * **Clipping is a boundary, not a treatment**: the clip is the figure's own
   * cell, and a figure is cut by at most one edge — its foot. A second cut
   * edge reads as a figure too big for its box.
   */
  const suffix = makeSuffix();
  const id = await richRecord(page, suffix);

  for (const width of [1440, GRID_FORK, 2560, 3440]) {
    await page.setViewportSize({ width, height: NO_SCROLL_HEIGHT });
    await page.goto(`/records/${id}`);
    await page.locator('[data-ornament="figure"]').first().waitFor({ timeout: 20_000 });

    const figures = await page.evaluate(() =>
      Array.from(document.querySelectorAll('[data-ornament="figure"]')).map((figure) => {
        const section = figure.closest('[data-section]')!;
        const cell = figure.closest('[data-cell]')!;
        const f = figure.getBoundingClientRect();
        const c = cell.getBoundingClientRect();
        return {
          name: section.getAttribute('data-section'),
          kind: figure.getAttribute('data-figure'),
          sectionHeight: section.getBoundingClientRect().height,
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
      expect(figure.height / figure.sectionHeight, label).toBeCloseTo(SIZE_RATIO, 2);
      expect(figure.visible / figure.sectionHeight, `${label}: visible`).toBeCloseTo(GATE_RATIO, 2);
      expect(figure.cutFoot, `${label}: bleeds below the foot`).toBe(true);
      expect(figure.cutEdges, `${label}: cut by one edge only`).toBe(1);

      /* Width follows the figure's projected box, never a constant. */
      const spec = FIGURES[`${figure.name}:strip`] ?? FIGURES[`${figure.name}:air`];
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
  await page.locator('[data-ornament="figure"]').first().waitFor({ timeout: 20_000 });

  const drawn = await page.evaluate(() => {
    const read = (el: Element) => getComputedStyle(el);
    const figures = Array.from(document.querySelectorAll('[data-ornament="figure"]')).map((svg) => ({
      section: svg.closest('[data-section]')?.getAttribute('data-section') ?? '?',
      faces: Array.from(svg.querySelectorAll('polygon')).map((p) => ({
        face: p.getAttribute('data-face'),
        fill: read(p).fill,
        opacity: read(p).opacity,
      })),
    }));
    const flats = Array.from(document.querySelectorAll('[data-ornament="flat"]')).map((el) => ({
      shape: el.getAttribute('data-flat'),
      section: el.closest('[data-section]')?.getAttribute('data-section') ?? '?',
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
  expect(disc?.section, 'beside About this record').toBe('snippet');
  expect(disc?.polygons, 'one fill, no faces').toBe(0);
  expect(disc?.fill, 'at BASE').toBe(drawn.base);

  if (drawn.matrix !== null) {
    expect(new Set(drawn.matrix).size, 'the matrix has three tones of its own').toBe(3);
    for (const fill of drawn.matrix) expect(fill, 'grey, never the record’s colour').toMatch(/0\.004 80|rgb\((\d+), \1, /);
  }
});

test('the quarter-disc bleeds off the right page edge: r 150, three quarters outside', async ({ page }) => {
  /**
   * §25's flat sheet: "r 150 · more than a third outside, masked by the page
   * edge". Made structurally — a full disc centred on its cell's bottom-right
   * corner — so the cell's clip shows one quadrant. Measured as the disc's
   * box against the cell's and the page's.
   */
  const suffix = makeSuffix();
  const id = await richRecord(page, suffix);
  await page.setViewportSize({ width: 1440, height: NO_SCROLL_HEIGHT });
  await page.goto(`/records/${id}`);
  await page.locator('[data-ornament="flat"]').first().waitFor({ timeout: 20_000 });

  const disc = await page.evaluate(() => {
    const el = document.querySelector('[data-flat="quarterDisc"]');
    if (el === null) return null;
    const d = el.getBoundingClientRect();
    const cell = el.closest('[data-cell]')!.getBoundingClientRect();
    const frame = document.querySelector('[data-testid="record-page-8a"]')!.getBoundingClientRect();
    return {
      width: d.width,
      height: d.height,
      radius: getComputedStyle(el).borderRadius,
      visibleWidth: Math.max(0, Math.min(d.right, cell.right) - Math.max(d.left, cell.left)),
      visibleHeight: Math.max(0, Math.min(d.bottom, cell.bottom) - Math.max(d.top, cell.top)),
      cellHeight: cell.height,
      sectionWidth: el.closest('[data-section]')!.getBoundingClientRect().width,
      cellRightIsPageRight: Math.abs(cell.right - frame.right) < 1,
    };
  });
  expect(disc, 'the disc renders').not.toBeNull();
  if (disc === null) return;
  expect(disc.width, 'a disc of r 150').toBe(300);
  expect(disc.height).toBe(300);
  expect(disc.radius).toBe('50%');
  expect(disc.cellRightIsPageRight, 'its cell ends at the page edge, so the mask is the page edge').toBe(true);
  /* The radius shows across; three quarters of the disc are outside the page. */
  expect(disc.visibleWidth, 'one quadrant across').toBeCloseTo(150, 0);
  expect(disc.visibleWidth / disc.width, 'more than a third outside').toBeLessThan(2 / 3);
  expect(disc.visibleWidth, 'and at most a quarter of the section across').toBeLessThanOrEqual(disc.sectionWidth / 4);
  /*
    Up the page, the quadrant shows to the cell's own height. §26 draws About
    at 220 and the quadrant whole; a record with no snippet has a 104px cell
    here and the quadrant is cut by its top — open with Design (NOTES).
  */
  expect(disc.visibleHeight, `the quadrant up to the cell's ${Math.round(disc.cellHeight)}px`).toBeCloseTo(Math.min(150, disc.cellHeight), 0);
});

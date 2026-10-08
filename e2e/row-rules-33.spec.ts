import { expect, test } from '@playwright/test';
import { registerCleanup, trackArtist } from './cleanup';
import { getTestDb } from '../test/helpers/db';
import { sql } from 'drizzle-orm';
import { NO_SCROLL_HEIGHT } from '../src/app/records/[id]/band-geometry';
import { login } from './sign-in';

registerCleanup();
/**
 * **Measurement only, for two QA items that may not be build defects.**
 *
 * 1. The figure in the air column beside What it goes for now appears to cross
 *    the horizontal rule beneath it. §21 lets a figure be clipped by its own
 *    cell; crossing an INTERNAL rule is a different thing and may not be ruled.
 * 2. The figure beside Matrix / runout reads as a speck. §25 sizes a figure at
 *    0.855 of its section's height, so either it is under-sized (a build
 *    defect) or the rule produces a speck at that host (Design's to rule).
 */
/**
 * §33, the two rule clauses, asserted on the rendering.
 *
 * "A row's horizontal rule runs full-bleed across every cell, occupied or
 * empty; the build drew each cell's rule, so the empty cell of the
 * four-by-three row left a gap." Measured before the fix: the row at y=1075
 * carried 480px of rule in a 1440px region, short by 960.
 *
 * "A vertical rule runs its row's full height or is not drawn: the
 * label-to-value dividers inside Pressing detail and Market start below their
 * section labels, and a vertical that starts partway reads as a break."
 */
test('§33: row rules run whole, and partial verticals are gone', async ({ page }) => {
  await login(page);
  const s = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const a = await page.request.post('/api/artists', { data: { name: `r33-${s}` } });
  const { id: artistId } = await a.json();
  trackArtist(artistId);
  const r = await page.request.post('/api/records', {
    data: { artistId, title: `R33 ${s}`, releaseYear: 2024 },
  });
  const { id } = await r.json();

  const db = getTestDb();
  const pressing = await db.execute<{ id: string }>(
    sql`INSERT INTO pressings (pressing_plant, color_variant, matrix_runout, country_pressed, year_pressed)
        VALUES ('GZ Media', 'Orange [Tangerine]', '269346E1 1701690 MP731-A JN-H STERLING', 'UK, Europe & US', 2024)
        RETURNING id`,
  );
  await db.execute(
    sql`UPDATE records SET spine_colour = ${'#a25829'}, pressing_id = ${pressing.rows[0].id}::uuid,
          purchase_price = 12.99 WHERE id = ${id}::uuid`,
  );
  /*
    **Price history is what makes the failing row render.** Without it the
    region has four rows and all of them are whole, so the assertion passed
    on a page that never contained the defect -- the fixture, not the
    assertion, was deciding the result.
  */
  await db.execute(
    sql`INSERT INTO price_history (record_id, price, price_type, source)
        VALUES (${id}::uuid, 12.99, 'used', 'discogs'), (${id}::uuid, 13.42, 'used', 'discogs')`,
  );

  await page.setViewportSize({ width: 1440, height: NO_SCROLL_HEIGHT });
  await page.goto(`/records/${id}`);
  await expect(page.locator('[data-field="eyebrow"]')).toBeVisible();
  await page.waitForTimeout(700);

  const rows = await page.evaluate(() => {
    const px = (n: number) => Math.round(n * 10) / 10;
    /*
      Every element that paints a horizontal rule, WHEREVER it is drawn --
      sections, air cells, and §33's per-row rule. Asking only about sections
      would report 0 once the rule moved off them, which says nothing about
      whether the line reaches.
    */
    const boxes = Array.from(
      document.querySelectorAll<HTMLElement>('[data-region="extended-grid"] [data-section], [data-cell="air"], [data-row-rule]'),
    )
      /* A hidden rule paints nothing: the grid renders one rule element per row any width lays, and the stylesheet shows this width's count. */
      .filter((el) => getComputedStyle(el).display !== 'none')
      .map((el) => {
      const b = el.getBoundingClientRect();
      return {
        x: px(b.x + window.scrollX),
        y: px(b.y + window.scrollY),
        w: px(b.width),
        top: parseFloat(getComputedStyle(el).borderTopWidth),
      };
    });
    const grouped = new Map<number, typeof boxes>();
    for (const b of boxes) {
      const k = Math.round(b.y);
      if (!grouped.has(k)) grouped.set(k, []);
      grouped.get(k)?.push(b);
    }
    return [...grouped.entries()].map(([y, items]) => {
      /*
        **The RIGHTMOST painted edge, not the sum of the painted widths.**
        Summing them counted 480px of rule as "1440 covered" on a row whose
        line stopped at x=480 with 960px missing -- the assertion passed on
        the defect it was written for. A gap contributes nothing to a sum, so
        a sum cannot see one.
      */
      const painted = items.filter((b) => b.top > 0).sort((p, q) => p.x - q.x);
      let reach = 0;
      const gaps: Array<[number, number]> = [];
      for (const b of painted) {
        if (b.x > reach + 0.6) gaps.push([px(reach), px(b.x)]);
        reach = Math.max(reach, b.x + b.w);
      }
      return { y, reach: px(reach), gaps: gaps.map(([g0, g1]) => `${g0}..${g1}`).join(' ') };
    });
  });

  console.log('ROWS SEEN BY THE §33 TEST:', JSON.stringify(rows, null, 1));
  for (const row of rows) {
    expect(
      row.gaps,
      `the rule at y=${row.y} has a gap in it: ${row.gaps}`,
    ).toBe('');
    expect(row.reach, `the rule at y=${row.y} reaches the region's right edge`).toBeCloseTo(1440, 0);
  }

  /* No vertical that starts partway down its row. */
  const partials = await page.evaluate(() => {
    const out: string[] = [];
    for (const section of Array.from(document.querySelectorAll<HTMLElement>('[data-region="extended-grid"] [data-section]'))) {
      const sb = section.getBoundingClientRect();
      for (const el of Array.from(section.querySelectorAll<HTMLElement>('*'))) {
        /*
          **Form controls are not rules.** A select, a textarea and a button
          each carry their own border, and §33's clause is about the page's
          structural verticals -- the label-to-value dividers. An assertion
          that swept up every bordered element would demand the controls be
          unstyled, which no ruling asks for.
        */
        if (['select', 'textarea', 'button', 'input'].includes(el.tagName.toLowerCase())) continue;
        if (parseFloat(getComputedStyle(el).borderRightWidth) === 0) continue;
        const b = el.getBoundingClientRect();
        if (b.height < sb.height - 1.5) {
          const cs2 = getComputedStyle(el);
          out.push(
            `${section.getAttribute('data-section')}: ${Math.round(b.height)}px/${Math.round(sb.height)}px ` +
              `w=${cs2.borderRightWidth} colour=${cs2.borderRightColor} ` +
              `<${el.tagName.toLowerCase()} ${Array.from(el.attributes).map((x) => `${x.name}="${x.value}"`).join(' ').slice(0, 90)}>`,
          );
        }
      }
    }
    return out;
  });
  expect(partials, '§33: a vertical runs the row’s full height or is not drawn').toEqual([]);
});

/**
 * **§33 rules which term yields, and it is the height.** "It takes 0.855 of
 * the cell's free height below the matrix text, or the height at which it
 * fits the cell's width inside its insets, whichever is smaller... The height
 * yields, not the insets: a figure never crosses its cell's side edges (§21),
 * and 0.855 is a target, not a floor. At 240 wide with 18px insets that is
 * 176.8, not 195.4."
 *
 * The build kept 195.4 and spent one inset, overhanging the cell's left edge
 * by about a pixel, and this test was named known-failing and pinned the
 * overhang at 0 to 2px -- so it went red when the clause was built as ruled,
 * which is why it never was. It now asserts the ruling: both insets held,
 * and the width-bound height at this cell.
 */
test('the matrix solid sits inside both of its cell’s insets, and the height yields to the width (§21, §33)', async ({ page }) => {
  await login(page);
  const s = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const a = await page.request.post('/api/artists', { data: { name: `m21-${s}` } });
  const { id: artistId } = await a.json();
  trackArtist(artistId);
  const r = await page.request.post('/api/records', {
    data: { artistId, title: `M21 ${s}`, releaseYear: 2024 },
  });
  const { id } = await r.json();
  const db = getTestDb();
  const pressing = await db.execute<{ id: string }>(
    sql`INSERT INTO pressings (matrix_runout) VALUES ('269346E1 1701690 MP731-A JN-H STERLING') RETURNING id`,
  );
  await db.execute(
    sql`UPDATE records SET spine_colour = ${'#a25829'}, pressing_id = ${pressing.rows[0].id}::uuid
        WHERE id = ${id}::uuid`,
  );

  await page.setViewportSize({ width: 1440, height: NO_SCROLL_HEIGHT });
  await page.goto(`/records/${id}`);
  await expect(page.locator('[data-field="eyebrow"]')).toBeVisible();
  await page.waitForTimeout(700);

  const m = await page.evaluate(() => {
    const cell = document.querySelector('[data-cell="matrix"]');
    const solid = document.querySelector('[data-mark="matrixSolid"]');
    const text = document.querySelector('[data-matrix-text]');
    if (cell === null || solid === null || text === null) return null;
    const c = cell.getBoundingClientRect();
    const s2 = solid.getBoundingClientRect();
    const t = text.getBoundingClientRect();
    const cs = getComputedStyle(cell);
    const inset = parseFloat(cs.paddingRight);
    /* Edges against the PADDING box: the cell's right rule is its border, and the inset sits inside it. */
    const padLeft = c.x + parseFloat(cs.borderLeftWidth);
    const padRight = c.right - parseFloat(cs.borderRightWidth);
    return { left: s2.x - padLeft, right: padRight - s2.right, width: s2.width, height: s2.height, cellWidth: padRight - padLeft, inset, free: c.bottom - inset - t.bottom };
  });
  expect(m, 'the solid is drawn').not.toBeNull();
  if (m === null) return;
  /* Both insets: the solid never crosses a side edge, and sits against the right inset. */
  expect(m.left, `left edge ${m.left.toFixed(1)} inside the ${m.inset}px inset`).toBeGreaterThanOrEqual(m.inset - 0.5);
  expect(m.right, `right edge against the ${m.inset}px inset`).toBeCloseTo(m.inset, 0);
  /* The smaller of the two terms; at this cell the width binds: 204 × 104 / 120 = 176.8. */
  const byHeight = m.free * 0.855;
  const byWidth = (m.cellWidth - 2 * m.inset) * (104 / 120);
  expect(m.height, `height ${m.height.toFixed(1)} is the smaller of ${byHeight.toFixed(1)} (0.855 of free) and ${byWidth.toFixed(1)} (width inside insets)`).toBeCloseTo(Math.min(byHeight, byWidth), 0);
  /* §33's figure is stated for a 240 cell; the padding box is 239 here, the cell's rule being its border, so 175.9. */
  expect(byWidth, 'at 240 wide with 18px insets §33 gives 176.8; a pixel of rule inside the box gives 175.9').toBeCloseTo(m.cellWidth === 240 ? 176.8 : 175.9, 1);
});

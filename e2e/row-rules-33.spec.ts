import { expect, test, type Page } from '@playwright/test';
import { registerCleanup, trackArtist } from './cleanup';
import { getTestDb } from '../test/helpers/db';
import { sql } from 'drizzle-orm';
import { NO_SCROLL_HEIGHT } from '../src/app/records/[id]/band-geometry';

registerCleanup();
const PASSWORD = process.env.E2E_PASSWORD ?? 'test-password-for-e2e';

async function login(page: Page) {
  await page.goto('/login');
  await page.locator('form[data-hydrated="true"]').waitFor({ timeout: 15_000 });
  await page.getByLabel('Password').pressSequentially(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL('/');
}

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
      document.querySelectorAll<HTMLElement>('[data-section], [data-cell="air"], [data-row-rule]'),
    ).map((el) => {
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
    for (const section of Array.from(document.querySelectorAll<HTMLElement>('[data-section]'))) {
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

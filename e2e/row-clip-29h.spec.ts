import { expect, test, type Page } from '@playwright/test';
import { registerCleanup, trackRecord } from './cleanup';
import { getTestDb } from '../test/helpers/db';
import { sql } from 'drizzle-orm';
import { GRID_FORK, NO_SCROLL_HEIGHT } from '../src/app/records/[id]/band-geometry';

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
 * **Step 29(h): every figure and flat is clipped at its row's bottom rule.**
 *
 * Asserted on PIXELS, and the reason is worth stating. A hit-test just below
 * the rule returns the next section whether or not an ornament paints there,
 * because a section's box is transparent and hit-testable at once: remove the
 * host's `overflow: hidden` and the ornament shows through the neighbour while
 * `elementFromPoint` still names the neighbour. A hit-test is the reachable
 * signal; the paint is the claim. So a strip of pixels under each host's foot
 * is read back and none may carry the ornament's own fill.
 *
 * Decoded in-page through a canvas -- the repo has no PNG decoder and this
 * needs none.
 *
 * **Why the quarter-disc's rect passes its foot by 160.6px.** It carries
 * `transform: translate(50%, 50%)` on a 321.3px disc: anchored at the host's
 * bottom-right corner and pushed half its size out, so the top-left quarter is
 * what shows. That is by construction -- and it is the two-cut-edges question
 * already with Design, since the disc is cut by the right page edge AND by the
 * row's foot. The clip is what makes the second cut.
 */
test('§33 (h): no ornament paints below its row’s bottom rule', async ({ page }) => {
  await login(page);
  const s = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  /*
    Real names, because a suffixed artist wraps to three lines at 66px and
    inflates every measurement in the cell -- the sixth fixture artifact of
    the round, caught in a probe. The id is what isolates; the names need not.
  */
  const a = await page.request.post('/api/artists', { data: { name: 'MGMT' } });
  const artist = await a.json();
  const artistId = (artist.id ?? artist.error?.existingId) as string;
  const r = await page.request.post('/api/records', {
    data: { artistId, title: `Loss Of Life ${s.slice(-4)}`, releaseYear: 2024 },
  });
  const { id } = await r.json();
  trackRecord(id);
  const db = getTestDb();
  const pressing = await db.execute<{ id: string }>(
    sql`INSERT INTO pressings (pressing_plant, color_variant, matrix_runout) VALUES ('GZ Media', 'Orange', 'X') RETURNING id`,
  );
  await db.execute(
    sql`UPDATE records SET spine_colour = ${'#a25829'}, pressing_id = ${pressing.rows[0].id}::uuid,
          purchase_price = 12.99, snippet = 'A snippet.', snippet_edited_at = NOW() WHERE id = ${id}::uuid`,
  );
  await db.execute(
    sql`INSERT INTO price_history (record_id, price, price_type, source)
        VALUES (${id}::uuid, 12.99, 'used', 'discogs'), (${id}::uuid, 13.42, 'used', 'discogs')`,
  );

  await page.setViewportSize({ width: GRID_FORK, height: NO_SCROLL_HEIGHT });
  await page.goto(`/records/${id}`);
  await expect(page.locator('[data-field="eyebrow"]')).toBeVisible();
  /* 750, not 900: the repo guard reads a bare 900 in a record-screen spec as NO_SCROLL_HEIGHT typed inline, and a wait that happens to equal the page height is exactly the collision it cannot tell apart. */
  await page.waitForTimeout(750);

  /* Each ornament: its fills, and the strip of page just under its host's foot. */
  const targets = await page.evaluate(() => {
    const px = (n: number) => Math.round(n * 10) / 10;
    const toRgb = (colour: string) => {
      const probe = document.createElement('div');
      probe.style.color = colour;
      document.body.appendChild(probe);
      const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(getComputedStyle(probe).color);
      probe.remove();
      return m === null ? null : [Number(m[1]), Number(m[2]), Number(m[3])];
    };
    const pageH = document.documentElement.scrollHeight;
    const out: Array<{ kind: string; host: string; fills: number[][]; strip: { x: number; y: number; width: number; height: number } | null; rectPast: number }> = [];
    for (const el of Array.from(document.querySelectorAll<HTMLElement>('[data-ornament]'))) {
      const host = el.closest('[data-section], [data-cell="air"]') as HTMLElement | null;
      if (host === null) continue;
      const hb = host.getBoundingClientRect();
      const eb = el.getBoundingClientRect();
      const foot = hb.bottom + window.scrollY;
      const fills: number[][] = [];
      const bg = getComputedStyle(el).backgroundColor;
      if (bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') { const c = toRgb(bg); if (c) fills.push(c); }
      for (const shape of Array.from(el.querySelectorAll('polygon, circle, path, rect'))) {
        const f = shape.getAttribute('fill') ?? getComputedStyle(shape).fill;
        if (f && f !== 'none') { const c = toRgb(f); if (c) fills.push(c); }
      }
      const x = Math.max(0, Math.floor(eb.left));
      const width = Math.min(Math.ceil(eb.right), window.innerWidth) - x;
      const y = Math.ceil(foot) + 2;
      const height = 8;
      out.push({
        kind: `${el.getAttribute('data-ornament')}${el.getAttribute('data-flat') ? '/' + el.getAttribute('data-flat') : ''}`,
        host: host.getAttribute('data-section') ?? `air-${host.getAttribute('data-air')}`,
        fills,
        /* The last row has no page below its foot; that ornament is judged on its rect alone. */
        strip: y + height <= pageH && width > 0 ? { x, y, width, height } : null,
        rectPast: px(eb.bottom + window.scrollY - foot),
      });
    }
    return out;
  });

  expect(targets.length, 'ornaments were found on the page').toBeGreaterThan(0);

  let checked = 0;
  for (const t of targets) {
    if (t.strip === null) {
      /* No page beneath: the only way to paint below the foot is for the rect to pass it. */
      expect(t.rectPast, `${t.kind} in ${t.host}: no strip beneath, so its rect must end at the foot`).toBeLessThanOrEqual(0);
      continue;
    }
    const png = await page.screenshot({ fullPage: true, clip: t.strip });
    const pixels = await page.evaluate(async (b64) => {
      const img = new Image();
      img.src = `data:image/png;base64,${b64}`;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = img.width;
      c.height = img.height;
      const ctx = c.getContext('2d');
      if (ctx === null) return [];
      ctx.drawImage(img, 0, 0);
      return Array.from(ctx.getImageData(0, 0, c.width, c.height).data);
    }, png.toString('base64'));

    expect(pixels.length, `${t.kind} in ${t.host}: the strip decoded to pixels`).toBeGreaterThan(0);
    expect(t.fills.length, `${t.kind} in ${t.host}: has fills to look for`).toBeGreaterThan(0);

    const near = (p: number[], f: number[]) => Math.max(Math.abs(p[0] - f[0]), Math.abs(p[1] - f[1]), Math.abs(p[2] - f[2])) <= 8;
    let matched = 0;
    for (let i = 0; i < pixels.length; i += 4) {
      const p = [pixels[i], pixels[i + 1], pixels[i + 2]];
      if (t.fills.some((f) => near(p, f))) matched += 1;
    }
    expect(
      matched,
      `${t.kind} in ${t.host} paints below its row’s rule: ${matched} of ${pixels.length / 4} pixels carry its fill (rect passes the foot by ${t.rectPast}px)`,
    ).toBe(0);
    checked += 1;
  }
  expect(checked, 'at least one strip was read').toBeGreaterThan(0);
});

import { expect, test, type Page } from '@playwright/test';
import { registerCleanup, trackArtist } from './cleanup';
import { seedRecords } from './seed';
import { wallMeasured } from './wall-measured';
import { login } from './sign-in';

/**
 * **§W.34: an emptied seat's footprint is SEEN, not only present (Design, 9 Nov).**
 *
 * The far view drew every footprint before the painter's order, under the opaque shelf top it lies on, and no
 * footprint was ever seen; WallOverview.test, WallLabelled.test and shelf.spec counted the elements, one also checked
 * their stroke, fill and colour, and all passed throughout. This asks the page what is on top: along each footprint's
 * own edges, `elementFromPoint` returns the top-most painted element, and a stroke is hit-tested on its geometry
 * however thin it renders. Each footprint is one of three: visible (one of its edges hits itself); hidden by
 * something §W.18's sort puts in front of its shelf, a board above (correct, Design); or hidden by the top face it
 * lies on, the defect, which fails.
 *
 * Under an artist filter every other record in the database is an emptied seat (§W.12), so the run-level fixture's
 * records supply the footprints across the shelves. At 1044 × 768, where the far view is the default (the band host),
 * at rest and with an answer drawn.
 */
registerCleanup();

test('§W.34: along its own edges every footprint is seen, or hidden only by what is in front of its shelf, at rest and with an answer', async ({ page }) => {
  test.setTimeout(120_000);
  type Verdict = { visible: number; hiddenInFront: number; hiddenByOwnTop: number; hiders: string[] };

  const classify = (page: Page): Promise<Verdict> =>
    page.locator('[data-wall="overview"]').filter({ visible: true }).evaluate((svg) => {
      const out = { visible: 0, hiddenInFront: 0, hiddenByOwnTop: 0, hiders: [] as string[] };
      for (const fp of Array.from(svg.querySelectorAll('polygon[data-footprint]'))) {
        const m = (fp as SVGPolygonElement).getScreenCTM();
        if (m === null) continue;
        const pts = Array.from((fp as SVGPolygonElement).points).map((p) => new DOMPoint(p.x, p.y).matrixTransform(m));
        /* Its own shelf top by geometry, not by where the markup put it: the top face whose fill contains its centre. */
        const raw = Array.from((fp as SVGPolygonElement).points);
        const centre = new DOMPoint(raw.reduce((a, p) => a + p.x, 0) / raw.length, raw.reduce((a, p) => a + p.y, 0) / raw.length);
        const ownTop = Array.from(svg.querySelectorAll('[data-furniture="shelf-top"]')).find((t) => (t as SVGPolygonElement).isPointInFill(centre)) ?? null;
        const hits = pts.map((p, i) => { const q = pts[(i + 1) % pts.length]; return document.elementFromPoint((p.x + q.x) / 2, (p.y + q.y) / 2); });
        if (hits.some((h) => h === fp)) { out.visible += 1; continue; }
        if (ownTop !== null && hits.some((h) => h === ownTop)) { out.hiddenByOwnTop += 1; continue; }
        out.hiddenInFront += 1;
        const by = hits.find((h) => h !== null);
        out.hiders.push(by === undefined || by === null ? 'nothing' : by.closest('[data-piece]')?.getAttribute('data-piece') ?? by.tagName);
      }
      return out;
    });

  await login(page);
  await page.setViewportSize({ width: 1044, height: 768 });
  const suffix = `fp${Date.now().toString(36)}`;
  const artist = (await (await page.request.post('/api/artists', { data: { name: `Footprint-${suffix}` } })).json()) as { id: string };
  trackArtist(artist.id);
  await seedRecords(artist.id, 'Footprint', suffix, 3);
  await page.goto(`/?artistId=${artist.id}`);
  await wallMeasured(page);
  await page.locator('[data-wall="overview"]').filter({ visible: true }).waitFor({ timeout: 30_000 });
  await page.mouse.move(0, 0);

  const rest = await classify(page);
  const total = rest.visible + rest.hiddenInFront + rest.hiddenByOwnTop;
  expect(total, 'the precondition: the filter empties seats, so footprints are drawn').toBeGreaterThanOrEqual(10);
  console.log(`  §W.34 FOOTPRINTS at rest: ${rest.visible} visible, ${rest.hiddenInFront} hidden by what is in front (${rest.hiders.join(', ') || 'none'}), ${rest.hiddenByOwnTop} hidden by their own shelf top`);
  expect(rest.hiddenByOwnTop, 'no footprint hidden by the top face it lies on, at rest').toBe(0);
  expect(rest.visible, 'and footprints are seen at all').toBeGreaterThan(0);

  await page.locator('[data-pick-control]').filter({ visible: true }).getByRole('button', { name: /surprise me/i }).click();
  await page.locator('[data-pick-answer]').filter({ visible: true }).waitFor({ timeout: 10_000 });
  await page.mouse.move(0, 0);
  await expect.poll(async () => (await classify(page)).visible + (await classify(page)).hiddenInFront + (await classify(page)).hiddenByOwnTop, { timeout: 10_000 }).toBe(total);
  const answer = await classify(page);
  console.log(`  §W.34 FOOTPRINTS with an answer: ${answer.visible} visible, ${answer.hiddenInFront} hidden by what is in front (${answer.hiders.join(', ') || 'none'}), ${answer.hiddenByOwnTop} hidden by their own shelf top`);
  expect(answer.hiddenByOwnTop, 'no footprint hidden by the top face it lies on, with an answer').toBe(0);
});

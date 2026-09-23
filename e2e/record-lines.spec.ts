import { expect, test, type Page } from '@playwright/test';
import { registerCleanup, trackArtist } from './cleanup';
import { PAPER } from '../src/lib/colour/paper';
import { NO_SCROLL_HEIGHT } from '../src/app/records/[id]/band-geometry';

registerCleanup();

/**
 * **§16: the count does not transfer; §3's module test does.**
 *
 * §W.31 enumerates SIX lines for the shelf, and those six name the rail, the
 * facts column and the drawing region — regions that exist only there. Reading
 * six as a budget here would mean deleting 14 of this page's 20 rules to reach
 * a number counted on another composition. So this page states its OWN set,
 * and what §W.31 exports is three properties, which is what this spec pins:
 *
 * 1. **Two weights.** 1px for every rule; 2px reserved for §3's non-type
 *    marks. On this page there is exactly one 2px edge — the journal's right
 *    edge (§3: "the only rule on the page that is not grey and the only edge
 *    that is 2px"), which must not be applied to a second cell.
 * 2. **One hairline value**, §W.27's 0.72 on §W.5's 0.925 paper.
 * 3. **The bleed distinction, on §3's MODULE axis** — two things inside one
 *    module take an inset line, two modules take a bleeding one. A
 *    "marks type versus separates type" axis was tried and withdrawn (§16):
 *    both sides of the 372 are type, so that test had nothing to read.
 *    And when a line bleeds it bleeds to **the container that owns it, never
 *    the viewport**.
 *
 * The failure mode §3 names by name is an implementer extending either inset
 * to the cell edge, "which silently promotes a paragraph break into a
 * division" — so the insets are asserted to STAY short, not merely to exist.
 */
const PASSWORD = process.env.E2E_PASSWORD ?? 'test-password-for-e2e';

/** §W.27's hairline, as the page must paint it. */
const HAIRLINE = 'oklch(0.72 0.004 80)';
/** §3's journal edge: the one 2px mark, in the record's derived colour or ink (§5.3). */
const JOURNAL_EDGE_W = 2;

async function login(page: Page) {
  await page.goto('/login');
  await page.locator('form[data-hydrated="true"]').waitFor({ timeout: 15_000 });
  await page.getByLabel('Password').pressSequentially(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL('/');
}

type Edge = {
  name: string;
  side: string;
  w: number;
  colour: string;
  x: number;
  y: number;
  width: number;
  height: number;
  parentWidth: number;
  rowItem: boolean;
  tag: string;
  control: boolean;
};

async function edgesOf(page: Page): Promise<Edge[]> {
  return page.evaluate(() => {
    const out: Edge[] = [];
    for (const el of Array.from(document.querySelectorAll('*'))) {
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      if (cs.visibility === 'hidden' || cs.display === 'none') continue;
      const parent = el.parentElement;
      const pr = parent === null ? r : parent.getBoundingClientRect();
      for (const side of ['Top', 'Bottom', 'Left', 'Right']) {
        const w = parseFloat(cs.getPropertyValue(`border-${side.toLowerCase()}-width`));
        const style = cs.getPropertyValue(`border-${side.toLowerCase()}-style`);
        if (w > 0 && style !== 'none' && style !== 'hidden') {
          out.push({
            name: el.getAttribute('data-line') ?? el.getAttribute('data-block') ?? el.getAttribute('data-testid') ?? '',
            /* §26's row items: a section or an air column, each carrying its own top rule. */
            rowItem: el.hasAttribute('data-section') || el.getAttribute('data-cell') === 'air',
            side,
            w,
            colour: cs.getPropertyValue(`border-${side.toLowerCase()}-color`),
            x: r.x, y: r.y, width: r.width, height: r.height,
            parentWidth: pr.width,
            tag: el.tagName.toLowerCase(),
            control: ['input', 'select', 'textarea', 'button', 'a'].includes(el.tagName.toLowerCase()),
          });
        }
      }
    }
    return out as never;
  }) as Promise<Edge[]>;
}

async function seedRecord(page: Page): Promise<string> {
  const s = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const a = await page.request.post('/api/artists', { data: { name: `lines-${s}` } });
  const { id: artistId } = await a.json();
  trackArtist(artistId);
  const r = await page.request.post('/api/records', {
    data: { artistId, title: `Lines ${s}`, releaseYear: 1979, notes: 'A note, so the About cell is not empty.' },
  });
  const { id } = await r.json();
  return id as string;
}

test('the page states its own line set: two weights, one value, §3’s module axis (§16)', async ({ page }) => {
  await login(page);
  const id = await seedRecord(page);
  await page.setViewportSize({ width: 1440, height: NO_SCROLL_HEIGHT });
  await page.goto(`/records/${id}`);
  await page.waitForTimeout(800);

  const all = await edgesOf(page);
  /*
    §9.3's fields and buttons are controls, not the page's rules — §W.31's
    weights govern RULES. And a FRAME is not a rule either: §5.3 draws a
    four-sided border at paper luminance where a cover is missing, and a box
    has no bleed or inset to assert. Both are excluded by what they ARE, not
    by naming the elements, so a new control or a new frame does not need this
    list edited.
  */
  const boxed = new Set(
    all
      .filter((e) => all.filter((o) => o.x === e.x && o.y === e.y && o.tag === e.tag && o.name === e.name).length === 4)
      .map((e) => `${e.x},${e.y},${e.tag},${e.name}`),
  );
  const rules = all.filter(
    (e) => !e.control && e.tag !== 'header' && !boxed.has(`${e.x},${e.y},${e.tag},${e.name}`),
  );
  expect(rules.length, 'the page draws rules at all').toBeGreaterThan(5);

  /* 1. Two weights, and only the journal edge is the heavy one. */
  const heavy = rules.filter((e) => e.w >= JOURNAL_EDGE_W);
  expect(
    heavy.length,
    `§3: the journal's right edge is the ONLY 2px edge — found ${heavy.length}: ${heavy.map((h) => `${h.tag}.${h.name}/${h.side}@${Math.round(h.x)},${Math.round(h.y)}`).join(' ')}`,
  ).toBe(1);
  expect(heavy[0].side, 'the journal edge is a RIGHT edge').toBe('Right');

  const light = rules.filter((e) => e.w < JOURNAL_EDGE_W);
  for (const e of light) {
    expect(e.w, `every other rule is 1px — ${e.tag}.${e.name}/${e.side}`).toBe(1);
  }

  /* 2. One hairline value, §W.27's 0.72 on §W.5's paper. */
  expect(PAPER.L, 'the paper the ratio was measured on').toBe(0.925);
  for (const e of light) {
    expect(e.colour, `§W.27's one hairline value — ${e.tag}.${e.name}/${e.side}`).toBe(HAIRLINE);
  }

  /*
    3a. The two insets STAY inset — §3's named failure mode is extending them.

    **An inset is a rule narrower than the box it is drawn ON**, not one
    narrower than the page. §26 gives the lower region rows of varied spans,
    so each section's own top rule is 1080 or 720 or 600 or 360 wide — each
    bleeding fully across the section that draws it, which is §3's full-bleed
    separator doing its job one row at a time. Measuring against the viewport
    counted all four as insets and reported the region's rows as a violation
    of a rule about the identity block.
  */
  const insets = light.filter(
    (e) => e.side === 'Top' && e.width > 0 && e.width < e.parentWidth - 1 && !e.rowItem,
  );
  const widths = insets.map((e) => Math.round(e.width)).sort((a, b) => b - a);
  expect(
    widths,
    `§3's two inset hairlines: 372 under the identity block, 220 over Images — found ${widths.join(', ')}`,
  ).toEqual([372, 220]);

  /* 3b. Everything else bleeds to ITS OWN container, never the viewport (§16). */
  const viewport = page.viewportSize()?.width ?? 0;
  const bleeding = light.filter((e) => !insets.includes(e) && (e.side === 'Top' || e.side === 'Bottom'));
  for (const e of bleeding) {
    /*
      **A section's rule bleeds across the SECTION**, which §26 makes one row
      item rather than the whole page. The rules of a row line up into one
      line because the items share a top edge, and that is asserted in
      `extended-grid.spec.ts` where the rows are; here the claim is only that
      no rule is sized to something it is not drawn on.
    */
    const container = e.rowItem ? e.width : e.parentWidth;
    expect(
      Math.round(e.width),
      `a bleeding rule spans its own container — ${e.tag}.${e.name}/${e.side}`,
    ).toBe(Math.round(container));
    expect(e.width, 'and is never sized to the viewport by accident').toBeLessThanOrEqual(viewport);
  }
});

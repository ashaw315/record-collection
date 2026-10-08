import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { WRITE_CAPTURES } from './write-captures';
import { registerCleanup, trackArtist } from './cleanup';
import { isFarView, nearViewMinWidth } from '../src/app/wall/view-fork';

registerCleanup();

/**
 * 8a §W.24: the narrow shelf is the far view — measured rather than chosen.
 *
 * At 390px the near view holds about two seats, and two of two hundred is
 * not a fixture; the far view has no width floor because its labels are
 * absent rather than shrunk. Two consequences, both asserted here: a tap goes
 * to the record screen rather than to a pulled state (the landing needs a
 * 560 cover and a 420 panel side by side), and the rail collapses to one
 * band. This spec runs on the MOBILE project — the finding §W.24 keeps is
 * that no mobile project ran the shelf specs, so the view had no narrow form
 * and nothing asserted that it did.
 */
const PASSWORD = process.env.E2E_PASSWORD ?? 'test-password-for-e2e';
const suffix = () => `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

async function login(page: Page) {
  await page.goto('/login');
  await page.locator('form[data-hydrated="true"]').waitFor({ timeout: 15_000 });
  await page.getByLabel('Password').pressSequentially(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL('/');
}

const box = (page: Page, selector: string) =>
  page.evaluate((q) => {
    const r = document.querySelector(q)?.getBoundingClientRect();
    return r ? { top: r.top, bottom: r.bottom, left: r.left, width: r.width, height: r.height } : null;
  }, selector);

test.beforeEach(async ({ page }) => {
  await login(page);
});

test('at 390px the shelf is the far view in one column, the rail one band, and a tap opens the record', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  expect(isFarView(390)).toBe(true);
  const artist = await page.request.post('/api/artists', { data: { name: `Narrow-${suffix()}` } });
  const artistId = (await artist.json()).id as string;
  trackArtist(artistId);
  const record = await page.request.post('/api/records', { data: { title: 'Wired', artistId } });
  expect(record.status()).toBe(201);
  const recordId = (await record.json()).id as string;

  await page.goto(`/?artistId=${artistId}`);
  await expect(page.getByTestId('wall')).toBeAttached({ timeout: 30_000 });
  await expect(page.locator('[data-wall="overview"]')).toBeVisible();
  await expect(page.locator('[data-wall="labelled"]')).toHaveCount(0);
  await expect(page.locator('[data-region="facts"]')).toHaveCount(0);

  /* The rail is one band: full width, under the nav, above the count; the filter lines and the rule withdrawn. */
  const nav = await box(page, '[data-app-nav]');
  const rail = await box(page, '[data-testid="wall-rail"]');
  const count = await box(page, '[data-testid="wall-count-far"]');
  expect(nav && rail && count).toBeTruthy();
  if (!nav || !rail || !count) return;
  expect(rail.width, 'the band spans the viewport').toBeGreaterThan(300);
  expect(rail.height, 'one band, not a column').toBeLessThan(160);
  expect(Math.abs(rail.top - nav.bottom)).toBeLessThan(2);
  expect(count.top).toBeGreaterThanOrEqual(rail.bottom);
  const railEl = page.getByTestId('wall-rail');
  await expect(railEl.getByLabel('Search')).toBeVisible();
  await expect(railEl.getByRole('link', { name: 'Shelf' })).toBeVisible();
  await expect(railEl.getByRole('link', { name: 'Add record' })).toBeVisible();
  await expect(railEl.getByLabel('Sort')).toBeHidden();
  await expect(railEl.locator('[data-rail-rule]')).toBeHidden();
  /* §W.26: Add record is a row item in the band — on the same line as the views, not wrapped under them. */
  const shelfLink = await railEl.getByRole('link', { name: 'Shelf' }).boundingBox();
  const addLink = await railEl.getByRole('link', { name: 'Add record' }).boundingBox();
  expect(shelfLink && addLink).toBeTruthy();
  if (shelfLink && addLink) {
    /* To the right of the views and overlapping them vertically: the same row, not the line under it. */
    expect(addLink.x, 'to the right').toBeGreaterThan(shelfLink.x + shelfLink.width);
    expect(addLink.y, 'one row').toBeLessThan(shelfLink.y + shelfLink.height);
    expect(addLink.y + addLink.height, 'one row').toBeGreaterThan(shelfLink.y);
  }
  /*
    Nothing overflows the width: the page does not scroll sideways. Exactly.
    This allowed one pixel (`scrollWidth <= innerWidth + 1`), and one pixel
    was the size of the defect it then missed: at 320 the page was 321. A
    tolerance sized to admit the bug. No tolerance now.
  */
  expect(await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]), 'the page is as wide as the window').toEqual([390, 390]);

  /* A tap goes to the record screen; nothing is pulled. */
  /*
    **Tapped where the seat is drawn, not at the middle of its box.** In the
    overview a spine is a slanted sliver of its bounding box; the rest of the
    box belongs to its neighbours and to the shelf's uprights. A tap at the
    box's centre landed on this seat or not according to where the record
    fell on the wall, which depends on how many other records there are:
    among the seventeen alone it fell beside an upright, 30 of 49 sampled
    points of its box were the upright's, and the tap never arrived (6 Oct).
    It passed in full runs on what other specs had left on the wall. So the
    point is found by asking the page which point of the box is the seat's
    own, and the test says so if there is none.
  */
  const seat = page.locator(`[data-wall="overview"] a[data-far-seat="${recordId}"]`);
  const own = await seat.evaluate((el) => {
    const r = el.getBoundingClientRect();
    for (let i = 1; i < 16; i += 1) for (let j = 1; j < 16; j += 1) {
      const x = r.left + (r.width * i) / 16; const y = r.top + (r.height * j) / 16;
      const hit = document.elementFromPoint(x, y);
      if (hit !== null && el.contains(hit)) return { x, y };
    }
    return null;
  });
  expect(own, 'some point of the seat’s box is the seat’s own to tap').not.toBeNull();
  if (own === null) return;
  await page.mouse.click(own.x, own.y);
  await expect(page).toHaveURL(new RegExp(`/records/${recordId}`));
  expect(await page.locator('[data-pulled]').count()).toBe(0);
});

test('the fork is one number: widening past it brings the near view back, with the rail a column again', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.getByTestId('wall')).toBeAttached({ timeout: 30_000 });
  await expect(page.locator('[data-wall="overview"]')).toBeVisible();

  await page.setViewportSize({ width: nearViewMinWidth(), height: 844 });
  await expect(page.locator('[data-wall="labelled"]')).toBeVisible();
  await expect(page.locator('[data-wall="overview"]')).toHaveCount(0);
  const rail = await box(page, '[data-testid="wall-rail"]');
  expect(rail?.width).toBeCloseTo(148, 0);
  await expect(page.getByTestId('wall-rail').getByLabel('Sort')).toBeVisible();

  await page.setViewportSize({ width: nearViewMinWidth() - 1, height: 844 });
  await expect(page.locator('[data-wall="overview"]')).toBeVisible();
  await expect(page.locator('[data-wall="labelled"]')).toHaveCount(0);
});

test('the first paint is the far view: with no script at all, 390px shows the overview and hides the labelled wall (§W.26’s flash, handled)', async ({ browser, page: signedIn }) => {
  /* The login form needs script to submit; the session cookie does not. Sign in with script, then look with none. */
  await login(signedIn);
  const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 844 }, storageState: await signedIn.context().storageState() });
  const page = await context.newPage();
  try {
    await page.goto('/');
    await expect(page.getByTestId('wall')).toBeAttached({ timeout: 30_000 });
    /* Both are in the document — the server has no width, and with no script none is ever measured — and the stylesheet decides. */
    await expect(page.locator('[data-wall-container][data-unmeasured]')).toBeAttached();
    await expect(page.locator('[data-region="far"]')).toBeVisible();
    await expect(page.locator('[data-region="near"]')).toBeHidden();
    await page.setViewportSize({ width: nearViewMinWidth(), height: 844 });
    await expect(page.locator('[data-region="near"]')).toBeVisible();
    await expect(page.locator('[data-region="far"]')).toBeHidden();
  } finally {
    await context.close();
  }
});

/*
  Adam's ruling, superseding §W.24's "the rail collapses to one row: search,
  the three view names, add record": "search and the rest of the record page
  items should be on separate lines, it reads awkward." Built as two rows:
  search across the band, then the view names and Add record.

  Measured before, as §W.24 was built: at 390 the search field was 115.2
  wide and ran 4.0 under SHELF; at 320 it was 46.2 wide, and the band was
  321 in a 320 window.
*/
for (const width of [390, 320]) {
  /* Fails against the one row: the field is 115.2 or 46.2 wide and not the band's width, and the views are beside it, not beneath; and at 320 the page is 321 wide. */
  test(`at ${width}px search has its own row across the band, the view names and Add record are on the row beneath, nothing overlaps, and the page is exactly the window’s width`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/');
    await expect(page.locator('[data-wall="overview"]')).toBeVisible({ timeout: 30_000 });
    const m = await page.evaluate(() => {
      const rail = document.querySelector('[data-testid="wall-rail"]') as HTMLElement;
      const r = (el: Element) => { const b = el.getBoundingClientRect(); return { left: b.left, top: b.top, right: b.right, bottom: b.bottom, width: b.width, height: b.height }; };
      const link = (name: string) => Array.from(rail.querySelectorAll('a')).find((a) => (a.textContent ?? '').trim().toLowerCase() === name) as HTMLElement;
      return {
        window: window.innerWidth, page: document.documentElement.scrollWidth, rail: r(rail),
        label: r(rail.querySelector('label[for="rail-search"]') as HTMLElement), field: r(rail.querySelector('#rail-search') as HTMLElement),
        shelf: r(link('shelf')), table: r(link('table')), grid: r(link('grid')), add: r(link('add record')),
      };
    });
    const INSET = 20;
    /* Exactly, with no pixel of tolerance: the tolerance in the test above is what let 321 in 320 through. */
    expect(m.page, 'the page is exactly as wide as the window: no sideways scroll').toBe(m.window);
    expect(m.rail.width, 'and so is the band').toBe(m.window);
    expect(m.field.left, 'the search field starts on the inset').toBeCloseTo(INSET, 1);
    expect(m.field.width, 'and runs the band’s width inside the insets').toBeCloseTo(width - 2 * INSET, 1);
    for (const name of ['shelf', 'table', 'grid', 'add'] as const) expect(m[name].top, `${name} is beneath the search field, not beside it`).toBeGreaterThanOrEqual(m.field.bottom);
    expect(m.shelf.left, 'the view names start on the inset').toBeCloseTo(INSET, 1);
    expect(m.add.right, 'and Add record ends on it').toBeCloseTo(width - INSET, 1);
    const boxes = [['the search field', m.field], ['the search label', m.label], ['Shelf', m.shelf], ['Table', m.table], ['Grid', m.grid], ['Add record', m.add]] as const;
    for (let i = 0; i < boxes.length; i += 1) for (let j = i + 1; j < boxes.length; j += 1) {
      const [an, a] = boxes[i]; const [bn, b] = boxes[j];
      const apart = a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top;
      expect(apart, `${an} and ${bn} do not overlap`).toBe(true);
    }
    expect(m.table.left - m.shelf.right, 'the view names keep their 18').toBeCloseTo(18, 1);
    expect(m.add.left - m.grid.right, 'and Add record is at least that clear of them').toBeGreaterThanOrEqual(18);
    expect(m.rail.height, 'still one band').toBeLessThan(160);

    /*
      **Measured, not asserted: what a tap on each of these lands on.** They
      draw 14 to 16.5 tall; §9.3 rules every control 44 tall, and whether
      these are §9.3's controls is the Collection screen's own ruling. So the
      tap area is read, by asking the page what is under each point around
      the link, and printed for that ruling. No threshold is asserted here.
    */
    const taps = await page.evaluate(() => {
      const rail = document.querySelector('[data-testid="wall-rail"]') as HTMLElement;
      return Array.from(rail.querySelectorAll('a')).map((a) => {
        const b = a.getBoundingClientRect(); const cx = b.left + b.width / 2; const cy = b.top + b.height / 2;
        const mine = (x: number, y: number) => { const hit = document.elementFromPoint(x, y); return hit !== null && (a.contains(hit) || hit === a); };
        let up = 0; while (up < 60 && mine(cx, cy - up - 1)) up += 1;
        let down = 0; while (down < 60 && mine(cx, cy + down + 1)) down += 1;
        let left = 0; while (left < 200 && mine(cx - left - 1, cy)) left += 1;
        let right = 0; while (right < 200 && mine(cx + right + 1, cy)) right += 1;
        return { name: (a.textContent ?? '').trim(), drawn: [Math.round(b.width * 10) / 10, Math.round(b.height * 10) / 10], tap: [left + right + 1, up + down + 1] };
      });
    });
    for (const t of taps) console.log(`TAP ${width}: ${t.name.padEnd(10)} drawn ${t.drawn[0]} × ${t.drawn[1]}, lands on it over ${t.tap[0]} × ${t.tap[1]}`);
    if (WRITE_CAPTURES) {
      const out = join('docs', 'captures', 'collection-band');
      mkdirSync(out, { recursive: true });
      await page.addStyleTag({ content: 'nextjs-portal{display:none!important}' });
      await page.screenshot({ path: join(out, `band-${String(width).padStart(4, '0')}-two-rows-search${Math.round(m.field.width)}-h${Math.round(m.rail.height * 10) / 10}.png`), clip: { x: 0, y: 0, width, height: 320 } });
    }
  });
}

/*
  Step 96, §W.24: "Give each link in the band a hit area 44 tall by the
  overlay §G.3 uses, meeting its neighbours halfway across each gap... if a
  44 overlay would cross the search field, stop and report the room. Set
  the view names and Add record on one baseline."

  Measured before, as step 95 left them: a tap landed on each link over its
  drawn box only, 14 to 18 tall; Add record's box stood 3 lower at its foot
  than the view names'.

  The room is read first and asserted as the precondition. A baseline is
  read by standing a zero-height inline box on it inside each link.
*/
for (const width of [390, 320]) {
  /* Fails against step 95's links, whose tap area is their drawn box, about 16 tall; and against Add record's block box, whose text sits lower. */
  test(`at ${width}px each of the band’s links is tappable over 44, to halfway across the gap to its neighbour, clear of the search field, and the four sit on one baseline`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/');
    await expect(page.locator('[data-wall="overview"]')).toBeVisible({ timeout: 30_000 });
    const m = await page.evaluate(() => {
      const rail = document.querySelector('[data-testid="wall-rail"]') as HTMLElement;
      const field = (rail.querySelector('#rail-search') as HTMLElement).getBoundingClientRect();
      const band = rail.getBoundingClientRect();
      const links = Array.from(rail.querySelectorAll('a')).map((a) => {
        const b = a.getBoundingClientRect(); const cx = b.left + b.width / 2; const cy = b.top + b.height / 2;
        const hit = (x: number, y: number) => document.elementFromPoint(x, y);
        const mine = (x: number, y: number) => { const el = hit(x, y); return el !== null && a.contains(el); };
        /* The tap area's edges, to a tenth of a pixel, walking out from the centre. */
        const reach = (dx: number, dy: number) => { let d = 0; while (d < 120 && mine(cx + dx * (d + 0.1), cy + dy * (d + 0.1))) d += 0.1; return Math.round(d * 10) / 10; };
        const up = reach(0, -1), down = reach(0, 1), left = reach(-1, 0), right = reach(1, 0);
        const probe = document.createElement('span');
        probe.style.cssText = 'display:inline-block;width:0;height:0;vertical-align:baseline';
        a.appendChild(probe);
        const baseline = probe.getBoundingClientRect().top;
        probe.remove();
        const at = (x: number, y: number) => { const el = hit(x, y); return el === null ? 'nothing' : a.contains(el) ? 'self' : el.id === 'rail-search' || el.closest('form') !== null ? 'search' : (el.closest('a')?.textContent ?? el.tagName).trim().toLowerCase(); };
        return {
          name: (a.textContent ?? '').trim(), drawn: { left: b.left, right: b.right, top: b.top, bottom: b.bottom },
          tap: { top: cy - up, bottom: cy + down, left: cx - left, right: cx + right, height: up + down, width: left + right },
          inside: { top: at(cx, cy - up + 1), bottom: at(cx, cy + down - 1), left: at(cx - left + 1, cy), right: at(cx + right - 1, cy) },
          baseline,
          overlay: getComputedStyle(a, '::before').height,
          /* Taps a tenth of a pixel inside where a 44 area ends, and a pixel and a half outside it, above and below the link's centre. */
          justInside: [mine(cx, cy - 21.9), mine(cx, cy + 21.9)],
          justOutside: [mine(cx, cy - 23.5), mine(cx, cy + 23.5)],
          /* Every pixel down the centre line and along the first 44 of the foot's width: the area has no hole in it. The current view's marker lies inside it. */
          holes: Array.from({ length: 43 }, (_, i) => i - 21).filter((d) => !mine(cx, cy + d)).concat(Array.from({ length: 43 }, (_, i) => i - 21).filter((d) => !mine(Math.min(b.right - 1, b.left + 4), cy + d))),
        };
      });
      return { fieldBottom: field.bottom, bandBottom: band.bottom, bandHeight: band.height, links };
    });
    /* The room, read first: a 44 overlay centred on a link, against the search field's foot above it and the band's foot below. */
    for (const link of m.links) {
      const centre = (link.drawn.top + link.drawn.bottom) / 2;
      expect(centre - 22, `${link.name}: a 44 overlay starts at or below the search field's foot, ${m.fieldBottom}`).toBeGreaterThanOrEqual(m.fieldBottom);
    }
    const views = m.links.filter((l) => l.name.toLowerCase() !== 'add record');
    for (const link of m.links) {
      /*
        44 tall, held so that no tolerance admits a shorter one. The
        overlay's own height is 44px exactly. A tap 21.9 above and below the
        link's centre lands on it, so the area is at least 43.8. A tap 23.5
        above and below does not, so it is under 47: the upper bound is
        loose because hit-testing resolves to the device pixel and this
        project's are not whole CSS pixels (a tap 22.6 out still landed).
        The walk out from the centre reads 44.9 for the same reason;
        asserting that within a pixel would have admitted an area of 43.
      */
      expect(link.overlay, `${link.name}: its overlay is 44 tall`).toBe('44px');
      expect(link.justInside, `${link.name}: taps 21.9 above and below its centre land on it`).toEqual([true, true]);
      expect(link.holes, `${link.name}: no point of it is taken by something else (offsets from its centre)`).toEqual([]);
      expect(link.justOutside, `${link.name}: taps 23.5 above and below do not`).toEqual([false, false]);
      expect(link.tap.top, `${link.name}: and does not reach the search field`).toBeGreaterThanOrEqual(m.fieldBottom);
      expect(link.inside, `${link.name}: a tap 1px inside each edge of its area lands on it`).toEqual({ top: 'self', bottom: 'self', left: 'self', right: 'self' });
    }
    /* Halfway across each 18 gap: neighbours' areas meet and neither takes the other's. */
    for (let i = 1; i < views.length; i += 1) {
      const gap = views[i].drawn.left - views[i - 1].drawn.right;
      const midway = views[i - 1].drawn.right + gap / 2;
      const y = (views[i].drawn.top + views[i].drawn.bottom) / 2;
      /* Asked of the page directly, a pixel and a half either side of the midpoint (hit-testing resolves to the device pixel): the left of it is the left link's, the right of it the right link's. */
      const sides = await page.evaluate(([x, yy]) => [x - 1.5, x + 1.5].map((px) => (document.elementFromPoint(px, yy)?.closest('a')?.textContent ?? 'not a link').trim()), [midway, y]);
      expect(sides, `the gap between ${views[i - 1].name} and ${views[i].name} is shared at its middle, ${midway}`).toEqual([views[i - 1].name, views[i].name]);
    }
    const baselines = m.links.map((l) => Math.round(l.baseline * 10) / 10);
    expect(Math.max(...baselines) - Math.min(...baselines), `the four sit on one baseline: ${m.links.map((l, i) => `${l.name} ${baselines[i]}`).join(', ')}`).toBeLessThanOrEqual(0.5);
    console.log(`BAND ${width}: height ${m.bandHeight}, search foot ${m.fieldBottom}, baselines ${m.links.map((l, i) => `${l.name} ${baselines[i]}`).join(', ')}; tap areas ${m.links.map((l) => `${l.name} ${Math.round(l.tap.width * 10) / 10}×${Math.round(l.tap.height * 10) / 10} from y ${Math.round(l.tap.top * 10) / 10}`).join(', ')}`);
  });
}

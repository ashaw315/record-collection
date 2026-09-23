import { describe, expect, it } from 'vitest';
import { frontFace, layoutRow, project, topFace, ROW_PITCH, SPINE_HEIGHT, type PlacedSeat } from './geometry';
import { wallLayout } from './wall-layout';
import { LANDING_PAD } from './landing';
import { DEFAULT_ROUTE_VIEW, arrivalSeat, nearView } from './route-view';

/**
 * §W.12: the route opens FAR, and moving between the two views has two named
 * targets and never an intermediate.
 *
 * The far view is where the near view zooms out to, so the way back is the way
 * in — the same input, not a continuous one: a wheel or a pinch is a
 * continuous gesture snapping to a target, and the snap is an intermediate the
 * reader can see. In is a click on a seat; out is the count in the facts
 * column, which is the collection's identity and what the zoom-out arrives at.
 *
 * The near view lands with the ADDRESSED SHELF at the region's top and the
 * SEAT at the region's left — not centred: centring puts half the region
 * behind the reader's target, and the shelf reads left to right.
 */
const seats = Array.from({ length: 30 }, (_, i) => ({ id: `r${i}`, section: 'S' }));
const placedOf = (index: number, row: number): PlacedSeat => layoutRow(seats.slice(0, 10), row)[index];

describe('the arrival needs no scroll (§W.29)', () => {
  /*
    The browser paints the server's markup before any client JavaScript runs,
    so a layout effect that scrolls is always a paint late: the wall appears
    at 0,0 and visibly travels into place. The arrival target does not depend
    on the measured region — it is the first seat's, and the window rule
    resolves to the same top faces at every size — so the drawing's own
    origin can start there and the landing IS scroll 0,0.
  */
  it('is the same target at every region size and collection size, so the server can bake it in', () => {
    const targets = new Set<string>();
    for (const region of [{ width: 872, height: 799 }, { width: 1400, height: 600 }, { width: 600, height: 1000 }]) {
      for (const n of [17, 200, 400]) {
        const all = Array.from({ length: n }, (_, i) => ({ id: `r${i}`, section: 'S' }));
        const layout = wallLayout(all, [], region.width, region.height);
        const seat = arrivalSeat(layout.placed);
        expect(seat).not.toBeNull();
        if (seat === null) continue;
        const row = layout.placed.filter((p) => p.z === seat.z);
        const [tx, ty] = nearView(seat, region, row);
        const [fx, fy] = layout.frame.viewBox.split(' ').map(Number);
        targets.add(`${Math.round(tx - fx)}/${Math.round(ty - fy)}`);
      }
    }
    expect(targets.size, `one target for every size: ${[...targets].join(' ')}`).toBe(1);
  });

});

describe('the route’s two views (§W.12, §W.29)', () => {
  it('opens NEAR on the desktop: §W.12’s far default is withdrawn, and far is a deliberate zoom-out (§W.29)', () => {
    expect(DEFAULT_ROUTE_VIEW).toBe('near');
  });

  it('names the shelf the arrival lands on: the first OCCUPIED one, not the fixture’s top corner (§W.29)', () => {
    /*
      The empty shelves are the room the collection grows into, and a view
      that opens on them opens on nothing. The same target §W.28 gives a
      click on a run.
    */
    const seats = Array.from({ length: 17 }, (_, i) => ({ id: `r${i}`, section: 'S' }));
    const { placed } = wallLayout(seats, [], 872, 799);
    const arrival = arrivalSeat(placed);
    expect(arrival?.id, 'the first seat of the occupied shelf').toBe('r0');
    /* With four shelves and 17 records only the top one is occupied, and it is the one addressed. */
    const zs = [...new Set(placed.map((p) => p.z))];
    expect(arrival?.z).toBe(Math.max(...zs));
    /* An empty collection has nothing to arrive at, and says so rather than guessing. */
    expect(arrivalSeat([])).toBeNull();
  });

  it('keeps the addressed seat inside the region at every collection size, the vertical target being reachable (§W.28)', () => {
    /*
      A row spans ~99px of screen height per seat (198 pitch × sin30), so a
      100-seat row spans ~9,900px against a 799-high region. A target taken
      over the WHOLE row is unreachable at that size, and after the scroller
      clamps it the addressed seat ends up below the region entirely —
      measured at 400 records: a row-end seat at 296..527 against a view
      ending at 219. Taking the target over the seats inside the horizontal
      window keeps it reachable, so the addressed seat is always shown.
    */
    const region = { width: 872, height: 799 };
    for (const n of [17, 200, 400]) {
      const all = Array.from({ length: n }, (_, i) => ({ id: `r${i}`, section: 'S' }));
      const layout = wallLayout(all, [], region.width, region.height);
      const [fx, fy, fw, fh] = layout.frame.viewBox.split(' ').map(Number);
      const zs = [...new Set(layout.placed.map((p) => p.z))].sort((a, b) => b - a);
      const row = layout.placed.filter((p) => p.z === zs[Math.min(1, zs.length - 1)]);
      for (const seat of [row[0], row[Math.floor(row.length / 2)], row[row.length - 1]]) {
        const [tx, ty] = nearView(seat, region, row);
        /* Clamped exactly as the scroller does. */
        const viewTop = fy + Math.min(Math.max(0, ty - fy), Math.max(0, fh - region.height));
        void Math.min(Math.max(0, tx - fx), Math.max(0, fw - region.width));
        const ys = [...topFace(seat), ...frontFace(seat)].map(([, y]) => y);
        expect(Math.min(...ys), `n=${n} seat ${seat.id} top inside`).toBeGreaterThanOrEqual(viewTop - 1);
        expect(Math.max(...ys), `n=${n} seat ${seat.id} bottom inside`).toBeLessThanOrEqual(viewTop + region.height + 1);
      }
    }
  });

  it('takes in the top faces of the seats the arrival shows, not just the addressed one — the wall descends to the right (§W.28)', () => {
    /*
      The addressed seat's own top face was the target, and every seat to its
      LEFT along the row sits higher on screen: +x projects to (cos30, sin30),
      so the row climbs as it goes back. Those neighbours arrived with their
      tops cut off by the region's edge — which is what a reader sees as a
      wall pushed off the top of the screen.
    */
    const region = { width: 900, height: 700 };
    const row = layoutRow(seats.slice(0, 20), 1);
    const seat = row[3];
    const [x, y] = nearView(seat, region, row);
    /* Every seat the window shows has its top face at or below the view's top edge. */
    const shown = row.filter((s) => {
      const xs = topFace(s).map(([px]) => px);
      return Math.max(...xs) >= x && Math.min(...xs) <= x + region.width;
    });
    expect(shown.length, 'the window holds more than the addressed seat').toBeGreaterThan(1);
    for (const s of shown) for (const [, py] of topFace(s)) expect(py, s.id).toBeGreaterThanOrEqual(y);
    /* Strictly higher than the addressed seat's own top, which is what was cutting its neighbours. */
    expect(y + LANDING_PAD).toBeLessThan(Math.min(...topFace(seat).map(([, py]) => py)));
  });

  it('lands the near view with the addressed shelf at the region’s top and the seat at its left', () => {
    const seat = placedOf(3, 1);
    const region = { width: 900, height: 700 };
    const [x, y] = nearView(seat, region, [seat]);
    /* The seat's own left edge, less the region's pad: the seat is AT the left, not behind it. */
    const seatLeft = Math.min(...[project(seat.x, seat.y, seat.z), project(seat.x, seat.y + 150, seat.z)].map(([px]) => px));
    expect(x).toBeCloseTo(seatLeft - LANDING_PAD, 6);
    /* The shelf's top: the row's top face, less the pad. A record stands ON the shelf, so the shelf's plane is above its top. */
    const shelfTop = project(seat.x, seat.y, seat.z + SPINE_HEIGHT)[1];
    expect(y).toBeCloseTo(shelfTop - LANDING_PAD, 6);
  });

  it('gives the row below a view one row-pitch further down, and the seat along one seat-pitch further right — never centred', () => {
    const region = { width: 900, height: 700 };
    const here = nearView(placedOf(3, 1), region, [placedOf(3, 1)]);
    const along = nearView(placedOf(4, 1), region, [placedOf(4, 1)]);
    const below = nearView(placedOf(3, 2), region, [placedOf(3, 2)]);
    /* Along the row: the seat pitch, projected — which runs down-right, since +x projects to (cos30, sin30). */
    const [sx, sy] = project(placedOf(4, 1).x - placedOf(3, 1).x, 0, 0);
    expect(along[0] - here[0]).toBeCloseTo(sx, 6);
    expect(along[1] - here[1]).toBeCloseTo(sy, 6);
    expect(sy, 'the wall descends to the right').toBeGreaterThan(0);
    /* Down a row: the row pitch, which projects straight down. */
    expect(below[0] - here[0]).toBeCloseTo(0, 6);
    expect(below[1] - here[1]).toBeCloseTo(ROW_PITCH, 6);
    /* Not centred: the seat is at the left edge, so more than half the region is to its right. */
    const seat = placedOf(3, 1);
    const seatLeft = project(seat.x, seat.y + 150, seat.z)[0];
    expect(seatLeft - here[0]).toBeLessThan(region.width / 2);
  });
});

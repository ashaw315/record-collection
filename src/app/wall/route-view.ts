import { DEPTH, frontFace, project, rightFace, topFace, type PlacedSeat } from './geometry';
import { LANDING_PAD } from './landing';
import type { View } from './view';

/**
 * **§W.29: the desktop route opens NEAR**, and the far view becomes a
 * deliberate zoom-out. §W.12's "the route opens far" is withdrawn above
 * §W.26's fork: at 17 records the far view is a 337px object with no labels
 * — §W.10 rules them absent there — and the drawing is identical at every
 * size below 80, because `perShelf` holds at twenty a shelf until the
 * collection outgrows it. So it can report neither quantity nor arrangement
 * at the common case, and a reader must click before anything is readable.
 * Opening far below a size and near above it was rejected on §W.28's own
 * ground: behaviour changing partway up the range, with a threshold the
 * reader cannot see.
 *
 * What opening near costs is stated rather than hidden: the fixture is
 * 442 × 1047 at 1:1 in a 968 × 799 region, so about three shelves of four
 * show and 526px of width is empty at 20 seats. The first is answered by
 * where it lands — the occupied shelf, via §W.22's pan — and the second is
 * the near view's standing condition, not a defect: a fixture narrower than
 * its region is what a 20-seat shelf looks like.
 *
 * The two named targets are unchanged (§W.12): in is a click on a seat, out
 * is a click on the count, which is the collection's identity in the facts
 * column and precisely what the zoom-out arrives at. Neither is a wheel or a
 * pinch — a continuous input snapping to a target is an intermediate the
 * reader can see. Below §W.26's fork the route still opens far (§W.24),
 * because there the near view is not a fixture.
 */
export type RouteView = 'far' | 'near';

export const DEFAULT_ROUTE_VIEW: RouteView = 'near';

/**
 * The seat the arrival lands on (§W.29): the first of the OCCUPIED shelves,
 * not the fixture's top corner. The empty shelves are the room the
 * collection grows into, and a view that opens on them opens on nothing —
 * the same target §W.28 gives a click on a run. `null` for an empty
 * collection, which has nothing to arrive at.
 *
 * Seats are laid out in wall order, so the first placed seat is the first
 * seat of the topmost occupied shelf.
 *
 * **Under a filter the occupied shelf is the matching records'** (step 104):
 * "the near view arrives on the first matching record's shelf, by the
 * collection's order, and where nothing matches it arrives as it would
 * unfiltered." §W.12 empties the seats a filter does not match and leaves
 * them placed, so the first placed seat can be hundreds from any match;
 * `emptied` names those seats. The first match and not the densest run,
 * because it is the one place the reader can predict from the order.
 */
export function arrivalSeat(placed: readonly PlacedSeat[], emptied: ReadonlySet<string> = new Set()): PlacedSeat | null {
  if (placed.length === 0) return null;
  return placed.find((seat) => !emptied.has(seat.id)) ?? placed[0];
}

/**
 * Where the near view lands on a seat, as the view's top-left in the svg's
 * px: **the addressed shelf at the region's top and the seat at its left**,
 * not centred. Centring puts half the region behind the reader's target —
 * records they have already passed — whereas the shelf reads left to right,
 * so the useful half of the region is the half after the seat. That is
 * §W.9's fill order applied to the viewport.
 *
 * The seat's left edge is its far-bottom corner in projection (+y runs
 * down-left), and the shelf's top is the row's top face.
 */
export function nearView(
  seat: PlacedSeat,
  _region: Pick<View, 'width' | 'height'>,
  row: readonly PlacedSeat[] = [seat],
): [number, number] {
  const left = project(seat.x, seat.y + DEPTH, seat.z)[0];
  /*
    The vertical target takes in the top faces of the seats the arrival will
    actually SHOW — those inside the horizontal window, not the whole row
    (§W.28). The wall descends to the right, so seats back along the row sit
    higher on screen and a target from the addressed seat alone cut their tops
    off. But a row spans ~99px of screen height per seat (198 pitch × sin30),
    so a 100-seat row spans ~9,900px against a 799-high region: a whole-row
    minimum is unreachable, and after the scroller clamps it the addressed
    seat can end up below the region entirely — measured at 400 records, a
    row-end seat landing at 296..527 against a view ending at 219. The window
    is what the region can hold, so the target is always reachable and the
    addressed seat is always in it. Padded by the same LANDING_PAD the
    horizontal target uses; the caller still clamps to the scroller.
  */
  const window = row.filter((s) => {
    const xs = [...topFace(s), ...frontFace(s), ...rightFace(s)].map(([x]) => x);
    return Math.max(...xs) >= left - LANDING_PAD && Math.min(...xs) <= left - LANDING_PAD + _region.width;
  });
  const visible = window.length > 0 ? window : [seat];
  const top = Math.min(...visible.flatMap((s) => topFace(s).map(([, y]) => y)));
  return [left - LANDING_PAD, top - LANDING_PAD];
}

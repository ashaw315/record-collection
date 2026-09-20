import { DEPTH, frontFace, project, rightFace, topFace, type PlacedSeat } from './geometry';
import { LANDING_PAD } from './landing';
import type { View } from './view';

/**
 * §11.12: **the route opens far, and there are two named targets.**
 *
 * The far view answers the question a reader has before choosing anything —
 * how much is here and how is it arranged — so it is where the route opens;
 * opening near lands them mid-shelf with no account of where that shelf is.
 * Out is the way in reversed and needs no control of its own: in is a click
 * on a seat, out is a click on the count, which is the collection's identity
 * sitting in the facts column and is precisely what the zoom-out arrives at.
 * Neither is a wheel or a pinch — a continuous input snapping to a target is
 * an intermediate the reader can see, and §11.12 rules there is none.
 */
export type RouteView = 'far' | 'near';

export const DEFAULT_ROUTE_VIEW: RouteView = 'far';

/**
 * Where the near view lands on a seat, as the view's top-left in the svg's
 * px: **the addressed shelf at the region's top and the seat at its left**,
 * not centred. Centring puts half the region behind the reader's target —
 * records they have already passed — whereas the shelf reads left to right,
 * so the useful half of the region is the half after the seat. That is
 * §11.9's fill order applied to the viewport.
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
    (§11.28). The wall descends to the right, so seats back along the row sit
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

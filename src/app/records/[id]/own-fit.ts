import { type Construction } from './construction';

/**
 * §33's per-record fit, which replaces §31's shared frame constant as the
 * setter of the drawn scale.
 *
 * §33: "Each record's drawing is scaled to the smaller of its inner box's
 * width and height over its own forms and disc... §5.1's requirement is that
 * a drawing depends only on its id and on constants; a fit to the record's
 * own arrangement satisfies it, and §31's real defect — a purchase repainting
 * an existing record — cannot happen, because nothing is fitted to the
 * collection."
 *
 * **The 1.5× cap is not here, and its absence is deliberate.** §33 wrote
 * "capped at 1.5 times the scale the shared frame gave" and Design has since
 * dropped it. The cap was chosen without measuring; measured across the
 * seventeen, the gains run 1.263× to 1.662× in a continuous spread with no
 * clustering at the bound, so the cap was trimming 3–11% off five records for
 * no observed reason. Adding it back is a ruling, not a tweak.
 *
 * **What this gives up, per §33:** "size as a carrier of the hash: a narrow
 * arrangement no longer draws small. Only one record is ever on screen here,
 * so cross-record size was never visible." §17's offset survives as the
 * drawing's position in its slack, which `ConstructionStill` places.
 */

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/**
 * The arrangement's own extent — every form's face points, plus the disc's
 * square.
 *
 * The disc is included because §33 says "over its own forms AND DISC", and a
 * box drawn to the forms alone would clip a disc that reaches past them.
 */
export function boundsOf(scene: Pick<Construction, 'forms' | 'disc'>): Bounds {
  const xs: number[] = [];
  const ys: number[] = [];
  for (const form of scene.forms) {
    for (const face of form.faces) {
      for (const [x, y] of face.points) {
        xs.push(x);
        ys.push(y);
      }
    }
  }
  xs.push(scene.disc.cx - scene.disc.r, scene.disc.cx + scene.disc.r);
  ys.push(scene.disc.cy - scene.disc.r, scene.disc.cy + scene.disc.r);

  return {
    minX: Math.min(...xs),
    minY: Math.min(...ys),
    maxX: Math.max(...xs),
    maxY: Math.max(...ys),
  };
}

/**
 * The record's own viewBox, padded by the same `FRAME_PAD` the shared frame
 * used.
 *
 * **No padding, per step 29(g).** §33: "remove FRAME_PAD -- the
 * construction's only margin is the cell's padding." The pad was §31's, and
 * §31 is withdrawn in whole, so it was an orphaned term rather than merely an
 * unstated one. Keeping it capped the largest gain at 1.396x; without it the
 * fit is to the arrangement's own bounds, which is what §33 means by "over its
 * own forms and disc".
 *
 * **Floored and ceiled to whole units, as §31 did.** Its note: "flooring the
 * origin grows the box on both sides of each axis, not only the extent", and
 * the rounding is the tolerance rather than slack. Keeping it means a
 * record's box cannot sit a fraction inside its own forms.
 */
export function ownFitViewBox(scene: Pick<Construction, 'forms' | 'disc'>): string {
  const b = boundsOf(scene);
  const x = Math.floor(b.minX);
  const y = Math.floor(b.minY);
  const w = Math.ceil(b.maxX) - x;
  const h = Math.ceil(b.maxY) - y;
  return `${x} ${y} ${w} ${h}`;
}

/**
 * §33: "It is then placed by the hash within whatever slack the binding
 * dimension leaves."
 *
 * The binding dimension is the one that fills the cell; the other leaves
 * slack, and where the drawing sits in that slack is §17's offset — the term
 * §33 keeps, having moved it out of size. Expressed as SVG's own alignment,
 * so the browser does the placement rather than a transform that would have
 * to be recomputed per width.
 *
 * Hash-driven and id-only, per §5.1. The nine values are the full cross of
 * SVG's three horizontal and three vertical alignments; only the one on the
 * slack axis is visible, since the binding axis has nothing to move in.
 */
const ALIGNMENTS = [
  'xMinYMin',
  'xMidYMin',
  'xMaxYMin',
  'xMinYMid',
  'xMidYMid',
  'xMaxYMid',
  'xMinYMax',
  'xMidYMax',
  'xMaxYMax',
] as const;

export function slackAlignment(recordId: string): string {
  /*
    The same hash shape the construction uses — `h * 31 + charCodeAt`, mod
    100 000 — so placement is a property of the id like every other term.
    Read directly rather than by advancing the scene's generator, which would
    change the arrangement every record already has.
  */
  let h = 0;
  for (let i = 0; i < recordId.length; i += 1) h = (h * 31 + recordId.charCodeAt(i)) % 100_000;
  return `${ALIGNMENTS[h % ALIGNMENTS.length]} meet`;
}

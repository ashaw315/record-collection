/**
 * **A diagonal's ends, from what the page reads of it (10 Nov).** sidebar-113.spec reads each `[data-diagonal]` in the
 * page and computes its ends here, outside the browser, so the computation has a test of its own: on gate 42824167411
 * the start was read from `offsetTop`, a whole pixel, and the end missed the header's rule by exactly 0.5 where the used
 * top (56.501156) put it 0.0012 off. The start is the offset parent's box plus the element's used `left` and `top`,
 * fractions kept, plus the parent's border; the end follows the transform's first column for the element's width.
 */
export type LineReading = {
  name: string;
  parentLeft: number;
  parentTop: number;
  clientLeft: number;
  clientTop: number;
  /** The used values, as `getComputedStyle` gives them: "56.501156px". */
  left: string;
  top: string;
  /** The transform matrix's first column: cos and sin of the rotation. */
  a: number;
  b: number;
  length: number;
  weight: string;
};

export type LineGeometry = { name: string; angle: number; weight: string; x1: number; y1: number; x2: number; y2: number };

export function lineGeometry(r: LineReading): LineGeometry {
  const x1 = r.parentLeft + parseFloat(r.left) + r.clientLeft;
  const y1 = r.parentTop + parseFloat(r.top) + r.clientTop;
  return { name: r.name, angle: (Math.atan2(r.b, r.a) * 180) / Math.PI, weight: r.weight, x1, y1, x2: x1 + r.a * r.length, y2: y1 + r.b * r.length };
}

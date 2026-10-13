import type { Page } from '@playwright/test';

/**
 * **Two hairlines with nothing drawn between them read as one rule of two,
 * or as a rule bounding an empty band.** Seen twice before this existed:
 * the nav menu's own hairline below its last row touching the header's
 * rule (`G.8/hairline-below-last`, withdrawn), and suggestions' panel
 * carrying a lower hairline 24 above the list's upper one (step 140, seen
 * in its first capture). Both were caught by someone looking; this is the
 * check that holds the convention instead (the coordinator, 13 Oct).
 *
 * The rule, as corrected: two hairlines overlapping in x with no content
 * between them, AT ANY DISTANCE, not only adjacent. A hairline is a 1px
 * top or bottom border that is drawn, or an `hr`. Content is anything a
 * reader sees between them in the overlap: a run of glyphs, a replaced
 * element (an image, an SVG, a canvas), a control, or a box with a visible
 * background or shadow.
 *
 * **What it does not see, said so the name is not read as more:** a rule
 * drawn as a background, a shadow, a gradient or inside an SVG; a border
 * thicker than 1px (a 2px bar is a mark, not a hairline); the shared line
 * of a collapsed table, where a row's top border and the row above's
 * bottom are one line (so top borders inside a collapsed table are left
 * out and the bottoms carry the reading); and anything hidden
 * (`getClientRects` empty) or inside a shadow root.
 */
export type DoubledHairline = {
  /** The upper line and the lower, each a tag with its first data attributes and which border it is. */
  above: string;
  below: string;
  /** Pixels between the two, the overlap across, and where the upper one stands. */
  apart: number;
  across: number;
  y: number;
};

/** One line, for a failure message. */
export function describeDoubled(d: DoubledHairline): string {
  return `${d.above} at ${d.y} and ${d.below} ${d.apart} below it: nothing drawn between, over ${d.across} across`;
}

/** The reading, in the page. Self-contained: Playwright serialises it, so nothing outside it may be referenced. */
function readDoubledHairlines(within: string): DoubledHairline[] {
  type Line = { y: number; left: number; right: number; what: string };
  type Box = { top: number; bottom: number; left: number; right: number };
  const root = (document.querySelector(within) ?? document.body) as HTMLElement;
  const elements = [root, ...Array.from(root.querySelectorAll<HTMLElement>('*'))].filter((el) => el.getClientRects().length > 0);
  const describe = (el: Element): string => {
    const named = Array.from(el.attributes).filter((a) => a.name.startsWith('data-') && !a.name.startsWith('data-testid')).map((a) => (a.value === '' ? a.name : `${a.name}=${a.value}`)).slice(0, 2);
    return `${el.tagName.toLowerCase()}${named.length === 0 ? '' : `[${named.join(',')}]`}`;
  };
  const drawn = (width: string, style: string, colour: string) => {
    const w = parseFloat(width);
    if (!(w >= 0.5 && w <= 1.5) || style === 'none' || style === 'hidden') return false;
    /* Only a four-part rgba carries an alpha; `rgb(0, 0, 0)` is black, not transparent (the first reading took its blue for an alpha of 0). */
    const alpha = /^rgba\((?:[^,]+,){3}\s*([\d.]+)\s*\)$/.exec(colour);
    return alpha === null || parseFloat(alpha[1] ?? '1') > 0;
  };
  /* A box (a border on every side: a control, a chip, a boxed sentence) has edges, not rules. Its edges are not lines, and the box is content. */
  const boxed = (cs: CSSStyleDeclaration) => [cs.borderTopWidth, cs.borderBottomWidth, cs.borderLeftWidth, cs.borderRightWidth].every((w) => parseFloat(w) > 0);

  const lines: Line[] = [];
  for (const el of elements) {
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    if (r.width < 1) continue;
    const collapsed = el.closest('table') !== null && getComputedStyle(el.closest('table') as Element).borderCollapse === 'collapse';
    if (el.tagName === 'HR' && r.height <= 1.5) { lines.push({ y: r.top, left: r.left, right: r.right, what: describe(el) }); continue; }
    if (boxed(cs)) continue;
    if (!collapsed && drawn(cs.borderTopWidth, cs.borderTopStyle, cs.borderTopColor)) lines.push({ y: r.top, left: r.left, right: r.right, what: `${describe(el)} top` });
    if (drawn(cs.borderBottomWidth, cs.borderBottomStyle, cs.borderBottomColor)) lines.push({ y: r.bottom - 1, left: r.left, right: r.right, what: `${describe(el)} bottom` });
  }
  lines.sort((a, b) => a.y - b.y || a.left - b.left);

  /* What a reader sees: glyphs, replaced elements, controls, and boxes with a visible background or shadow. */
  const content: Box[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
    if ((node.textContent ?? '').trim() === '') continue;
    const range = document.createRange();
    range.selectNodeContents(node);
    for (const rect of Array.from(range.getClientRects())) if (rect.width > 0 && rect.height > 0) content.push({ top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right });
  }
  for (const el of elements) {
    const cs = getComputedStyle(el);
    const replaced = /^(IMG|SVG|CANVAS|VIDEO|INPUT|SELECT|TEXTAREA|BUTTON)$/.test(el.tagName);
    const painted = (cs.backgroundColor !== 'rgba(0, 0, 0, 0)' && cs.backgroundColor !== 'transparent') || cs.backgroundImage !== 'none' || cs.boxShadow !== 'none';
    if (!replaced && !painted && !boxed(cs)) continue;
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) content.push({ top: r.top, bottom: r.bottom, left: r.left, right: r.right });
  }

  const tenth = (n: number) => Math.round(n * 10) / 10;
  const doubled: DoubledHairline[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    const a = lines[i] as Line;
    for (let j = i + 1; j < lines.length; j += 1) {
      const b = lines[j] as Line;
      if (b.y - a.y < 1) continue;
      const left = Math.max(a.left, b.left);
      const right = Math.min(a.right, b.right);
      if (right - left < 1) continue;
      /* The next line below `a` in this overlap is `b`; a third line between them makes `b` not a neighbour. */
      const between = (box: Box) => box.bottom > a.y + 1 && box.top < b.y && box.right > left && box.left < right;
      const lineBetween = lines.some((c) => c !== a && c !== b && c.y > a.y + 0.5 && c.y < b.y - 0.5 && Math.min(c.right, right) - Math.max(c.left, left) >= 1);
      if (lineBetween) continue;
      if (content.some(between)) continue;
      doubled.push({ above: a.what, below: b.what, apart: tenth(b.y - a.y), across: Math.round(right - left), y: tenth(a.y) });
    }
  }
  return doubled;
}

/** Every pair of hairlines in `within` (the whole body by default: the header's rule counts) with nothing drawn between them. */
export async function doubledHairlines(page: Page, within = 'body'): Promise<DoubledHairline[]> {
  return page.evaluate(readDoubledHairlines, within);
}

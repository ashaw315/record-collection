import { expect, type Locator, type Page } from '@playwright/test';

/**
 * **One reading of a control's type, for the §T.6 passes.** Written for
 * step 145 (part 1) and shared from part 2 on: what §4.1's label, §9.3's
 * box and §9.3's label are, read from computed style, and the Collection's
 * 40 heading. The colours are listed in both forms Chromium reports.
 */
export const INK = ['lab(6.18075 1.20374 2.12039)', 'oklch(0.19 0.008 60)'];
export const LABEL_INK = ['lab(35.0433 0.937879 2.8959)', 'oklch(0.44 0.008 70)'];

export type Read = { text: string; size: string; upper: string; mono: boolean; colour: string; weight: string; border: string; radius: string; fill: string; height: number; lineHeight: string; left: number; edges: { left: number; top: number; right: number; bottom: number } };
/** Read within a page or within one locator (a row, a form), so a reading needs no selector CSS cannot write. */
export const read = (scope: Page | Locator, selector: string) => scope.locator(selector).evaluateAll((els): Read[] => (els as HTMLElement[]).map((el) => { const cs = getComputedStyle(el); const b = el.getBoundingClientRect(); return { text: (el.textContent ?? '').trim().slice(0, 40), size: cs.fontSize, upper: cs.textTransform, mono: /mono/i.test(cs.fontFamily), colour: cs.color, weight: cs.fontWeight, border: cs.borderTopWidth, radius: cs.borderTopLeftRadius, fill: cs.backgroundColor, height: Math.round(b.height), lineHeight: cs.lineHeight, left: Math.round(b.left), edges: { left: b.left, top: b.top, right: b.right, bottom: b.bottom } }; }));

/* §4.1's label type: 11 mono uppercase in the label colour. */
export const expectLabel = (r: Read, what: string) => { expect.soft(r, `${what}: §4.1’s label type`).toMatchObject({ size: '11px', upper: 'uppercase', mono: true }); expect.soft(LABEL_INK, `${what}: in the label colour`).toContain(r.colour); };
/* §9.3's control, boxed: 11 mono uppercase in ink, a 1px square box, no fill; drawn 32 under a fine pointer and 44 under a coarse one (Design, 17 Oct: the 44 is the floor, a box meets it, and under a mouse a boxed control keeps its drawn size, as Save keeps its 32). */
export const expectBox = (r: Read, what: string, pointer: 'coarse' | 'fine') => { expect.soft(r, `${what}: a §9.3 box, ${pointer === 'coarse' ? 44 : 32} under a ${pointer} pointer`).toMatchObject({ size: '11px', upper: 'uppercase', mono: true, border: '1px', radius: '0px', fill: 'rgba(0, 0, 0, 0)', height: pointer === 'coarse' ? 44 : 32 }); expect.soft(INK, `${what}: in ink`).toContain(r.colour); };
/* §9.3's control as a label: the type, no box. */
export const expectLabelControl = (r: Read, what: string) => { expect.soft(r, `${what}: a §9.3 label`).toMatchObject({ size: '11px', upper: 'uppercase', mono: true, border: '0px' }); expect.soft(INK, `${what}: in ink`).toContain(r.colour); };
/* One heading weight with the Collection's: 40, semibold. */
export const expectHeading = (r: Read, what: string) => { expect.soft(r, `${what}: the 40 heading at the Collection’s weight`).toMatchObject({ size: '40px', weight: '600' }); expect.soft(INK, `${what}: in ink`).toContain(r.colour); };

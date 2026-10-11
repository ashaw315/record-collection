import type { Page } from '@playwright/test';

/**
 * **What a finger reaches, for every control on a screen.**
 *
 * §9.3's 44 "is a hit-target floor for every control a finger is expected
 * to hit, not a property of the boxed control", met "by overlay where the
 * drawn link is smaller". An overlay is a pseudo-element, which a box
 * reading cannot see (NOTES: the first band test read each link's box and
 * passed nothing). So this reads what a tap lands on: down the control's
 * middle for the height, and out from each side at its mid-height for how
 * far past the drawn thing a tap still reaches it.
 *
 * The second reading is the handoff's other half: "Blank paper is never a
 * tap target", a hit area reaching halfway to a neighbour and, with no
 * neighbour, 9 past the thing and no further.
 */
export type Reach = {
  name: string;
  kind: string;
  /** The drawn box. */
  width: number;
  height: number;
  /** Rows of pixels down the middle on which a tap reaches the control. */
  tall: number;
  /** Pixels past the drawn box's left and right edges on which a tap still reaches it. */
  left: number;
  right: number;
};

export const HIT_FLOOR = 44;
/** The handoff's figure: how far a hit area reaches past a thing with no neighbour. */
export const HIT_PAST = 9;

/** `except` leaves out the controls inside anything matching it: a part of the screen held for a ruling is named, not silently skipped. */
export function readReach(page: Page, within = 'main', except?: string): Promise<Reach[]> {
  return page.evaluate(([selector, held]) => {
    const root = document.querySelector(selector ?? 'main');
    if (root === null) throw new Error(`no ${selector}`);
    const shown = (el: Element) => (held === null || el.closest(held) === null) && el.getClientRects().length > 0 && el.checkVisibility({ contentVisibilityAuto: true, visibilityProperty: true });
    const out: Reach[] = [];
    for (const el of Array.from(root.querySelectorAll<HTMLElement>('button, a, select, input:not([type=hidden]), textarea, summary')).filter(shown)) {
      el.scrollIntoView({ block: 'center', inline: 'nearest' });
      const r = el.getBoundingClientRect();
      const reaches = (x: number, y: number) => {
        const at = document.elementFromPoint(x, y);
        if (at === null) return false;
        if (at === el || el.contains(at) || (at.contains(el) && (at.tagName === 'A' || at.tagName === 'LABEL'))) return true;
        /* A field's own label: a tap on it goes to the field, so it is the field's to a finger. */
        const label = at.closest('label');
        return label !== null && el.id !== '' && label.htmlFor === el.id;
      };
      const x = r.left + r.width / 2;
      const y = r.top + r.height / 2;
      let tall = 0;
      /*
        From the middle itself and not the pixel nearest it: a row of exactly
        44 that starts between two pixels holds 43 whole ones, which is what
        a rounded middle counted (stats at 320, one engine, step 126).
      */
      for (let dy = -40; dy <= 40; dy += 1) if (reaches(x, y + dy)) tall += 1;
      let left = 0;
      while (left < 40 && reaches(r.left - left - 1, y)) left += 1;
      let right = 0;
      while (right < 40 && reaches(r.right + right + 1, y)) right += 1;
      const name = ((el.textContent ?? '').trim() || el.getAttribute('aria-label') || (el as HTMLInputElement).placeholder || el.id || el.tagName).slice(0, 90);
      out.push({ name, kind: el.tagName.toLowerCase(), width: Math.round(r.width * 10) / 10, height: Math.round(r.height * 10) / 10, tall, left, right });
    }
    return out;
  }, [within, except ?? null] as const);
}

import type { Page } from '@playwright/test';

/** One stop of a Tab walk: what it is, where it stands, and what would cut §M.6's outside ring on it. */
export type Stop = {
  tag: string;
  name: string;
  /** The marked ancestors it stands in, innermost first. */
  place: string;
  box: string;
  /** A run or a record (a spine): the wall's drawn composition, whose marks are its own (§T.6). */
  composition: boolean;
  /** The nearest ancestor whose overflow cuts the ring's box, and the sides it cuts; null where nothing does. */
  clipped: string | null;
  /** What is drawn on it while it has keyboard focus, read from computed style. */
  ring: {
    /** The element's own outline: style, width, offset, and whether its colour is the ink. */
    outline: string;
    outlineInk: boolean;
    /** The `::after` overlay's outline, where a control draws the ring on the overlay that is its box (`data-ring="after"`). */
    afterOutline: string;
    afterOutlineInk: boolean;
    /** The label's outline, where a control is laid unseen over its label and the ring goes there (`data-ring="label"`). */
    labelOutline: string;
    labelOutlineInk: boolean;
    /** Inset shadows, the inside ring's channel: on the element, its `::before`, its `::after`, or the label that is its box. */
    insetShadow: boolean;
    /**
     * Whether the stop is `:focus-visible` at all. A date field is four Tab
     * stops in Chromium, month, day, year and its calendar button, and on the
     * last the host is not `:focus-visible`: the focus is on the browser's
     * own button inside the control, which draws the browser's ring and no
     * stylesheet rule reaches (14 Oct).
     */
    focusVisible: boolean;
    /** The `data-ring` mark, the hold (`data-ring-held`), and whether it stands in the filter panel, step 113's inside-ring case. */
    mark: string | null;
    held: boolean;
    panel: boolean;
  };
};

/** What a stop draws, as a word: the outside ring, the outside ring on its overlay, the inside ring, nothing, or something else named. */
export function drawnRing(stop: Stop): string {
  const r = stop.ring;
  if (!r.focusVisible) return 'the browser’s own, on a control inside the control';
  const outside = (outline: string, ink: boolean) => outline === 'solid 2px 2px' && ink;
  if (outside(r.outline, r.outlineInk) && !r.insetShadow && !outside(r.afterOutline, r.afterOutlineInk)) return 'outside';
  if (outside(r.afterOutline, r.afterOutlineInk) && r.outline.startsWith('none') && !r.insetShadow) return 'outside on the overlay';
  if (outside(r.labelOutline, r.labelOutlineInk) && r.outline.startsWith('none') && !r.insetShadow) return 'outside on the label';
  if (r.insetShadow && r.outline.startsWith('none') && !outside(r.afterOutline, r.afterOutlineInk)) return 'inside';
  if (r.outline.startsWith('none') && !r.insetShadow && r.afterOutline.startsWith('none') && r.labelOutline.startsWith('none')) return 'none';
  return `something else: outline ${r.outline}${r.outlineInk ? ' ink' : ' not ink'}; overlay outline ${r.afterOutline}; label outline ${r.labelOutline}; inset shadow ${r.insetShadow}`;
}

/** What §T.6 rules a stop draws: the composition's own marks; the hold; the inside ring where the container clips; the overlay's outside ring where the overlay is the box; the outside ring. */
export function expectedRing(stop: Stop): string {
  if (stop.composition) return 'own mark';
  if (stop.ring.held) return 'held';
  if (stop.ring.mark === 'inside' || stop.ring.panel) return 'inside';
  if (stop.ring.mark === 'after') return 'outside on the overlay';
  if (stop.ring.mark === 'label') return 'outside on the label';
  return 'outside';
}

/**
 * **Tab through one whole cycle of a page and record every stop** (step
 * 144, §T.6 "Focus, once for the app"). Not from the document's start: the
 * shelf's spines carry a positive `tabIndex` (§W.23, their own sequence),
 * and a positive tabindex is visited before every ordinary stop, so a walk
 * begun from a sentinel at the body's start would never meet them (the
 * probe of 14 Oct: the cycle is the seventeen spines, then the nav, the
 * rail, the zoom-out, then out of the page). So: Tab until focus leaves
 * the document (the browser's own chrome; `body` is active), then record
 * every stop until it leaves again. That is the cycle a reader gets, in
 * the order they get it. The dev overlay (`nextjs-portal`) is hidden first;
 * it is not in a build.
 *
 * For each stop, whether an ancestor's overflow would cut the outside ring:
 * the ring is a 2px outline offset 2, so its box is the control's box plus
 * 4 on every side, and an ancestor whose overflow is anything but `visible`
 * on an axis cuts it where that box leaves the ancestor's padding box on
 * that axis. The root and the body scroll rather than clip and are not
 * counted. An SVG ancestor's box is its own rect (it has no client box).
 * "Code counts the controls in clipping containers during the ring step,
 * and if there are several, this becomes a second rule": the count is
 * read here, and the walk reports what, not only how many.
 */
export async function walkTab(page: Page, limit = 400): Promise<Stop[]> {
  await page.addStyleTag({ content: 'nextjs-portal{display:none!important}' });
  const left = () => page.evaluate(() => document.activeElement === null || document.activeElement === document.body);
  let out = false;
  for (let i = 0; i < limit && !out; i += 1) {
    await page.keyboard.press('Tab');
    out = await left();
  }
  if (!out) throw new Error(`focus did not leave the page within ${limit} Tabs, so no cycle could be read`);
  const stops: Stop[] = [];
  for (let i = 0; i < limit; i += 1) {
    await page.keyboard.press('Tab');
    /*
      Read after the control has settled, not as it arrives: the shared
      button and input transition their outline, and a read mid-transition
      gave widths of 3px and 0px and a colour between the browser's and the
      ink (14 Oct). The family that keeps costing a round: a measurement
      taken before the thing measured has finished arriving.
    */
    await page.evaluate(async () => {
      /* Two frames first: the focus moved, and the style that answers it (`:focus-visible`, a transition's start) is a frame behind; a date field read "none" on its first stop otherwise. */
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      await Promise.all((document.activeElement?.getAnimations({ subtree: true }) ?? []).map((animation) => animation.finished.catch(() => undefined)));
    });
    const stop = await page.evaluate((): Stop | 'end' => {
      const el = document.activeElement as HTMLElement | null;
      if (el === null || el === document.body) return 'end';
      const MARKS = ['data-app-nav', 'data-collection-band', 'data-collection-views', 'data-testid', 'data-wall', 'data-run', 'data-seat', 'data-spine', 'data-record', 'data-pulled', 'data-set-bar', 'data-shelf-offered', 'data-shelf-fallback', 'data-screen-frame', 'data-filter', 'data-filter-panel', 'data-slot'];
      const describe = (n: Element) => {
        const marks: string[] = [];
        for (const mark of MARKS) { const v = n.getAttribute(mark); if (v !== null) marks.push(v === '' ? mark : `${mark}=${v}`); }
        return `${n.tagName.toLowerCase()}${marks.length === 0 ? '' : `[${marks.join(' ')}]`}`;
      };
      const place: string[] = [];
      for (let n = el.parentElement; n !== null; n = n.parentElement) { const d = describe(n); if (d.includes('[')) place.push(d); }
      const r = el.getBoundingClientRect();
      const ring = { left: r.left - 4, top: r.top - 4, right: r.right + 4, bottom: r.bottom + 4 };
      let clipped: string | null = null;
      for (let n = el.parentElement; n !== null && clipped === null; n = n.parentElement) {
        if (n === document.documentElement || n === document.body) continue;
        const cs = getComputedStyle(n);
        const x = cs.overflowX !== 'visible';
        const y = cs.overflowY !== 'visible';
        if (!x && !y) continue;
        const b = n.getBoundingClientRect();
        const inner = n instanceof SVGElement
          ? { left: b.left, top: b.top, right: b.right, bottom: b.bottom }
          : { left: b.left + n.clientLeft, top: b.top + n.clientTop, right: b.left + n.clientLeft + n.clientWidth, bottom: b.top + n.clientTop + n.clientHeight };
        const sides: string[] = [];
        if (x && ring.left < inner.left - 0.5) sides.push('left');
        if (x && ring.right > inner.right + 0.5) sides.push('right');
        if (y && ring.top < inner.top - 0.5) sides.push('top');
        if (y && ring.bottom > inner.bottom + 0.5) sides.push('bottom');
        if (sides.length > 0) clipped = `${describe(n)} (overflow ${cs.overflowX}/${cs.overflowY}) cuts the ${sides.join(', ')}`;
      }
      const name = (el.getAttribute('aria-label') ?? el.getAttribute('title') ?? (el.textContent ?? '').trim()).replace(/\s+/g, ' ').slice(0, 40) || (el as HTMLInputElement).placeholder || el.id || `#${el.getAttribute('data-seat') ?? ''}`;
      /* The ink as the stylesheet computes it WHERE THE CONTROL STANDS (the header re-tokens `--foreground`), so a colour read off a control can be compared as a string. */
      const probe = document.createElement('i');
      probe.style.color = 'var(--foreground)';
      (el.parentElement ?? document.body).append(probe);
      const ink = getComputedStyle(probe).color;
      probe.remove();
      const cs = getComputedStyle(el);
      const after = getComputedStyle(el, '::after');
      const outlineOf = (s: CSSStyleDeclaration) => (s.outlineStyle === 'none' || s.outlineWidth === '0px' ? `none (${s.outlineStyle} ${s.outlineWidth})` : `${s.outlineStyle} ${s.outlineWidth} ${s.outlineOffset}`);
      const label = el.closest('label');
      const labelStyle = label === null ? null : getComputedStyle(label);
      const inset = [cs.boxShadow, getComputedStyle(el, '::before').boxShadow, after.boxShadow, label === null ? 'none' : getComputedStyle(label).boxShadow].some((shadow) => /inset/.test(shadow));
      const drawn = {
        outline: outlineOf(cs),
        outlineInk: cs.outlineColor === ink,
        afterOutline: outlineOf(after),
        afterOutlineInk: after.outlineColor === ink,
        labelOutline: labelStyle === null ? 'none (no label)' : outlineOf(labelStyle),
        labelOutlineInk: labelStyle !== null && labelStyle.outlineColor === ink,
        insetShadow: inset,
        focusVisible: el.matches(':focus-visible'),
        mark: el.getAttribute('data-ring'),
        held: el.hasAttribute('data-ring-held'),
        panel: el.closest('[data-filter-panel]') !== null,
      };
      return {
        tag: el.tagName.toLowerCase(),
        name,
        place: place.join(' › '),
        box: `${Math.round(r.width)}×${Math.round(r.height)} at ${Math.round(r.left)},${Math.round(r.top)}`,
        composition: el.closest('[data-run], [data-seat], [data-spine]') !== null,
        clipped,
        ring: drawn,
      };
    });
    if (stop === 'end') return stops;
    stops.push(stop);
  }
  throw new Error(`the cycle did not close within ${limit} Tabs`);
}

/** The stops as a Markdown table, one row a stop. */
export function stopsTable(stops: Stop[]): string[] {
  const cell = (s: string) => s.replace(/\|/g, '/');
  return [
    '| # | element | text or label | stands in | box | ring cut by | ring drawn | ring ruled |',
    '|---|---|---|---|---|---|---|---|',
    ...stops.map((s, i) => `| ${i + 1} | ${s.tag}${s.composition ? ' (composition)' : ''} | ${cell(s.name)} | ${cell(s.place) || '(none)'} | ${s.box} | ${s.clipped === null ? '' : cell(s.clipped)} | ${s.composition ? '' : cell(drawnRing(s))} | ${s.composition ? '' : expectedRing(s)} |`),
  ];
}

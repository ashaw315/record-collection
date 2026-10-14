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
};

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
      return {
        tag: el.tagName.toLowerCase(),
        name,
        place: place.join(' › '),
        box: `${Math.round(r.width)}×${Math.round(r.height)} at ${Math.round(r.left)},${Math.round(r.top)}`,
        composition: el.closest('[data-run], [data-seat], [data-spine]') !== null,
        clipped,
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
    '| # | element | text or label | stands in | box | ring cut by |',
    '|---|---|---|---|---|---|',
    ...stops.map((s, i) => `| ${i + 1} | ${s.tag}${s.composition ? ' (composition)' : ''} | ${cell(s.name)} | ${cell(s.place) || '(none)'} | ${s.box} | ${s.clipped === null ? '' : cell(s.clipped)} |`),
  ];
}

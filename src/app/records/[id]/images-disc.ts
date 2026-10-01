import { CELL_PADDING } from './extended-grid';

/**
 * §60 (step 70): the Images quarter-disc's reference is a HEIGHT, not a
 * rendering. "The section's heading, its padding and one tile row, with the
 * cover note excluded at every count. One tile row is notional: the column
 * width at that viewport, since tiles are square, plus the badge and
 * caption, not the first rendered row."
 *
 * §56 sized the disc against the section as it stands with one image, and
 * that rendering held the cover note, a sentence shown at one image only;
 * holding the disc constant then meant keeping the note's row as blank
 * height beside the tiles, which let ornament set the height of the content
 * area. Naming the parts removes the accident instead of compensating for
 * it, and survives a sentence being added to or taken from the section.
 */

/** The gallery grid's gap, `gap-2`. */
export const TILE_GAP = 8;

/** The grid's columns by VIEWPORT, as its own breakpoints lay them: `grid-cols-2 sm:grid-cols-3 lg:grid-cols-4`. */
export function tileColumnsAt(viewportWidth: number): 2 | 3 | 4 {
  if (viewportWidth >= 1024) return 4;
  if (viewportWidth >= 640) return 3;
  return 2;
}

/** A square tile's side: the inner width less the gaps, over the columns. */
export function tileWidth(innerWidth: number, columns: number, gap = TILE_GAP): number {
  return (innerWidth - gap * (columns - 1)) / columns;
}

/** The named parts, summed. No count and no rendering goes in. */
export function discReference(parts: { heading: number; padding: number; tile: number; badge: number; caption: number }): number {
  return parts.heading + 2 * parts.padding + parts.tile + parts.badge + parts.caption;
}

/**
 * The reference read from the Images section in the browser: its heading
 * (the label cell), §33's padding above and below the content, and one
 * notional tile row at this viewport, the badge and caption lines measured
 * from the gallery's own type by a probe that is removed again. Passed to
 * the section's flat as the disc's height term.
 */
export function imagesDiscReference(host: HTMLElement): number {
  const label = host.querySelector<HTMLElement>('[data-cell="label"]');
  const heading = label === null ? 0 : label.getBoundingClientRect().height;
  const tile = tileWidth(host.clientWidth - 2 * CELL_PADDING, tileColumnsAt(window.innerWidth));
  const line = (className: string) => {
    const probe = document.createElement('span');
    probe.className = className;
    probe.textContent = 'Xg';
    probe.style.cssText = 'position:absolute;visibility:hidden;display:block';
    host.appendChild(probe);
    const cs = getComputedStyle(probe);
    const height = probe.getBoundingClientRect().height + parseFloat(cs.marginTop) + parseFloat(cs.marginBottom);
    probe.remove();
    return height;
  };
  return discReference({ heading, padding: CELL_PADDING, tile, badge: line(BADGE_LINE), caption: line(CAPTION_LINE) });
}

/** The badge's and caption's classes as the tiles render them, so the notional row is measured in the real type. */
export const BADGE_LINE = 'mt-1 block text-label font-mono uppercase tracking-[0.09em]';
export const CAPTION_LINE = 'mt-1 block text-caption';

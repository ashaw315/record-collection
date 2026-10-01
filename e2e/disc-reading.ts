import { CELL_PADDING } from '../src/app/records/[id]/extended-grid';

/**
 * §60's reference, computed in the page from its named parts: the Images
 * section's heading (the label cell), its padding above and below, and one
 * notional tile row -- the column width at that viewport, plus one badge
 * line and one caption line measured from the gallery's own type, never a
 * rendered row. Shared by the step-66/70 spec, the §53 host test and the
 * real-collection report, so every reading of the disc is against the same
 * definition the component states.
 */
export const DISC_REFERENCE_JS = `((sec) => {
  const label = sec.querySelector('[data-cell="label"]');
  const heading = label ? label.getBoundingClientRect().height : 0;
  const inner = sec.clientWidth - 2 * ${CELL_PADDING};
  const columns = window.innerWidth >= 1024 ? 4 : window.innerWidth >= 640 ? 3 : 2;
  const tile = (inner - 8 * (columns - 1)) / columns;
  const probe = (cls) => { const p = document.createElement('span'); p.className = cls; p.textContent = 'Xg'; p.style.cssText = 'position:absolute;visibility:hidden;display:block'; sec.appendChild(p); const cs = getComputedStyle(p); const h = p.getBoundingClientRect().height + parseFloat(cs.marginTop) + parseFloat(cs.marginBottom); p.remove(); return h; };
  const badge = probe('mt-1 block text-label font-mono uppercase tracking-[0.09em]');
  const caption = probe('mt-1 block text-caption');
  return { heading, tile, badge, caption, reference: heading + 2 * ${CELL_PADDING} + tile + badge + caption };
})`;

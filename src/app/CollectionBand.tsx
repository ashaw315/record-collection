import type { FilterOption } from './CollectionFilters';
import type { CollectionParams } from './collection-params';
import { WallRail } from './WallRail';
import { bandRules } from './wall/band-rules';

/**
 * **The table and grid's band (§T.1): the shelf's, in its two-row form at
 * every width.**
 *
 * "What they share with the shelf is §W.24's search field and its row of
 * view names, and this file points at them and does not restate them." So
 * this renders the shelf's own rail and gives it the band's rules with no
 * media query, since these views have no rail to be at wide widths.
 *
 * The search field takes the record page's title measure where the window
 * has it and the width less the insets where it has not (ruled 8 Oct): a
 * field the band's whole width is 1400 at 1440. The form keeps the row, so
 * the view names stay beneath it; only the field and its label are held to
 * the measure.
 */
const SEARCH_MEASURE = 443;

/*
  §T.2: Add record is ink. The rail's link carries the label style and the
  ink class together, and the label style's colour wins, so it draws in the
  label colour (measured, 8 Oct). Set here for these views; the shelf's is
  reported and not changed by this step.
*/
const INK_VALUE = 'oklch(0.19 0.008 60)';

export function CollectionBand({ params, genres }: { params: CollectionParams; genres: readonly FilterOption[] }) {
  return (
    <div data-collection-band="">
      <style>{`${bandRules('[data-collection-band] ')}
  [data-collection-band] #rail-search { max-width: ${SEARCH_MEASURE}px; }
  [data-collection-band] [data-testid="wall-rail"] > a { color: ${INK_VALUE}; }`}</style>
      <WallRail params={params} genres={genres} />
    </div>
  );
}

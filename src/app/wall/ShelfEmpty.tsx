'use client';

import { useRouter } from 'next/navigation';
import { parseCollectionParams, toQueryString } from '../collection-params';
import { HAIRLINE, INK, LABEL_INK, LABEL_TYPE } from '../records/[id]/grid-type';

/**
 * Step 104, §W.29: "Where a filter or search matches nothing, the shelf
 * says so: one sentence in the label colour, centred over the arrival's
 * region, saying nothing matches, with CLEAR FILTERS beneath it as a §9.3
 * control. The seats stay drawn and empty, because §W.12's emptied shelf is
 * the honest picture of a filter matching nothing, but without the sentence
 * it reads as a fault. There is no figure... The sentence sits on paper
 * over the region and does not move with the pan."
 *
 * It lies over the region's box and not inside what the region scrolls, so
 * a pan moves the shelving under it and not the sentence. The layer takes
 * no pointer: the wall beneath still pans under a finger anywhere but on
 * the control.
 */
export function ShelfEmpty() {
  const router = useRouter();
  return (
    <div data-shelf-empty-layer="" className="pointer-events-none absolute inset-0 flex items-center justify-center">
      <div data-shelf-empty="" className="pointer-events-auto flex flex-col items-center gap-[18px]">
        <p data-shelf-empty-sentence="" className="text-detail" style={{ color: LABEL_INK }}>
          Nothing in the collection matches.
        </p>
        <button
          type="button"
          data-shelf-empty-clear=""
          onClick={() => {
            /* Every filter and the search go; the order, the view and the wall the reader chose stay. */
            const current = parseCollectionParams(new URLSearchParams(window.location.search));
            const query = toQueryString({ ...current, filters: {}, page: 1 });
            router.push(query === '' ? '/' : `/?${query}`);
          }}
          className={`${LABEL_TYPE} ${INK} box-border flex h-[44px] cursor-pointer items-center justify-center border ${HAIRLINE} px-[18px] decoration-1 underline-offset-[3px] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground`}
        >
          Clear filters
        </button>
      </div>
    </div>
  );
}

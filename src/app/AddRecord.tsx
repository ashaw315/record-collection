import Link from 'next/link';
import { HAIRLINE, INK, LABEL, LABEL_TYPE } from './records/[id]/grid-type';

/**
 * §T.1, step 113: "ADD RECORD stands at [the content column's] top right, a
 * §9.3 label with a + and a 1px rule beneath, as the search field has."
 *
 * Its rule is on the search field's: the box above it repeats the sidebar's
 * 34 and SEARCH's own line, unseen, so the two rules agree by construction
 * and not by a number that would have to follow the label's type.
 */
export function AddRecord() {
  return (
    <div className="absolute top-0 right-0 pt-[34px]">
      <span aria-hidden="true" className={`invisible block ${LABEL}`}>
        Search
      </span>
      <Link data-add-record="" href="/records/new" className={`mt-[6px] box-border flex h-[44px] w-[132px] items-center justify-between border-b ${HAIRLINE} ${LABEL_TYPE} ${INK}`}>
        Add record
        <svg aria-hidden="true" width="12" height="12" viewBox="0 0 12 12" shapeRendering="crispEdges" className="shrink-0 fill-none stroke-[oklch(0.19_0.008_60)] stroke-1">
          <line x1="0" y1="6" x2="12" y2="6" />
          <line x1="6" y1="0" x2="6" y2="12" />
        </svg>
      </Link>
    </div>
  );
}

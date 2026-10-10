/**
 * Step 118: the five screens' content pinned left. Stats, the want list,
 * look up and the record form keep their 736 and manage its 1,120, and each
 * starts at the 20 inset §T.1 gives the table and grid, "so a centred column
 * would [not] put the heading under nothing and the wordmark over paper".
 * Not ruled by Design yet; the coordinator's reading, built for its captures.
 *
 * The classes are written out whole because Tailwind reads them from the
 * source; `screen-frame.test.ts` holds each to the figures.
 */
export const SCREEN = { inset: 20, measure: 736, manage: 1120, review: 1000 } as const;

export const SCREEN_FRAME = 'w-full max-w-[776px] px-5';
export const MANAGE_FRAME = 'w-full max-w-[1160px] px-5';
/** Manage's match review, which stood in a narrower centred column of its own. */
export const REVIEW_FRAME = 'w-full max-w-[1040px] px-5';

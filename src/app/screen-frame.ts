/**
 * Step 118: the screens' content pinned left, not centred, each at the
 * measure it had. Step 120, §T.1: "Content starts at the wordmark's 18 on
 * every screen and at every width, phones included", so the wordmark
 * stands over the heading; step 118's 20 stood 2 right of it
 * (`T.1/content-inset-20`). The table, the grid and the shelf's band take
 * the same figure from here.
 *
 * The classes are written out whole because Tailwind reads them from the
 * source; `screen-frame.test.ts` holds each to the figures.
 */
export const SCREEN = { inset: 18, measure: 736, manage: 1120, review: 1000, item: 640 } as const;

/** Stats, the want list, look up, the record form and suggestions. */
export const SCREEN_FRAME = 'w-full max-w-[772px] px-[18px]';
/** Manage, and the not-found page, which had the same measure. */
export const MANAGE_FRAME = 'w-full max-w-[1156px] px-[18px]';
/** Manage's match review, which stood in a narrower centred column of its own. */
export const REVIEW_FRAME = 'w-full max-w-[1036px] px-[18px]';
/** The want list's new form, an item's page and its edit form. */
export const ITEM_FRAME = 'w-full max-w-[676px] px-[18px]';
/** The table's and grid's content below the sidebar's fork: the window less the inset a side. */
export const CONTENT_INSET = 'px-[18px]';

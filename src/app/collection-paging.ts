/**
 * Pagination arithmetic for the collection screen (SPEC.md §10, §5).
 *
 * Pure and apart from the component: every defect here is an off-by-one that
 * renders as a plausible control rather than an error — a "Next" button on the
 * last page, a range reading "51–100 of 60", a page 0 link. None of them throw.
 */

/** How many pages of `pageSize` cover `total` rows. Never 0 — see the test. */
export function pageCount(total: number, pageSize: number): number {
  return Math.max(1, Math.ceil(total / pageSize));
}

/**
 * What the user is looking at, in words.
 *
 * Written as a sentence rather than "Page 3 of 5" because the useful question
 * standing in a record shop is "how much of my collection am I seeing", not
 * "which page index is this".
 */
export function rangeLabel(input: {
  page: number;
  pageSize: number;
  total: number;
  rows: number;
}): string {
  if (input.total === 0) return 'No records';
  if (input.total === 1) return '1 record';

  // A page past the end is reachable by editing the URL. Say so plainly rather
  // than computing a range for rows that are not there.
  if (input.rows === 0) return `No records on page ${input.page}`;

  const first = (input.page - 1) * input.pageSize + 1;
  // Bounded by the rows ACTUALLY returned, not by page * pageSize, or a partial
  // last page reports more than exists.
  const last = first + input.rows - 1;

  return `${first}–${last} of ${input.total}`;
}

/** How many numbered links the control shows at once. */
const WINDOW = 5;

/**
 * The numbered page links to render.
 *
 * Fixed width, clamped at both ends. A window that shrinks near the edges makes
 * the buttons move under the cursor as you page, and one that centres naively
 * produces page 0 near the start.
 */
export function pageWindow(current: number, pages: number): number[] {
  const width = Math.min(WINDOW, pages);

  // Centre, then slide back inside the bounds rather than truncating — that is
  // what keeps the width constant.
  const half = Math.floor(width / 2);
  const start = Math.min(Math.max(1, current - half), pages - width + 1);

  return Array.from({ length: width }, (_, index) => start + index);
}

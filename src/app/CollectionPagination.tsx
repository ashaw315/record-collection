'use client';

import Link from 'next/link';
import { cn } from '@/lib/utils';
import { pageCount, pageWindow, rangeLabel } from './collection-paging';
import { toQueryString, type CollectionParams } from './collection-params';

/**
 * Page controls for the collection screen (SPEC.md §10, §5).
 *
 * Real `<Link>`s rather than buttons that navigate: a page is a URL, so it
 * should be middle-clickable, openable in a new tab, and visible in the status
 * bar on hover. This is also the one control that does NOT need the pending-ref
 * treatment used by the filters — each link's href depends only on the page
 * number it points at, not on accumulated intent.
 */
export function CollectionPagination({
  params,
  total,
  rows,
  pageSize,
}: {
  params: CollectionParams;
  total: number;
  rows: number;
  pageSize: number;
}) {
  const pages = pageCount(total, pageSize);
  const label = rangeLabel({ page: params.page, pageSize, total, rows });

  // One page and nothing to navigate: the range line still renders, because
  // "how much am I seeing" is useful even when the answer is "all of it".
  const showControls = pages > 1;

  const href = (page: number) => {
    const query = toQueryString({ ...params, page });
    return query === '' ? '/' : `/?${query}`;
  };

  return (
    <nav
      aria-label="Pagination"
      className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3"
    >
      {/* Announced on change, so a screen reader hears the new range after
          following a page link rather than only the page contents. */}
      <p className="text-xs text-muted-foreground" aria-live="polite">
        {label}
      </p>

      {showControls && (
        <div className="flex items-center gap-1">
          {/* Rendered as a disabled span rather than omitted at the ends: a
              control that disappears shifts every other button under the
              cursor mid-click. */}
          {params.page > 1 ? (
            <Link href={href(params.page - 1)} className={stepClass} rel="prev">
              Previous
            </Link>
          ) : (
            <span className={cn(stepClass, disabledClass)} aria-disabled="true">
              Previous
            </span>
          )}

          {pageWindow(params.page, pages).map((page) => {
            const current = page === params.page;
            return (
              <Link
                key={page}
                href={href(page)}
                aria-current={current ? 'page' : undefined}
                aria-label={`Page ${page}`}
                className={cn(
                  'min-w-8 rounded-xs border px-2 py-1 text-center text-xs tabular-nums transition-colors',
                  current
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border hover:bg-accent',
                )}
              >
                {page}
              </Link>
            );
          })}

          {params.page < pages ? (
            <Link href={href(params.page + 1)} className={stepClass} rel="next">
              Next
            </Link>
          ) : (
            <span className={cn(stepClass, disabledClass)} aria-disabled="true">
              Next
            </span>
          )}
        </div>
      )}
    </nav>
  );
}

const stepClass =
  'rounded-xs border border-border px-2 py-1 text-xs whitespace-nowrap transition-colors hover:bg-accent';

const disabledClass = 'pointer-events-none opacity-40 hover:bg-transparent';

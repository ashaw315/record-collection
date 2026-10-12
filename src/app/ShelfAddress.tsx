'use client';

import { useEffect } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { shelfOfferedQuery } from './wall/view-fork';

/**
 * Step 134, §W.24: "a shelf link ... opens the grid silently with the
 * address replaced." What is drawn is a media query's and needs no script.
 * This is the other half: an address that ASKS for the shelf, in a window
 * the shelf is not offered in, would go on saying shelf over a grid. So the
 * view is cleared from it, by replacement and never a push, and Back does
 * not return to an address that cannot draw.
 *
 * A bare `/` is not touched: it means the view this window gets, and that
 * is what lets widening bring the shelf back with nothing stored.
 */
export function ShelfAddress() {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();

  useEffect(() => {
    if (search.get('view') !== 'shelf') return;
    const offered = window.matchMedia(shelfOfferedQuery());
    const correct = () => {
      if (offered.matches) return;
      const rest = new URLSearchParams(search.toString());
      rest.delete('view');
      const query = rest.toString();
      router.replace(query === '' ? pathname : `${pathname}?${query}`, { scroll: false });
    };
    correct();
    offered.addEventListener('change', correct);
    return () => offered.removeEventListener('change', correct);
  }, [pathname, router, search]);

  return null;
}

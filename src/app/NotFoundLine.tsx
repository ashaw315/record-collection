'use client';

import { usePathname } from 'next/navigation';

/**
 * §G.5: "one line saying what was not found". A not-found page receives no
 * route parameters, so the address is read from the path the reader asked
 * for -- the one fact the page can state for certain about every way in.
 */
export function NotFoundLine() {
  const pathname = usePathname();
  return (
    <p data-testid="not-found-line" className="text-prose">
      Nothing was found at <span className="font-mono">{pathname}</span>.
    </p>
  );
}

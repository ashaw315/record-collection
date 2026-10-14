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
    /* Step 145: the sentence in the label colour, under the heading, as the error screen's. */
    <p data-testid="not-found-line" className="mt-1 text-prose text-[oklch(0.44_0.008_70)]">
      Nothing was found at <span className="font-mono">{pathname}</span>.
    </p>
  );
}

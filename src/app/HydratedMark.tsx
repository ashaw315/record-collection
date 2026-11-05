'use client';

import { useEffect, useRef } from 'react';

/**
 * A hidden mark that reads `data-hydrated="true"` only after React has run an
 * effect on this page, for a page whose links are pressed by a test before
 * anything else on it would prove hydration.
 *
 * The forms (RecordForm, WantListForm, the login page), the filters and the
 * wall each set the same attribute on their own root for the same reason: a
 * server-rendered element's presence proves nothing about its handlers, and a
 * press on a Link before hydration navigates or drops (step 160's measured
 * cause). The want-list pages had no such element, so their presses waited on
 * nothing and dropped on three of four mobile runs at four workers (5 Nov).
 * The mark draws nothing and changes no behaviour; a test waits on it attached.
 */
export function HydratedMark() {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    ref.current?.setAttribute('data-hydrated', 'true');
  }, []);
  return <span ref={ref} hidden aria-hidden="true" data-hydrated="false" />;
}

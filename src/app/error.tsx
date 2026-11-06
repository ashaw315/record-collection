'use client';

import { useEffect } from 'react';
import { AppHeader } from '@/components/AppHeader';
import { ErrorBody } from './ErrorBody';
import { SCREEN_FRAME } from './screen-frame';

/**
 * The error screen, for every route (step 142, Design, 12 Oct).
 *
 * "A page that fails draws the app's header and nav ... This is §G.5's
 * argument for the not-found page, which reaches any failure: a reader who
 * lands somewhere broken still needs the header and a way back." Until this
 * file the app had no boundary of its own, and a page that threw drew the
 * framework's "This page couldn't load": no header, nothing of the app's.
 * Seen once for real before it was built (13 Oct): the want list, where a
 * row lost its artist between two reads.
 *
 * At the app's root, and the only one, so it is the boundary for every
 * route beneath it (`ErrorBody.test.tsx` holds that there is one). The
 * header is drawn here because each page draws its own and the page is
 * what failed. If the header or the root layout is what failed, this file
 * is not reached and `global-error.tsx` draws the body bare.
 *
 * The error itself is not shown: the server has logged it with its digest,
 * and "No stack traces in responses" (CLAUDE.md §6) holds for a screen too.
 */
export default function ErrorScreen({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  /*
    The one way to `global-error.tsx` from a browser (13 Oct): an error
    component that throws reaches the boundary above it, and above this one
    is the bare fallback. Next draws that file in development since 15.2, so
    a test and a capture can read the real file rather than a stand-in. Only
    while the probe's second cookie says so, and only while the probe pages
    are open: the root layout writes `data-e2e-probes` on the document from
    the same gate the pages use (src/lib/probes.ts), which is never a deploy.
    This read the NODE_ENV literal until 5 Nov; a build inlines that into the
    client bundle whatever the server runs under, so the branch was gone from
    every build-served run (Q39).

    Thrown in the render where the gate is readable, and from the effect
    after commit where it was not. Measured 5 Nov, both servers: a throw in the screen's
    first render passes the boundary above in the same pass and reaches
    global-error.tsx; a throw from a later render is caught by that boundary,
    which remounts this screen, whose effect throws again, without end (the
    dev server, "Maximum update depth exceeded"). Under a build the 500
    document's html carries no layout attribute until React commits the root
    from the payload, so the first render reads no gate and commits; the
    effect then throws, the boundary remounts the screen, and that fresh
    first render throws in-pass. Neither server renders this screen
    into the HTML.
  */
  const asked = () => typeof document !== 'undefined' && document.documentElement.dataset.e2eProbes === '1' && document.cookie.split('; ').includes('error-probe-global=1');
  useEffect(() => { if (asked()) throw error; }, [error]);
  if (asked()) throw error;
  return (
    <>
      <AppHeader />
      <main data-screen-frame="" className={`${SCREEN_FRAME} py-6`}>
        <ErrorBody retry={retry} />
      </main>
    </>
  );
}

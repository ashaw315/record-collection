'use client';

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
    while the probe's second cookie says so, and not in a production build:
    NODE_ENV is inlined into the client bundle, so this branch is not in it.
  */
  if (process.env.NODE_ENV !== 'production' && typeof document !== 'undefined' && document.cookie.split('; ').includes('error-probe-global=1')) throw error;
  return (
    <>
      <AppHeader />
      <main data-screen-frame="" className={`${SCREEN_FRAME} py-6`}>
        <ErrorBody retry={retry} />
      </main>
    </>
  );
}

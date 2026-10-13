import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { AppHeader } from '@/components/AppHeader';
import { SCREEN_FRAME } from '@/app/screen-frame';

/**
 * A page that fails on purpose, so the error screen can be reached by a
 * test and a capture (step 142). No real page throws on demand.
 *
 * It throws while the cookie `error-probe` is `throw`, and draws one line
 * when it is not: so TRY AGAIN can be shown to recover a page whose cause
 * has gone. With a second cookie, `error-probe-global=1`, the error screen
 * rethrows (`error.tsx`) and the bare fallback, `global-error.tsx` itself,
 * is what draws: no stand-in (13 Oct; the first build drew one at
 * `?bare=1`, which Design was ruling from).
 *
 * **404s in production**, as the other probes do.
 */
export const dynamic = 'force-dynamic';

export default async function ErrorProbePage() {
  if (process.env.NODE_ENV === 'production') notFound();
  const asked = (await cookies()).get('error-probe')?.value;
  if (asked === 'throw') throw new Error('the error probe, throwing as asked');
  /* `sleep`: the page answers after six seconds, so a request can be in flight while something else happens (`cleanup-in-flight.spec.ts`). */
  if (asked === 'sleep') await new Promise((resolve) => setTimeout(resolve, 6_000));
  return (
    <>
      <AppHeader />
      <main data-screen-frame="" className={`${SCREEN_FRAME} py-6`}>
        <p data-error-probe-recovered="" className="text-prose">
          The page loaded.
        </p>
      </main>
    </>
  );
}

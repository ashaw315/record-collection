import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { AppHeader } from '@/components/AppHeader';
import { ErrorBody } from '@/app/ErrorBody';
import { SCREEN_FRAME } from '@/app/screen-frame';

/**
 * A page that fails on purpose, so the error screen can be reached by a
 * test and a capture (step 142). No real page throws on demand.
 *
 * It throws while the cookie `error-probe` is `throw`, and draws one line
 * when it is not: so TRY AGAIN can be shown to recover a page whose cause
 * has gone. With `?bare=1` it draws the fallback's body with no header,
 * which is what `global-error.tsx` draws when the root layout itself has
 * failed; that file cannot be reached from a browser without breaking the
 * layout, so this stands in for it in a capture and says so there.
 *
 * **404s in production**, as the other probes do.
 */
export const dynamic = 'force-dynamic';

export default async function ErrorProbePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (process.env.NODE_ENV === 'production') notFound();
  const params = await searchParams;
  if (params.bare === '1') {
    return (
      <main data-screen-frame="" className={`${SCREEN_FRAME} py-6`}>
        <ErrorBody />
      </main>
    );
  }
  if ((await cookies()).get('error-probe')?.value === 'throw') throw new Error('the error probe, throwing as asked');
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

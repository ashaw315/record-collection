import { AppHeader } from '@/components/AppHeader';
import { NotFoundLine } from './NotFoundLine';
import { SCREEN_FRAME } from '@/app/screen-frame';
import { CONTROL_BOX } from '@/app/records/[id]/grid-type';

/**
 * Step 145 (§T.6, part 1): "A not-found page draws the header, the 40
 * heading Not found., the built sentence naming the address, and one §9.3
 * control, COLLECTION, as the error screen does." The frame is the error
 * screen's; the sentence is the client component that reads the address.
 */
export default function NotFound() {
  return (
    <>
      <AppHeader />
      <main data-screen-frame="" className={`${SCREEN_FRAME} py-6`}>
        <h1 className="font-heading text-headline font-semibold tracking-tight">Not found.</h1>
        <NotFoundLine />
        <div className="mt-6 flex flex-wrap gap-6">
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- a full load, as the error screen's way back is. */}
          <a href="/" className={CONTROL_BOX}>
            Collection
          </a>
        </div>
      </main>
    </>
  );
}

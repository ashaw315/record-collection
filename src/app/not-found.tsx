import { AppHeader } from '@/components/AppHeader';
import { NotFoundLine } from './NotFoundLine';
import { MANAGE_FRAME } from '@/app/screen-frame';

/**
 * §G.5 (step 75): the app's own not-found page. Next's default carried no
 * header, so a reader who followed a dead record link had no way back. The
 * header is on every screen a signed-in reader can reach; this is one.
 */
export default function NotFound() {
  return (
    <>
      <AppHeader />
      <main data-screen-frame="" className={`${MANAGE_FRAME} py-6`}>
        <NotFoundLine />
      </main>
    </>
  );
}

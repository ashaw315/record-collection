import { notFound } from 'next/navigation';
import { AppHeader } from '@/components/AppHeader';
import { SCREEN_FRAME } from '@/app/screen-frame';
import { GapAnalysis } from '../GapAnalysis';

/**
 * Ask Claude's panel, drawn so a browser test can press it (step 140).
 *
 * `/suggestions` draws the panel only where a model key is configured, and
 * the test environment has none on purpose: that is the gate that keeps a
 * spec from ever reaching the model. So the panel's own rulings — nothing
 * moves when ASK CLAUDE changes its label or fails, it stacks below 640 —
 * could not be tested where they are drawn. Here it is drawn configured,
 * with nothing behind it: a test answers `/api/suggestions/ai` in the page,
 * and a press that is not answered there reaches a server with no key,
 * which refuses before any call.
 *
 * **404s in production**, as the wall's probes do. The paragraph beneath
 * the panel stands for the list that follows it on the real screen, so a
 * test can see whether what is beneath the panel moved.
 */
export const dynamic = 'force-dynamic';

export default function AskPanelProbePage() {
  if (process.env.NODE_ENV === 'production') notFound();

  return (
    <>
      <AppHeader />
      <main data-screen-frame="" className={`${SCREEN_FRAME} py-5`}>
        <div className="mb-6">
          <GapAnalysis last={null} previous={null} genres={[{ id: '00000000-0000-4000-8000-000000000001', name: 'Rock' }, { id: '00000000-0000-4000-8000-000000000002', name: '  Psychedelic Rock' }]} configured />
        </div>
        <p data-after-panel="" className="text-prose text-muted-foreground">
          What follows the panel.
        </p>
      </main>
    </>
  );
}

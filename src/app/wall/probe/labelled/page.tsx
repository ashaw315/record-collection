import { execFileSync } from 'node:child_process';
import { basename } from 'node:path';
import { notFound } from 'next/navigation';
import { WallComposition } from '../../WallComposition';
import { COLLECTION_SPINES } from '../../../../../test/fixtures/collection-spines';
import { collectionSeats, collectionSummaries } from '../collection-seats';

/**
 * The wall composition on the real collection — seventeen records on four
 * shelves, their own labels, paper at rest (§11); click one to slide it out
 * and watch its colour arrive across the gesture.
 *
 * On a probe route, gated like the others: the 1:1 component is built and
 * measured here before the swap that puts it at `/`. The overview's probe
 * draws synthetic seats because it is about density; this one draws the
 * collection because labels and ink are about these records.
 *
 * Removal condition, with the other wall probes: this route, its exemption in
 * `every-page-has-nav`, and its guard come out together when the swap lands.
 */
export const dynamic = 'force-dynamic';

/*
  Which build this is, in the directory the server runs in, where a screenshot
  catches it. Two days of diagnosis rested on a screenshot of a pre-fix worktree
  read as the fix. The harness 404s in production and is not uploaded, so git is
  always here. Marked when the tree has changes, since then the commit alone
  does not name the build.
*/
function buildStamp(): string {
  const git = (...args: string[]) => execFileSync('git', args, { encoding: 'utf8' }).trim();
  const dirty = git('status', '--porcelain', '--untracked-files=no') === '' ? '' : ' + changes';
  return `${basename(process.cwd())} @ ${git('rev-parse', '--short', 'HEAD')}${dirty}`;
}

export default async function WallLabelledProbePage({
  searchParams,
}: {
  searchParams: Promise<{ cover?: string; count?: string }>;
}) {
  if (process.env.NODE_ENV === 'production') notFound();
  const { cover, count } = await searchParams;
  const seats = collectionSeats(cover ?? null, Number(count) > 0 ? Number(count) : COLLECTION_SPINES.length);

  return (
    <main>
      <WallComposition seats={seats} summaries={collectionSummaries(seats)} opens="near" />
      <p data-testid="build-stamp" className="fixed right-[16px] bottom-[16px] z-50 bg-background px-[6px] font-mono text-[11px]">
        {buildStamp()}
      </p>
    </main>
  );
}

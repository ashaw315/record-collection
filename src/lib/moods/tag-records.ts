import 'server-only';
import { recordsToTag, writeMoodSets } from '@/lib/db/queries/record-moods';
import { runTagging, type Tagger, type TaggingRun } from './tagging';

/**
 * SPEC.md §7.12 (A76): **the one module that tags records.** The script run by
 * hand calls it, and so will §5.10's route; there is no second code path.
 *
 * What is written follows the verdict. A flat run writes nothing, because
 * every set in it is suspect. A run that left records with no mood writes the
 * rest, because one record the model cannot answer must not block every run;
 * the unanswered ones get no row, so the next run retries them.
 */
export async function tagRecords({
  tagger,
  regenerate = false,
}: {
  tagger: Tagger;
  regenerate?: boolean;
}): Promise<TaggingRun & { written: number }> {
  const run = await runTagging(await recordsToTag({ regenerate }), tagger);
  const written = run.verdict === 'refused-flat' ? 0 : await writeMoodSets(run.sets, tagger.model);
  return { ...run, written };
}

import 'server-only';
import { moodSetFor, overrideMoodSet, recordExists } from '@/lib/db/queries/record-moods';
import { readMoodSet } from './tagging';

/**
 * SPEC.md §4.5 (A76): correct a record's moods by hand.
 *
 * **Held to the rules a model's set is held to**, through the same
 * `readMoodSet`: one to four, every one from §7.12's list. A hand set that
 * broke them would be the one record the refusals could not see.
 */
export async function overrideMoods({
  recordId,
  moods,
}: {
  recordId: string;
  moods: string[];
}): Promise<{ ok: true; before: string[] | null; after: string[] } | { ok: false; reason: string }> {
  const read = readMoodSet({ moods });
  if (!read.ok) return read;

  // Named here rather than left to the foreign key, whose error names a constraint.
  if (!(await recordExists(recordId))) return { ok: false, reason: `no record ${recordId}` };

  const before = await moodSetFor(recordId);
  await overrideMoodSet(recordId, read.moods);
  return { ok: true, before, after: read.moods };
}

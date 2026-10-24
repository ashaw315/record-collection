/**
 * SPEC.md §7.12 (A76): tag every record with no row in `record_moods`, run by
 * hand. With `--regenerate`, rewrite every set that is not `overridden`.
 *
 *   node --env-file=.env.local --conditions=react-server --import tsx scripts/tag-moods.mts [--regenerate]
 *
 * It calls the same module §5.10's route will, so there is no second code path.
 * Exits non-zero when the run is refused, naming the records: every record
 * given the same count, or any record left with no mood.
 *
 * `--conditions=react-server` is what lets `server-only` load outside Next;
 * `.mts` because tsx compiles a `.ts` script as CommonJS, where top-level
 * await is not allowed.
 */
import { getMoodTagger } from '@/lib/llm/mood-tagger-client';
import { tagRecords } from '@/lib/moods/tag-records';
import { reportRun } from '@/lib/moods/tagging';

const regenerate = process.argv.includes('--regenerate');
const run = await tagRecords({ tagger: getMoodTagger(), regenerate });
const { exitCode, lines } = reportRun(run);

for (const line of lines) console.log(line);
// Explicit, because an open database pool would otherwise hold the process.
process.exit(exitCode);

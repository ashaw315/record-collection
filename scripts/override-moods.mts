/**
 * SPEC.md §4.5 (A76): correct one record's moods by hand, run by hand.
 *
 *   node --env-file=.env.local --conditions=react-server --import tsx scripts/override-moods.mts --record <id> --moods "zone out,sleepy,sunny"
 *
 * The set replaces the record's whole set, marked `overridden` with no model,
 * so a `--regenerate` leaves it alone. By record id, not title: duplicate
 * records are legal (§4). Prints the set before and after; exits non-zero,
 * writing nothing, when the set breaks §7.12 or the record does not exist.
 *
 * `--conditions=react-server` is what lets `server-only` load outside Next;
 * `.mts` because tsx compiles a `.ts` script as CommonJS, where top-level
 * await is not allowed.
 */
import { parseArgs } from 'node:util';
import { overrideMoods } from '@/lib/moods/override';

const { values } = parseArgs({ options: { record: { type: 'string' }, moods: { type: 'string' } } });

if (values.record === undefined || values.moods === undefined) {
  console.log('usage: override-moods.mts --record <id> --moods "mood,mood"');
  process.exit(2);
}

const result = await overrideMoods({ recordId: values.record, moods: values.moods.split(',') });

if (result.ok) {
  console.log(`${values.record}: ${result.before === null ? '(no row)' : result.before.join(', ')} -> ${result.after.join(', ')}, overridden`);
} else {
  console.log(`NOT WRITTEN: ${result.reason}`);
}
// Explicit, because an open database pool would otherwise hold the process.
process.exit(result.ok ? 0 : 1);

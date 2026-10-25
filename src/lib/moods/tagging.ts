import { z } from 'zod';
import { MAX_MOODS_PER_RECORD, MOODS, type Mood } from './moods';

/**
 * SPEC.md §7.12 (A76): the rules a tagging run is held to, apart from where
 * the records come from and where the sets go, so they can be tested with the
 * model stubbed (§11).
 */

export type RecordToTag = { id: string; artist: string; title: string };

/**
 * What the tagger hands back: the parsed reply, or why there is none.
 *
 * **The tagger owns the call; this module owns the rules.** A cut or refused
 * response is the tagger's to report; whether the reply is a legal mood set
 * is decided here, once, for the script and the route alike.
 */
export type TaggerReply = { ok: true; payload: unknown } | { ok: false; reason: string };

export type Tagger = {
  /** Recorded in `tagged_by_model`. */
  model: string;
  tag: (record: RecordToTag) => Promise<TaggerReply>;
};

export type MoodSet = { recordId: string; moods: Mood[] };
export type Failed = { record: RecordToTag; reason: string };
/** A reply kept after duplicates were removed, with the moods as the model wrote them. */
export type Deduplicated = { record: RecordToTag; written: string[] };

/**
 * The run's verdict. **A refusal is a verdict, not an exception**, so the
 * caller can name the records and still decide what to write.
 *
 * - `refused-flat`: every record received the same count. Every set in the
 *   run is suspect, so the caller writes none of them.
 * - `refused-missing`: some records were left with no mood. Those get no row,
 *   and the next run retries them.
 */
export type TaggingRun = { sets: MoodSet[]; deduplicated: Deduplicated[] } & (
  | { verdict: 'ok'; failed: [] }
  | { verdict: 'refused-flat'; count: number; failed: Failed[] }
  | { verdict: 'refused-missing'; failed: Failed[] }
);

const replySchema = z.object({ moods: z.array(z.string()) }).strict();

/** Case- and whitespace-insensitive, mapping back to the list's own spelling. */
const known = new Map<string, Mood>(MOODS.map((mood) => [mood, mood]));
const key = (mood: string) => mood.trim().toLowerCase().replace(/\s+/g, ' ');

/** One reply judged against §7.12: one to four of the list, nothing else. */
export function readMoodSet(
  payload: unknown,
): { ok: true; moods: Mood[]; written: string[] } | { ok: false; reason: string } {
  const parsed = replySchema.safeParse(payload);
  if (!parsed.success) return { ok: false, reason: 'unreadable' };

  const moods: Mood[] = [];
  for (const written of parsed.data.moods) {
    const mood = known.get(key(written));
    // Rejected rather than dropped: dropping it would quietly change the count.
    if (mood === undefined) return { ok: false, reason: `not a mood: ${written}` };
    if (!moods.includes(mood)) moods.push(mood);
  }

  if (moods.length === 0) return { ok: false, reason: 'no moods' };
  // Trimming to four would be choosing for the model.
  if (moods.length > MAX_MOODS_PER_RECORD) {
    return { ok: false, reason: `${moods.length} moods, more than ${MAX_MOODS_PER_RECORD}` };
  }
  return { ok: true, moods, written: parsed.data.moods };
}

/**
 * Tag every record and judge the run.
 *
 * One record at a time: the collection is hundreds of records, run by hand,
 * and no measured problem asks for more.
 */
export async function runTagging(records: RecordToTag[], tagger: Tagger): Promise<TaggingRun> {
  const sets: MoodSet[] = [];
  const failed: Failed[] = [];
  const deduplicated: Deduplicated[] = [];

  for (const record of records) {
    const reply = await tagger.tag(record);
    const read = reply.ok ? readMoodSet(reply.payload) : reply;
    if (!read.ok) {
      failed.push({ record, reason: read.reason });
      continue;
    }
    sets.push({ recordId: record.id, moods: read.moods });
    // Kept, but named: a removed duplicate changes the count the flat check reads.
    if (read.moods.length < read.written.length) deduplicated.push({ record, written: read.written });
  }

  /*
   * A flat count needs at least two records to be seen. A run that picks up
   * one new record is the ordinary case, and refusing it would make the script
   * unable to finish an incremental run.
   */
  const counts = new Set(sets.map((set) => set.moods.length));
  if (sets.length >= 2 && counts.size === 1) {
    return { verdict: 'refused-flat', count: sets[0].moods.length, sets, deduplicated, failed };
  }
  if (failed.length > 0) return { verdict: 'refused-missing', sets, deduplicated, failed };
  return { verdict: 'ok', sets, deduplicated, failed: [] };
}

const named = (record: RecordToTag) => `${record.artist} — ${record.title}`;

/**
 * What the script prints, and the code it exits with (§7.12: it refuses to
 * finish in either bad state, naming the records).
 *
 * The spread of counts is printed on every run, because it is the evidence
 * the flat check reads, and a run that passes it narrowly should still be
 * seen.
 */
export function reportRun(run: TaggingRun & { written: number }): { exitCode: 0 | 1; lines: string[] } {
  if (run.sets.length === 0 && run.failed.length === 0) {
    return { exitCode: 0, lines: ['nothing to tag: every record has a row'] };
  }

  const lines = [`${run.sets.length} tagged, ${run.written} written`];

  const spread = new Map<number, number>();
  for (const set of run.sets) spread.set(set.moods.length, (spread.get(set.moods.length) ?? 0) + 1);
  const counts = [...spread].sort(([a], [b]) => a - b).map(([count, records]) => `${count}×${records}`);
  if (counts.length > 0) lines.push(`moods per record: ${counts.join(', ')}`);

  if (run.deduplicated.length > 0) {
    lines.push(`duplicates removed from ${run.deduplicated.length}, kept:`);
    for (const { record, written } of run.deduplicated) lines.push(`  ${named(record)} wrote: ${written.join(', ')}`);
  }

  if (run.verdict === 'refused-flat') {
    lines.push(`REFUSED: every record received ${run.count} moods; nothing written`);
  }
  if (run.failed.length > 0) {
    const records = run.failed.length === 1 ? '1 record' : `${run.failed.length} records`;
    const retry = run.failed.length === 1 ? 'it gets no row, and the next run retries it' : 'they get no row, and the next run retries them';
    lines.push(`REFUSED: ${records} left with no mood; ${retry}`);
    for (const { record, reason } of run.failed) lines.push(`  ${named(record)}: ${reason}`);
  }

  return { exitCode: run.verdict === 'ok' ? 0 : 1, lines };
}

import { describe, expect, it } from 'vitest';
import replies from '../../../test/fixtures/moods/replies.json';
import { MOODS } from './moods';
import { reportRun, runTagging, type RecordToTag, type Tagger } from './tagging';

/**
 * SPEC.md §7.12 and §11 (A76): the rules a tagging run is held to, with the
 * model stubbed. The model's honesty cannot be tested with a stub; the refusal
 * can.
 */

const RECORDS: RecordToTag[] = [
  { id: 'r1', artist: 'Miles Davis', title: 'Kind of Blue' },
  { id: 'r2', artist: 'The Clash', title: 'London Calling' },
  { id: 'r3', artist: 'Talking Heads', title: 'Remain in Light' },
];

type Scenario = Exclude<keyof typeof replies, '_about'>;

/** A tagger that answers from one fixture scenario, by title. */
function fixtureTagger(scenario: Scenario): Tagger {
  const answers: Record<string, unknown> = replies[scenario];
  return {
    model: 'claude-opus-5-5',
    tag: async (record) => ({ ok: true, payload: answers[record.title] }),
  };
}

const setFor = (run: Awaited<ReturnType<typeof runTagging>>, id: string) =>
  run.sets.find((set) => set.recordId === id)?.moods;

describe('the mood list', () => {
  it('is §7.12’s eight, as plain text', () => {
    expect([...MOODS]).toEqual([
      'sleepy',
      'jacked up',
      'dancing',
      'zone out',
      'smooth',
      'loud and dirty',
      'showing off',
      'sunny',
    ]);
  });
});

describe('a run is refused', () => {
  /**
   * A flat count is invisible from inside any one record: if every record
   * carried exactly two, choosing three moods could never match anything.
   */
  it('when every record received the same number of moods', async () => {
    const run = await runTagging(RECORDS, fixtureTagger('flat'));

    expect(run.verdict).toBe('refused-flat');
    expect(run).toMatchObject({ count: 2 });
  });

  it('when it leaves a record with no mood, naming the record', async () => {
    const run = await runTagging(RECORDS, fixtureTagger('one-empty'));

    expect(run.verdict).toBe('refused-missing');
    expect(run.failed.map((f) => f.record.title)).toEqual(['London Calling']);
    expect(setFor(run, 'r2')).toBeUndefined();
  });

  /** A failed call is a record with no mood too, and must be named, not dropped. */
  it('when the tagger fails for a record, naming it and the reason', async () => {
    const tagger: Tagger = {
      model: 'claude-opus-5-5',
      tag: async (record) =>
        record.id === 'r3' ? { ok: false, reason: 'cut' } : fixtureTagger('varied').tag(record),
    };

    const run = await runTagging(RECORDS, tagger);

    expect(run.verdict).toBe('refused-missing');
    expect(run.failed).toEqual([{ record: RECORDS[2], reason: 'cut' }]);
  });
});

describe('what a record’s set may hold', () => {
  it('keeps four moods as four, never capped to a flat count', async () => {
    const run = await runTagging(RECORDS, fixtureTagger('varied'));

    expect(run.verdict).toBe('ok');
    expect(setFor(run, 'r3')).toEqual(['dancing', 'jacked up', 'showing off', 'zone out']);
    expect(setFor(run, 'r2')).toHaveLength(2);
  });

  /**
   * Rejected rather than dropped: dropping the stranger would quietly change
   * the record's count, which is the distribution the flat-count refusal
   * guards.
   */
  it('rejects a mood outside the list, failing that record', async () => {
    const run = await runTagging(RECORDS, fixtureTagger('outside-list'));

    expect(run.failed).toEqual([{ record: RECORDS[0], reason: 'not a mood: melancholy' }]);
    expect(setFor(run, 'r1')).toBeUndefined();
  });

  /** Five would be refused by the CHECK anyway; trimming it would be choosing for the model. */
  it('rejects a set of five rather than trimming it', async () => {
    const run = await runTagging(RECORDS, fixtureTagger('five'));

    expect(run.failed).toEqual([{ record: RECORDS[0], reason: '5 moods, more than 4' }]);
  });

  it('reads a mood as written in another case, stored as the list spells it, once', async () => {
    const run = await runTagging(RECORDS, fixtureTagger('as-written'));

    expect(setFor(run, 'r1')).toEqual(['smooth', 'zone out']);
  });

  /**
   * Not failed, but named: removing a duplicate changes the count the flat
   * check reads, so a model that starts padding must show in the report
   * rather than be quietly normalised.
   */
  it('names a record whose reply needed duplicates removed, with what was written', async () => {
    const run = await runTagging(RECORDS, fixtureTagger('as-written'));

    expect(run.deduplicated).toEqual([{ record: RECORDS[0], written: ['Smooth ', 'Zone Out', 'smooth'] }]);
    expect((await runTagging(RECORDS, fixtureTagger('varied'))).deduplicated).toEqual([]);
  });

  it('fails a reply that is not a mood set at all', async () => {
    const tagger: Tagger = { model: 'm', tag: async () => ({ ok: true, payload: { mood: 'smooth' } }) };

    const run = await runTagging(RECORDS.slice(0, 1), tagger);

    expect(run.failed).toEqual([{ record: RECORDS[0], reason: 'unreadable' }]);
  });
});

/**
 * §7.12: the script refuses to finish in either bad state, exiting non-zero
 * and naming the records. The script prints this and exits with its code.
 */
describe('the run report', () => {
  const report = async (scenario: Scenario, written: number) =>
    reportRun({ ...(await runTagging(RECORDS, fixtureTagger(scenario))), written });

  it('exits 0 on a good run, with how many were written and the spread of counts', async () => {
    const { exitCode, lines } = await report('varied', 3);

    expect(exitCode).toBe(0);
    expect(lines).toContain('3 tagged, 3 written');
    expect(lines).toContain('moods per record: 2×1, 3×1, 4×1');
  });

  it('exits non-zero on a flat run, saying nothing was written', async () => {
    const { exitCode, lines } = await report('flat', 0);

    expect(exitCode).toBe(1);
    expect(lines).toContain('REFUSED: every record received 2 moods; nothing written');
  });

  it('exits non-zero when a record is left with no mood, naming it and why', async () => {
    const { exitCode, lines } = await report('one-empty', 2);

    expect(exitCode).toBe(1);
    expect(lines).toContain('REFUSED: 1 record left with no mood; it gets no row, and the next run retries it');
    expect(lines).toContain('  The Clash — London Calling: no moods');
  });

  it('names a record whose duplicates were removed, with what the model wrote', async () => {
    const { exitCode, lines } = await report('as-written', 3);

    expect(exitCode).toBe(0);
    expect(lines).toContain('  Miles Davis — Kind of Blue wrote: Smooth , Zone Out, smooth');
  });

  it('says so when there was nothing to tag', () => {
    const { exitCode, lines } = reportRun({ verdict: 'ok', sets: [], deduplicated: [], failed: [], written: 0 });

    expect(exitCode).toBe(0);
    expect(lines).toEqual(['nothing to tag: every record has a row']);
  });
});


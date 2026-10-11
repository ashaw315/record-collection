import { describe, expect, it } from 'vitest';
import { marginsLines, thinnest, type Timing } from '../../scripts/test-margins';

const timing = (over: Partial<Timing>): Timing => ({ id: 'a', where: '[mobile] › e2e/a.spec.ts:1 › a', duration: 1_000, timeout: 30_000, ...over });

describe('which tests are nearest their time limit', () => {
  it('orders by the share of the limit used, not by duration', () => {
    const rows = thinnest([
      timing({ id: 'long', duration: 60_000, timeout: 900_000 }),
      timing({ id: 'near', duration: 24_000, timeout: 30_000 }),
      timing({ id: 'quick', duration: 3_000, timeout: 30_000 }),
    ]);
    expect(rows.map((row) => row.id)).toEqual(['near', 'quick', 'long']);
  });

  it('counts a test once, by the attempt that used most of its limit', () => {
    const rows = thinnest([
      timing({ id: 'retried', duration: 31_000 }),
      timing({ id: 'retried', duration: 8_000 }),
      timing({ id: 'other', duration: 9_000 }),
    ]);
    expect(rows.map((row) => [row.id, row.duration])).toEqual([['retried', 31_000], ['other', 9_000]]);
  });

  it('leaves out a test with no limit, which has no margin to be thin', () => {
    expect(thinnest([timing({ id: 'unlimited', duration: 500_000, timeout: 0 }), timing({ id: 'limited' })]).map((row) => row.id)).toEqual(['limited']);
  });

  it('keeps the ten nearest unless told another number', () => {
    const many = Array.from({ length: 14 }, (_, index) => timing({ id: `t${index}`, duration: 1_000 * (index + 1) }));
    expect(thinnest(many)).toHaveLength(10);
    expect(thinnest(many)[0]?.id).toBe('t13');
    expect(thinnest(many, 3).map((row) => row.id)).toEqual(['t13', 't12', 't11']);
  });

  it('prints one line a test: what is left of the limit, the time against it, and where', () => {
    expect(marginsLines([timing({ id: 'near', where: '[mobile] › e2e/a.spec.ts:443 › clicks', duration: 24_000 }), timing({ id: 'quick', duration: 3_000 })])).toEqual([
      '[margins] the 2 tests nearest their time limit, of 2 with one:',
      '[margins] 20% left: 24.0s of 30s — [mobile] › e2e/a.spec.ts:443 › clicks',
      '[margins] 90% left: 3.0s of 30s — [mobile] › e2e/a.spec.ts:1 › a',
    ]);
  });

  it('says a test went over its limit, as a negative share is not a margin', () => {
    expect(marginsLines([timing({ duration: 31_000 })])[1]).toBe('[margins] OVER by 1.0s: 31.0s of 30s — [mobile] › e2e/a.spec.ts:1 › a');
  });

  it('says so when no test had a limit, and prints no list', () => {
    expect(marginsLines([])).toEqual(['[margins] no test with a time limit ran']);
  });
});

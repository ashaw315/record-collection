import { describe, expect, it } from 'vitest';
import { inFormSentences, loose, markersIn, normalise, verdict } from '../../scripts/named-tests.mjs';

/**
 * **Assertion 13: a test a target names exists.** §W.8 said "The test sets the preference and
 * asserts" for weeks over a test nobody had written, and once written it found two defects.
 * It shows that a named test exists. It does not, and cannot, check what the test asserts.
 */
const section = (id: string, text: string) => ({ id, text });

describe('normalise', () => {
  it('folds the variants that once hid a rule from a search', () => {
    expect(normalise('Reduced-Motion')).toBe(normalise('reduced motion'));
    expect(normalise('the row’s front — here')).toBe(normalise("the row's front - here"));
  });
});

describe('inFormSentences', () => {
  it('takes each sentence in the stated form, with its section, and nothing else', () => {
    const found = inFormSentences([section('W.8', 'One thing. The test sets the preference and asserts that a pull lands. A test that names nothing.')]);
    expect(found).toEqual([{ section: 'W.8', sentence: 'The test sets the preference and asserts that a pull lands.' }]);
  });

  it('reads the three verbs and no others', () => {
    const text = 'The test asserts a. The test clicks b. The test sets c. The test reads d.';
    expect(inFormSentences([section('1', text)]).map((s: { sentence: string }) => s.sentence)).toHaveLength(3);
  });
});

describe('markersIn', () => {
  it('reads a section and a quoted phrase from any comment form', () => {
    const file = `/* @target §W.8 "a pull reaches its end state" */\n// @target §22 'no illegal arrangement'\n`;
    expect(markersIn(file)).toEqual([{ section: 'W.8', phrase: 'a pull reaches its end state' }, { section: '22', phrase: 'no illegal arrangement' }]);
  });
});

describe('verdict', () => {
  const sentence = { section: 'W.8', sentence: 'The test sets the preference and asserts that a pull reaches its end state in one frame.' };
  const marker = { section: 'W.8', phrase: 'reaches its end-state' };

  it('pairs across punctuation variants, and only within the section named', () => {
    expect(verdict([sentence], [marker], false).paired).toBe(1);
    expect(verdict([sentence], [{ ...marker, section: 'W.9' }], false).paired).toBe(0);
  });

  it('reports and does not fail while any sentence is unpaired and it has never armed', () => {
    const v = verdict([sentence, { section: '22', sentence: 'The test asserts x.' }], [marker], false);
    expect([v.paired, v.total, v.fails]).toEqual([1, 2, false]);
    expect(v.unpaired).toEqual([{ section: '22', sentence: 'The test asserts x.' }]);
  });

  it('arms itself: once none was unpaired, the next unpaired sentence fails, with no decision from anyone', () => {
    expect(verdict([sentence], [], true).fails).toBe(true);
    expect(verdict([sentence], [marker], true).fails).toBe(false);
  });
});

describe('loose', () => {
  it('counts test sentences outside the form, and not those in it', () => {
    expect(loose('A test sets it. The test sets it. A test that reads. It is asserted.')).toBe(2);
  });
});

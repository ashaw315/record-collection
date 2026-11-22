import { describe, expect, it } from 'vitest';
import { parseReviewMarks, renderUnread } from './unread';

/**
 * **The review of what Adam has not read (the coordinator, 22 Nov; Design's requirement that a draft be correctable
 * before it is accepted).** The file shows both texts of each record and which is unread, with the mechanical checks
 * beside the matched text; his marks come back in three forms, read, corrected or rejected, each naming which text.
 * Fails against a renderer that shows a basis mark, a parser that reads a bare id as a rejection, and a correction with
 * no text.
 */
const rows = [
  { id: '1611cb00-0000-4000-8000-000000000000', artist: 'Mandy, Indiana', title: 'i’ve seen a way', about: 'An ABOUT nobody read.', aboutUnreviewed: true, matched: 'A text nobody read.', matchedUnreviewed: true, checks: { dropped: ['Dropped one.'], disagreements: [{ a: 1, b: 2, why: 'exclusivity beside a name' }], numbered: [2] }, since: '2026-11-22T10:00:00Z' },
  { id: 'a950eb99-0000-4000-8000-000000000000', artist: 'Kim Gordon', title: 'The Collective', about: 'A read ABOUT.', aboutUnreviewed: false, matched: 'An unread text.', matchedUnreviewed: true, checks: null, since: '2026-11-21T10:00:00Z' },
];

describe('renderUnread', () => {
  it('shows each record with both texts, which is unread, and the checks beside the matched text, newest first as given', () => {
    const out = renderUnread(rows, 'Unread, 22 Nov', 'review-unread at abc1234');
    expect(out).toMatch(/^# Unread, 22 Nov\n/);
    expect(out).toContain('review-unread at abc1234');
    expect(out.indexOf('## 1611cb00')).toBeLessThan(out.indexOf('## a950eb99'));
    expect(out).toContain('## 1611cb00 Mandy, Indiana — i’ve seen a way');
    expect(out).toContain('ABOUT, unread:\nAn ABOUT nobody read.');
    expect(out).toContain('MATCHED TEXT, unread:\nA text nobody read.');
    expect(out).toContain('ABOUT, read:\nA read ABOUT.');
    expect(out).toContain('checks: 1 dropped (Dropped one.); 1 disagreement (sentences 1 and 2: exclusivity beside a name); figures to check in sentence 2');
    expect(out).toContain('checks: none');
    expect(out).not.toMatch(/\[supported\]|\[inferred\]/);
  });

  it('explains the three mark forms at its head', () => {
    const out = renderUnread(rows, 'Unread', 'v');
    for (const form of ['1611cb00', '1611cb00 about', '1611cb00 matched', '1611cb00 matched reject', '1611cb00 matched:']) expect(out).toContain(form);
  });
});

describe('parseReviewMarks', () => {
  it('reads a bare id as both texts read, a kind as that text read, reject as a rejection, and a colon as a correction with the lines that follow', () => {
    const text = [
      '1611cb00',
      'a950eb99 about',
      'a950eb99 matched reject',
      '52435f53 matched:',
      'Slow piano, and a little hiss.',
      'Side two is quieter.',
      '',
      'de2ad140 about reject',
      '# a comment line is not a mark',
    ].join('\n');
    expect(parseReviewMarks(text)).toEqual([
      { prefix: '1611cb00', kind: 'both', action: 'read' },
      { prefix: 'a950eb99', kind: 'about', action: 'read' },
      { prefix: 'a950eb99', kind: 'matched', action: 'reject' },
      { prefix: '52435f53', kind: 'matched', action: 'correct', text: 'Slow piano, and a little hiss.\nSide two is quieter.' },
      { prefix: 'de2ad140', kind: 'about', action: 'reject' },
    ]);
  });

  it('refuses a rejection or a correction that names no text, and a correction with no lines', () => {
    expect(() => parseReviewMarks('1611cb00 reject')).toThrow(/names no text/);
    expect(() => parseReviewMarks('1611cb00 matched:\n\n')).toThrow(/no corrected text/);
  });
});

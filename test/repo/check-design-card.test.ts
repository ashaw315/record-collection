import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { boldDiff, boldSentences, documentShape, quotesOf, strongBalance, unmatchedQuotes, withdrawalReport } from '../../scripts/check-design-card.mjs';

/**
 * **The checks run by hand on every Design card, written ad hoc three times
 * in one week, as one script (Q20, the coordinator, 5 Nov).** A report and
 * never a refusal: a reading aid for the intake, not an assertion, not in
 * ASSERTIONS-spec. So these tests cover the READINGS on fixtures, each
 * built to carry the defect its reading is for, and one claim on the real
 * card: that the command runs over it and says at its foot what it is.
 *
 * Fails against: a balance that counts `<strong>` without `</strong>`; a
 * depth that cannot see a strong inside a strong; a shape read that takes
 * `<!doctype` for absent or a closing tag anywhere for the end; a withdrawal
 * count that takes a quoted example for a declaration, or cannot see the
 * same sentence twice; a quote match that straightens apostrophes before
 * comparing, which is the one thing the match exists to catch; a bold diff
 * that reports a sentence that only moved.
 */
const strongAt = (depthTwo: boolean) =>
  `<!DOCTYPE html><html><body>\n<p><strong>One lead.</strong> Prose.</p>\n<p><strong>Two ${depthTwo ? '<strong>deep</strong> ' : ''}lead.</strong></p>\n</body></html>`;

describe('strong-tag balance and depth', () => {
  it('counts opens and closes and reports a depth of one when every strong closes before the next opens', () => {
    expect(strongBalance(strongAt(false))).toEqual({ opens: 2, closes: 2, maxDepth: 1, overDepthAt: [] });
  });

  it('reports an unclosed strong as an imbalance, with the line it opened on', () => {
    const html = `<!DOCTYPE html><html><body>\n<p><strong>One lead. Prose.</p>\n<p>More.</p>\n</body></html>`;
    expect(strongBalance(html)).toMatchObject({ opens: 1, closes: 0 });
  });

  it('reports a strong inside a strong as depth two, naming the line', () => {
    expect(strongBalance(strongAt(true))).toMatchObject({ opens: 3, closes: 3, maxDepth: 2, overDepthAt: [3] });
  });
});

describe('the document’s shape', () => {
  it('sees a doctype in either case and a closing html tag at the end', () => {
    expect(documentShape('<!doctype html>\n<html><body></body></html>\n')).toEqual({ doctype: true, closingHtml: true });
    expect(documentShape('<!DOCTYPE html><html><body></body></html>')).toEqual({ doctype: true, closingHtml: true });
  });

  it('reports a missing doctype, and a closing html tag that is not at the end as missing', () => {
    expect(documentShape('<html><body></body></html>')).toEqual({ doctype: false, closingHtml: true });
    expect(documentShape('<!DOCTYPE html><html><body></html><p>after</p>')).toEqual({ doctype: true, closingHtml: false });
    expect(documentShape('<!DOCTYPE html><html><body></body>')).toEqual({ doctype: true, closingHtml: false });
  });
});

describe('withdrawal sentences', () => {
  it('counts the declared sentences, leaves a quoted example out, and names a sentence that stands twice', () => {
    const html = `<!DOCTYPE html><html><body>
<p style="text-transform:uppercase">§3 The slot</p>
<p>The slot is reserved. Withdrawn in part by §7: the fragment sits 24 below.</p>
<p>An example reads “Withdrawn by §9: nothing”, which is the form and not a declaration.</p>
<p>Withdrawn in part by §7: the fragment sits 24 below.</p>
</body></html>`;
    expect(withdrawalReport(html)).toEqual({ count: 2, duplicates: ['Withdrawn in part by §7: the fragment sits 24 below.'] });
  });

  it('reports none where none is declared', () => {
    expect(withdrawalReport('<!DOCTYPE html><html><body><p>Prose only.</p></body></html>')).toEqual({ count: 0, duplicates: [] });
  });
});

describe('the change file’s quotes against the card', () => {
  const card = `<!DOCTYPE html><html><body><p>The record’s page shows the tracklist. It reads “Year pressed” on the line. Tracks by position.</p></body></html>`;

  it('reads curly and straight quotations and blockquote lines as the quotes to match', () => {
    const change = `Answers "does the page show it?".\n\nIt reads “Year pressed” there.\n\n> The record’s page shows the tracklist.\n`;
    expect(quotesOf(change)).toEqual([
      { kind: 'quotation', text: 'does the page show it?' },
      { kind: 'quotation', text: 'Year pressed' },
      { kind: 'ruling', text: 'The record’s page shows the tracklist.' },
    ]);
  });

  it('matches character for character: a straight apostrophe where the card has a curly one is unmatched, and the report says that is the only difference', () => {
    const change = `> The record's page shows the tracklist.\n\nIt reads “Year pressed” there.\n`;
    expect(unmatchedQuotes(change, card)).toEqual([
      { kind: 'ruling', text: "The record's page shows the tracklist.", onlyByMarks: true },
    ]);
  });

  it('reports a quote the card does not carry at all, without the marks hint', () => {
    expect(unmatchedQuotes(`> The sleeve is folded.\n`, card)).toEqual([{ kind: 'ruling', text: 'The sleeve is folded.', onlyByMarks: false }]);
  });

  it('matches across the card’s whitespace and entities', () => {
    const wrapped = `<!DOCTYPE html><html><body><p>The record&rsquo;s page\n   shows the tracklist.</p></body></html>`;
    expect(unmatchedQuotes(`> The record’s page shows the tracklist.\n`, wrapped)).toEqual([]);
  });
});

describe('the bold-sentence set against the previous card', () => {
  const before = `<!DOCTYPE html><html><body><p><strong>One lead.</strong> Prose.</p><p><strong>Two lead.</strong></p><p><strong>Gone lead.</strong></p></body></html>`;
  const after = `<!DOCTYPE html><html><body><p><strong>Two lead.</strong></p><p><strong>One lead.</strong> Prose.</p><p><strong>New lead.</strong></p></body></html>`;

  it('reads every strong run as a bold sentence, decoded and collapsed', () => {
    expect(boldSentences(`<p><strong>The record&rsquo;s\n page.</strong></p>`)).toEqual(['The record’s page.']);
  });

  it('reports what was added and what was removed, and not what only moved', () => {
    expect(boldDiff(before, after)).toEqual({ added: ['New lead.'], removed: ['Gone lead.'] });
  });
});

describe('the command', () => {
  const dir = mkdtempSync(join(tmpdir(), 'check-design-card-'));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it('reports every reading over a card and its change file, exits 0 whatever it finds, and says at its foot that it is a report', () => {
    const card = join(dir, 'Card.dc.html');
    const previous = join(dir, 'Previous.dc.html');
    const change = join(dir, 'change.md');
    writeFileSync(card, `<html><body><p><strong>A lead.</strong> Withdrawn in part by §7: the slot.</p><p><strong>Open lead.</p></body></html>`);
    writeFileSync(previous, `<!DOCTYPE html><html><body><p><strong>Old lead.</strong></p></body></html>`);
    writeFileSync(change, `> The slot's height.\n`);
    const r = spawnSync('node', ['scripts/check-design-card.mjs', card, '--change', change, '--previous', previous], { encoding: 'utf8' });
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toMatch(/strong.*opens 2.*closes 1/i);
    expect(r.stdout).toMatch(/doctype.*absent/i);
    expect(r.stdout).toMatch(/withdrawal.*1/i);
    expect(r.stdout).toMatch(/The slot's height\./);
    expect(r.stdout).toMatch(/added[\s\S]*A lead\./);
    expect(r.stdout).toMatch(/removed[\s\S]*Old lead\./);
    expect(r.stdout).toMatch(/A report, not a verdict/);
  });

  it('runs over the real 8a card and says what it is', () => {
    const r = spawnSync('node', ['scripts/check-design-card.mjs', 'docs/design/Record Detail 8a - build target.dc.html'], { encoding: 'utf8' });
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toMatch(/doctype.*present/i);
    expect(r.stdout).toMatch(/A report, not a verdict/);
  });
});

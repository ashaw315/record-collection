import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { markersIn, parseMarker } from '../../scripts/marker-grammar.mjs';
import { plainText } from '../../scripts/check-design-card.mjs';

/**
 * **A marker is read by Design's grammar, and an opener that doesn't parse fails loudly (DESIGN-RULES, "Marker
 * grammar", 10 Nov).** A check reading two forms missed 44 of 107 markers on the Record Detail card and certified cards
 * on that count for a week; a five-form list would have refused fourteen; requiring a sentence start would have missed
 * nine, every "Withdrawn in part" among them. The grammar: a verb, Withdrawn or Superseded (Narrowed read as Withdrawn
 * in part); optionally "in part" or "in whole"; optionally "within" or "by" with one or more section references joined
 * by "," or "and"; optionally a qualifier; the colon. The colon before any sentence stop is what makes a marker: a
 * "(withdrawn by §20)" with none is a reference, and a sentence that names a withdrawal and ends in a full stop is prose.
 * Enumerate and fail on the remainder; never widen a pattern and hope (the coordinator, 10 Nov).
 */
describe('parseMarker', () => {
  it('reads the plain forms: within, by, in part by, in whole by, superseded by, superseded in part by', () => {
    expect(parseMarker('Withdrawn within §26:')).toEqual({ verb: 'Withdrawn', scope: 'whole', how: 'within', refs: ['§26'], subject: '', qualifier: '', narrowed: false });
    expect(parseMarker('Withdrawn in part by §33:')).toMatchObject({ verb: 'Withdrawn', scope: 'part', how: 'by', refs: ['§33'] });
    expect(parseMarker('Withdrawn in whole by §33:')).toMatchObject({ scope: 'whole', how: 'by', refs: ['§33'] });
    expect(parseMarker('Superseded by §W.24:')).toMatchObject({ verb: 'Superseded', scope: 'whole', how: 'by', refs: ['§W.24'] });
    expect(parseMarker('Superseded in part by §T.6:')).toMatchObject({ verb: 'Superseded', scope: 'part', refs: ['§T.6'] });
  });

  it('carries a qualifier after the references, and more than one reference', () => {
    expect(parseMarker('Superseded in part by §37 on the air’s side only:')).toMatchObject({ scope: 'part', refs: ['§37'], qualifier: 'on the air’s side only' });
    expect(parseMarker('Withdrawn in whole by §33, which retires this section’s subject, the frame constant:')).toMatchObject({ scope: 'whole', refs: ['§33'], qualifier: ', which retires this section’s subject, the frame constant' });
    expect(parseMarker('Superseded by §48 and §49:')).toMatchObject({ refs: ['§48', '§49'] });
    expect(parseMarker('Superseded by §33 on the per-record figures:')).toMatchObject({ refs: ['§33'], qualifier: 'on the per-record figures' });
  });

  it('reads a marker with no reference by its qualifier, and Narrowed as Withdrawn in part', () => {
    expect(parseMarker('Withdrawn with the frame:')).toEqual({ verb: 'Withdrawn', scope: 'whole', how: null, refs: [], subject: '', qualifier: 'with the frame', narrowed: false });
    expect(parseMarker('Superseded on the real collection:')).toMatchObject({ verb: 'Superseded', how: null, refs: [], qualifier: 'on the real collection' });
    expect(parseMarker('Superseded by later rulings, not by the fixture:')).toMatchObject({ how: null, refs: [], qualifier: 'by later rulings, not by the fixture' });
    expect(parseMarker('Narrowed by §5:')).toEqual({ verb: 'Withdrawn', scope: 'part', how: 'by', refs: ['§5'], subject: '', qualifier: '', narrowed: true });
  });

  /*
    Q65 (a), Design 10 Nov ("Grammar Q65 and Q66"): step 3 gains a qualifier slot before the reference, "a short
    qualifier saying what is withdrawn", because "Withdrawn above §W.26's fork by §W.29:" stands as written: moved after
    the reference it would read as §W.29 being above the fork. Fails against the parser as it stood, which required
    "within" or "by" directly after the scope and refused any qualifier holding a reference.
  */
  it('reads a qualifier before the reference as the subject, what is withdrawn, with its own references allowed', () => {
    expect(parseMarker('Withdrawn above §W.26’s fork by §W.29:')).toEqual({ verb: 'Withdrawn', scope: 'whole', how: 'by', refs: ['§W.29'], subject: 'above §W.26’s fork', qualifier: '', narrowed: false });
    expect(parseMarker('Superseded in part on the hold by §W.8 for the bound:')).toMatchObject({ scope: 'part', how: 'by', refs: ['§W.8'], subject: 'on the hold', qualifier: 'for the bound' });
    /* A qualifier with no reference after it is the no-reference form, as before, and a reference inside it still fails. */
    expect(parseMarker('Superseded by later rulings, not by the fixture:')).toMatchObject({ how: null, subject: '', qualifier: 'by later rulings, not by the fixture' });
    expect(() => parseMarker('Withdrawn with §33 in mind:')).toThrow(/does not parse/);
  });

  it('throws by name on a marker-shaped opener outside the grammar', () => {
    expect(() => parseMarker('Withdrawn §33:')).toThrow(/does not parse.*Withdrawn §33:/);
    expect(() => parseMarker('Superseded by:')).toThrow(/does not parse/);
    expect(() => parseMarker('Withdrawn in parts by §3:')).toThrow(/does not parse/);
    expect(() => parseMarker('Superseded in part in whole by §3:')).toThrow(/does not parse/);
    expect(() => parseMarker('Retired by §3:')).toThrow(/not a marker/);
  });
});

describe('markersIn: every marker in a card’s prose, wherever it sits', () => {
  it('finds a marker after a full stop, a heading, a colon, a parenthesis or a quote, and says whether it opens a sentence', () => {
    const plain = 'Prose. Withdrawn by §3: a. 17 · The frame (withdrawn by §20) Withdrawn in part by §33: b. Also: Superseded by §47: c.';
    const found = markersIn(plain);
    expect(found.map((m) => m.opener)).toEqual(['Withdrawn by §3:', 'Withdrawn in part by §33:', 'Superseded by §47:']);
    expect(found.map((m) => m.opensSentence)).toEqual([true, false, false]);
  });

  it('does not take a quoted example, a lowercase reference in parentheses, or a sentence that ends before any colon', () => {
    expect(markersIn('One read “Withdrawn within §33: stated plainly”, the form and not a declaration.')).toEqual([]);
    expect(markersIn('The arrangement (withdrawn by §20) stands.')).toEqual([]);
    expect(markersIn('Superseded by §20 on the first term and on the curve’s shape, which are separate withdrawals. The first term: x.')).toEqual([]);
  });

  it('fails loudly on an opener the grammar does not read, naming it', () => {
    expect(() => markersIn('Fine. Withdrawn §33: not fine.')).toThrow(/does not parse.*Withdrawn §33:/);
  });

  /* Q65: the one opener outside the grammar across every card (10 Nov) is inside it now, and the Wall card reads whole. */
  it('reads every marker on the Wall card, the qualifier-first opener of §W.26 among them', () => {
    const found = markersIn(plainText(readFileSync('docs/design/Wall and Pull - build target.dc.html', 'utf8')));
    const fork = found.filter((m) => m.opener === 'Withdrawn above §W.26’s fork by §W.29:');
    expect(fork, 'the precondition: the card carries the opener as written').toHaveLength(1);
    expect(fork[0].parsed).toMatchObject({ how: 'by', refs: ['§W.29'], subject: 'above §W.26’s fork' });
  });
});

/*
  The card as it stands, the case whose answer is held (the coordinator and Design, 10 Nov), with two figures corrected
  by the measurement: 107 markers; 8 not opening a sentence, all four "Withdrawn in part" among them, where the
  coordinator's ninth was the quoted example “Withdrawn within §33: …”, an example of the form and not a declaration,
  which this reader and withdrawalSentencesIn both leave out; 20 distinct openers once section references are
  normalised; 29 partial (24 "Superseded in part" plus the one qualified "on the air’s side only", and 4 "Withdrawn in part"; one of
  the 24 is "by §G.8", a lettered reference the coordinator's table did not hold) plus the one Narrowed.
  Q66 (Design, 10 Nov, refs/drops/2026-11-10-06): the two §20 sentences that read as markers missing their colon are
  written as markers, punctuation only, so the card holds 109: §17's "Withdrawn by §20:" opens its sentence and §19's
  "Superseded by §20 on the first term and on the curve’s shape:" does not, the ninth mid-sentence marker and the
  twenty-first opener. Measured by diffing the markers of HEAD's card against the drop's: exactly those two added, none gone.
*/
describe('the Record Detail 8a card', () => {
  const markers = markersIn(plainText(readFileSync('docs/design/Record Detail 8a - build target.dc.html', 'utf8')));

  it('holds 110 markers, 8 not opening a sentence, all four Withdrawn in part among those', () => {
    /* 110 since "Sheet from the record page mended" (24 Nov): its §24 marker opens a sentence, so the 9 mid-sentence stayed 9; the refused f02069f1 spliced it mid-sentence and made them 10. 8 since "Nav three verbs and 45 splice mended" (25 Nov): Q91's §45 marker, "Superseded by §47:", now follows its sentence's full stop. The 8 open a block under a numbered heading (§13, 17, 19, 23, 28, 30, 31, 32), which the flattened text joins without a boundary; none is a splice. */
    expect(markers).toHaveLength(110);
    const mid = markers.filter((m) => !m.opensSentence);
    expect(mid).toHaveLength(8);
    expect(mid.filter((m) => m.parsed.verb === 'Withdrawn' && m.parsed.scope === 'part' && !m.parsed.narrowed)).toHaveLength(4);
  });

  it('names each marker not opening a sentence by its numbered heading, and none is in §45', () => {
    /* By the nearest preceding NUMBERED heading ("45 · The title fits…"), never the nearest of any kind: the card's
       uppercase captions are not sections (the coordinator, 25 Nov), and §45 was twice misnamed from a § the text mentions. */
    const text = plainText(readFileSync('docs/design/Record Detail 8a - build target.dc.html', 'utf8'));
    const headings = [...text.matchAll(/(?<![\d§.])\b(\d{1,2}[a-z]?) · /g)].map((m) => ({ at: m.index ?? 0, n: m[1] }));
    expect(headings, 'A tripwire, not a defect: the card has gained or lost a numbered section. Count the card\'s "N · Title" headings, update 56 to match, and check the section list below still names the right ones.').toHaveLength(56);
    const sections = markers.filter((m) => !m.opensSentence).map((m) => headings.filter((h) => h.at < m.start).pop()?.n);
    expect(sections).toEqual(['13', '17', '19', '23', '28', '30', '31', '32']);
  });

  it('holds 21 distinct openers with the references normalised, and 29 partial markers plus one Narrowed', () => {
    const openers = new Set(markers.map((m) => m.normalised));
    expect(openers.size).toBe(21);
    expect(markers.filter((m) => m.parsed.scope === 'part' && !m.parsed.narrowed)).toHaveLength(29);
    expect(markers.filter((m) => m.parsed.narrowed)).toHaveLength(1);
  });
});

/*
  Q94 (the coordinator, 26 Nov, pinned after Design's §7 mend, "Settled 7 splice mended", 27 Nov): the settled file takes
  nothing but withdrawal sentences, so a marker fault is likeliest there and least likely to be seen, and until now no
  inventory read it. Two splices were ever found across both Record Detail files, both from drop 4152be58 (29 Sep): §45
  in the live card and §7 here, both mended. Every other marker not opening a sentence opens a block.
*/
describe('the Record Detail 8a settled card, §1 to §10', () => {
  const text = plainText(readFileSync('docs/design/Record Detail 8a - settled 1-10.dc.html', 'utf8'));
  const markers = markersIn(text);

  it('holds 13 markers, 2 not opening a sentence, each opening a block under §4.1 and §4.2', () => {
    /* 13 is the grammar's count: the colon makes a marker. §5.4's "Superseded in part by §5.1, which gives…" is a declared
       withdrawal sentence (the index's assertion 7 pairs it) and reaches a full stop before any colon, so it is not one. */
    expect(markers).toHaveLength(13);
    /* Numbered headings here carry a decimal ("4.1 · The inventory…"); the capital after the dot keeps "11 × 14 · 10" out. */
    const headings = [...text.matchAll(/(?<![\d§.])\b(\d{1,2}(?:\.\d)?) · (?=[A-Z])/g)].map((m) => ({ at: m.index ?? 0, n: m[1] }));
    expect(headings, 'A tripwire, not a defect: the settled card has gained or lost a numbered section. Count its "N · Title" headings, update 27 to match, and check the section list below.').toHaveLength(27);
    const sections = markers.filter((m) => !m.opensSentence).map((m) => headings.filter((h) => h.at < m.start).pop()?.n);
    expect(sections).toEqual(['4.1', '4.2']);
  });
});

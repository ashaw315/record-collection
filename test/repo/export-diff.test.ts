import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { addedBySection, diffProse, entriesNotCrossed, sentencesOf, stepsOf } from '../../scripts/export-diff.mjs';

/**
 * **What an export took away (8 Oct).** Design's exports replace the
 * targets and the handoff wholesale. The index checks the quotes it already
 * knows about: a paragraph dropped with no withdrawal entry leaves no
 * trace, and the prose in those files is the project's record of what was
 * ruled. `scripts/export-diff.mjs` compares an export with the last commit
 * and reports every sentence that is gone, apart from the ones that were
 * only reworded, which it shows as pairs.
 *
 * It reports; it does not judge. Whether a removal is right is read by
 * whoever takes the drop.
 */
describe('sentencesOf', () => {
  it('reads a target’s text through its markup, entities and line breaks', () => {
    const html = '<p style="x">The cover is <b>cropped</b> within 95%.\n  It is fitted&nbsp;beyond&rsquo;s that.</p><style>.a{b:c}</style><p>A third&mdash;here.</p>';
    expect(sentencesOf(html)).toEqual(['The cover is cropped within 95%.', 'It is fitted beyond’s that.', 'A third—here.']);
  });

  it('does not split a figure, a section number or an abbreviation into two sentences', () => {
    expect(sentencesOf('The square is 126.5 tall at 390, by §W.24. The band is e.g. two rows.')).toEqual(['The square is 126.5 tall at 390, by §W.24.', 'The band is e.g. two rows.']);
  });
});

/*
  The splitter is the review surface (the coordinator, 13 Oct), so what it joins or cuts at markup is what gets
  reviewed wrong. A target's tags are stripped before splitting; a handoff's Markdown was not: a bold lead's `**`
  stood between a stop and the next capital, so the lead and the sentence after it read as one, and a quote line
  (`> …`) or a bullet (`- …`) on the line after a stop joined the sentence before it. Fails against the splitter that
  read markup as text.
*/
describe('sentencesOf, on Markdown', () => {
  it('splits a bold lead from the sentence after it, with the markup gone', () => {
    expect(sentencesOf('- **Step one.** Do this.')).toEqual(['Step one.', 'Do this.']);
    expect(sentencesOf('**Done: built.** **§T.6 — the slot.** One sentence.')).toEqual(['Done: built.', '§T.6 — the slot.', 'One sentence.']);
  });

  it('reads a quote line and a bullet line as their own sentences, with their markers gone', () => {
    expect(sentencesOf('Recapture each at 390.\n   > On the want list the labels take §4.1’s type.')).toEqual(['Recapture each at 390.', 'On the want list the labels take §4.1’s type.']);
    expect(sentencesOf('One ruled.\n- Two ruled.\n- Three ruled.')).toEqual(['One ruled.', 'Two ruled.', 'Three ruled.']);
  });

  it('does not cut a sentence at a tag or at inline emphasis inside it', () => {
    expect(sentencesOf('<p>The <strong>page</strong> has said what the page is. It was built.</p>')).toEqual(['The page has said what the page is.', 'It was built.']);
    expect(sentencesOf('A result has **two** actions, one slot and two disclosures, each in a band of its own.')).toEqual(['A result has two actions, one slot and two disclosures, each in a band of its own.']);
  });
});

/*
  **Tags stripped to nothing glued sentences (the coordinator, 10 Nov).** A block's closing tag became a break, every
  other tag became nothing, so a stop followed by a span, a caption after a parenthesis, or a <br> fused with what came
  next: on the Record Detail card "…as §38 rules.Row 1, Pressing detail…" read as one sentence, and a withdrawal marker
  placed after that list marked a sentence holding four live rows beside the dead one. Counted before fixing: 48 glued
  sentences across 23 cards, 4 in the three build targets. The fix is not a space for every tag: 509 tags on the cards
  sit between a word and a comma and 116 between a word and a stop ("is</em>."), and a space there would break every
  quote the index matches. A space goes where a tag stands between a stop or closing bracket and the next letter,
  between an uppercase and a lowercase letter, or is a line break.
*/
describe('sentencesOf, where tags were stripped to nothing', () => {
  it('separates a sentence from a list or caption that follows it inside the next tag', () => {
    expect(sentencesOf('<p><strong>Where the drawing disagrees, this list governs. Superseded in part by §38: a row missing a section regroups as §38 rules.</strong><span>Row 1, Pressing detail and its air: 7 + 5.</span></p>'))
      .toEqual(['Where the drawing disagrees, this list governs.', 'Superseded in part by §38: a row missing a section regroups as §38 rules.', 'Row 1, Pressing detail and its air: 7 + 5.']);
    expect(sentencesOf('<p>never a flat mark (§13)</p><span>EDGE BLEED · PAGE EDGE ONLY</span><span>drawn at r 1.</span>')).toEqual(['never a flat mark (§13)', 'EDGE BLEED · PAGE EDGE ONLY drawn at r 1.']);
  });

  it('reads a line break as a space', () => {
    expect(sentencesOf('<div>Buddy Rich<br>Super Rich</div>')).toEqual(['Buddy Rich Super Rich']);
    expect(sentencesOf('<p>0.62 L<br/>as stored</p>')).toEqual(['0.62 L as stored']);
  });

  it('adds no space at a tag before punctuation or inside a token, so a quoted sentence still matches', () => {
    expect(sentencesOf('<p>What an artist <em>is</em>. Set at <strong>6</strong>, named. See §<b>26</b>.</p>')).toEqual(['What an artist is.', 'Set at 6, named.', 'See §26.']);
  });
});

describe('diffProse', () => {
  const before = 'The sizes are taken once. The gatefold’s spread is never recomputed while the modal is open. The sleeve is centred. Focus returns to the cover.';

  /* Fails against a comparison of lengths or of paragraph counts: a sentence gone and another added reads as no change. */
  it('names a sentence that is gone', () => {
    const after = 'The sizes are taken once. The sleeve is centred. Focus returns to the cover. A new sentence about something else entirely arrives here.';
    const d = diffProse(before, after);
    expect(d.removed).toEqual(['The gatefold’s spread is never recomputed while the modal is open.']);
    expect(d.reworded).toEqual([]);
  });

  /* Fails against a diff that calls every edit a removal: the reader would stop reading the list. */
  it('pairs a sentence that was reworded with what it became, and does not call it removed', () => {
    const after = before.replace('The sizes are taken once.', 'The sizes are taken once, when the modal opens.');
    const d = diffProse(before, after);
    expect(d.removed).toEqual([]);
    expect(d.reworded).toEqual([{ was: 'The sizes are taken once.', now: 'The sizes are taken once, when the modal opens.' }]);
  });

  it('says nothing where sentences only moved, or the markup around them changed', () => {
    const moved = 'Focus returns to the cover. The sleeve is centred. The gatefold’s spread is never recomputed while the modal is open. The sizes are taken once.';
    expect(diffProse(before, moved)).toEqual({ removed: [], reworded: [], added: [] });
    expect(diffProse('<p>One thing is ruled.</p>', '<div><span>One thing</span> is ruled.</div>')).toEqual({ removed: [], reworded: [], added: [] });
  });

  it('counts a sentence that appeared twice and now appears once as removed once', () => {
    expect(diffProse('It is ruled here. It is ruled here.', 'It is ruled here.').removed).toEqual(['It is ruled here.']);
  });

  /*
    The other direction (the coordinator, 13 Oct): Design's own check confirms what it is about to report is in the
    file, and cannot see a ruling in the file it did not report, or one reported that is not there. What a drop ADDS
    is listed so the file can be read against Design's message on intake. A reworded sentence is not an addition.
    Fails against a diff that reports removals only, which is what this script was.
  */
  it('names a sentence that arrived, and does not count a rewording as one', () => {
    const after = 'The sizes are taken once, when the modal opens. The gatefold’s spread is never recomputed while the modal is open. The sleeve is centred. Focus returns to the cover. A reserved slot is two lines at 390 and below.';
    const d = diffProse(before, after);
    expect(d.added).toEqual(['A reserved slot is two lines at 390 and below.']);
    expect(d.reworded).toEqual([{ was: 'The sizes are taken once.', now: 'The sizes are taken once, when the modal opens.' }]);
    expect(diffProse(before, before).added).toEqual([]);
  });
});

/*
  The review surface (the coordinator, 13 Oct): a drop's added sentences, grouped under the heading or the bold lead
  above each, so what was ruled is read in full rather than through a summary. Fails against the flat `added` list,
  which says what arrived and not where.
*/
describe('addedBySection', () => {
  it('groups a target’s added sentences under the heading and the bold lead above each, in file order', () => {
    const before = '<p style="text-transform:uppercase">T.6 · Ornament</p><p><strong>Part 1.</strong> One ruled. Two ruled.</p>';
    const after = '<p style="text-transform:uppercase">T.6 · Ornament</p><p><strong>Part 1.</strong> One ruled. Two ruled. Three arrives.</p><p><strong>Part 2.</strong> Four arrives. Five arrives.</p>';
    expect(addedBySection(before, after)).toEqual([
      { section: 'T.6 · Ornament › Part 1.', added: ['Three arrives.'] },
      { section: 'T.6 · Ornament › Part 2.', added: ['Part 2.', 'Four arrives.', 'Five arrives.'] },
    ]);
  });

  it('reads a Markdown handoff’s headings and bold bullet leads as sections, and lists nothing for a section with no arrival', () => {
    const before = '## Build order\n\n- **Step one.** Do this.\n\n## Notes\n\nA note.\n';
    const after = '## Build order\n\n- **Step one.** Do this. And that.\n\n- **Step two.** Do more.\n\n## Notes\n\nA note.\n';
    expect(addedBySection(before, after)).toEqual([
      { section: 'Build order › Step one.', added: ['And that.'] },
      { section: 'Build order › Step two.', added: ['Step two.', 'Do more.'] },
    ]);
  });
});

describe('stepsOf', () => {
  /* The handoff's own loss: step 71 is absent from every export, and this is what names it. */
  it('lists the numbered steps of a build order, so a missing one can be named', () => {
    const md = '70. **A.** Text.\n\n71. **Done.** Text.\n\n72. **B.** Text.\n';
    expect(stepsOf(md)).toEqual([70, 71, 72]);
    expect(stepsOf(md.replace('71. **Done.** Text.\n\n', ''))).toEqual([70, 72]);
  });
});

describe('against this repository’s own history', () => {
  /* The case that prompted it: between these two commits a ruled clause left the modal target with no sentence beside it. A positive control on real files. */
  it('finds the clause that left §M.4 between f6fb36d and 64ff1f7', () => {
    const show = (rev: string) => execFileSync('git', ['show', `${rev}:docs/design/Record Modal - build target.dc.html`], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    const d = diffProse(show('f6fb36d'), show('64ff1f7'));
    const all = [...d.removed, ...d.reworded.map((r: { was: string }) => r.was)].join(' ');
    expect(all).toMatch(/never recomputed while the modal is open/);
  });
  /**
   * **A paragraph break ends a sentence in Markdown as a closing tag does in
   * HTML.** The handoff is Markdown, and its quoted rulings end without a full
   * stop. With blank lines collapsed, the drop that added steps 97 to 99 put a
   * quote in front of `No step: §G.7.`, the two were read as one sentence, and
   * the tool reported a sentence removed that stood unchanged at line 454
   * (8 Oct). A false removal is the costly direction: it is read as Design's
   * loss and carried into a report.
   */
  it('does not report a paragraph as removed because the one before it changed', () => {
    const before = '96. Build the band.\n\n> Every link has a hit area 44 tall\n\nNo step: §G.7. It rules nothing.\n';
    const after = '96. Build the band.\n\n> Every link has a hit area 44 tall\n\n99. Build the grid.\n\n> Under each cover, the title is set in 13 ink\n\nNo step: §G.7. It rules nothing.\n';
    expect(sentencesOf(after)).toContain('No step: §G.7.');
    expect(diffProse(before, after)).toEqual({ removed: [], reworded: [], added: ['99. Build the grid.', 'Under each cover, the title is set in 13 ink'] });
  });

  it('keeps a step number with its own step, not on the end of the paragraph before', () => {
    const sentences = sentencesOf('Report the baselines.\n\n> Each meets its neighbours halfway.\n\n97. Build the table.\n');
    expect(sentences).toContain('Each meets its neighbours halfway.');
    expect(sentences).toContain('97. Build the table.');
  });
});

/**
 * **A withdrawal sentence that arrives without its entries' file (16 Oct).**
 * Twice in one day a file did not cross between Design's tree and the
 * repo's, in opposite directions, and each was invisible until the index
 * failed days later in a way that read as Design's fault. The index checks
 * entries against sentences in one tree and cannot see that the tree is
 * missing a whole input. This names the state at the moment it arises: a
 * save that adds a sentence in withdrawal form to a target and brings no
 * change to WITHDRAWALS.md against the same base. It reports; the index
 * still judges.
 */
describe('entriesNotCrossed', () => {
  const WITHDRAWN = 'Withdrawn within §T.6: the arrow keys moving focus with the pull, so that a pulled record is the focused one.';
  /* Fails against the function's absence, and against one that reads only the sentences: the line names both the count and the file. */
  it('names the state when a withdrawal-form sentence arrives and WITHDRAWALS.md did not change', () => {
    const line = entriesNotCrossed([{ file: 'Table and Grid - build target.dc.html', added: ['A plain sentence.', WITHDRAWN] }], false);
    expect(line).toBe("1 withdrawal sentence arrived and WITHDRAWALS.md did not change: the entries' file has not crossed, or the entries were not written.");
  });
  it('counts every form the index declares, across files', () => {
    const line = entriesNotCrossed([
      { file: 'Nav - build target.dc.html', added: ['Superseded by §G.3 on the gap: the 8 is 24.'] },
      { file: 'Wall and Pull - build target.dc.html', added: ['Withdrawn in part by §W.29: the seat.', 'Nothing here.'] },
    ], false);
    expect(line).toMatch(/^2 withdrawal sentences arrived/);
  });
  it('says nothing when WITHDRAWALS.md changed in the same save, however little', () => {
    expect(entriesNotCrossed([{ file: 'Table and Grid - build target.dc.html', added: [WITHDRAWN] }], true)).toBeNull();
  });
  it('says nothing when no added sentence is in withdrawal form', () => {
    expect(entriesNotCrossed([{ file: 'Table and Grid - build target.dc.html', added: ['The row is between hairlines.'] }], false)).toBeNull();
  });
  /* Real data: Design's save of 16 Oct that brought two §T.6 withdrawals and no WITHDRAWALS.md, committed raw at dfa6fe2 on 831ddd4. The script, run as the intake runs it, must say so. */
  it('says so on the save where it happened, dfa6fe2 against 831ddd4', () => {
    const out = execFileSync('node', ['scripts/export-diff.mjs', '--from', '831ddd4', '--to', 'dfa6fe2'], { encoding: 'utf8' });
    expect(out).toContain("2 withdrawal sentences arrived and WITHDRAWALS.md did not change: the entries' file has not crossed, or the entries were not written.");
  });
  /* And not on the save that brought the file: 92d2614 against 4c6897d changed WITHDRAWALS.md and added no target sentence. */
  it('says nothing on the save that brought the entries, 92d2614 against 4c6897d', () => {
    const out = execFileSync('node', ['scripts/export-diff.mjs', '--from', '4c6897d', '--to', '92d2614'], { encoding: 'utf8' });
    expect(out).not.toContain('withdrawal sentence');
  });
});

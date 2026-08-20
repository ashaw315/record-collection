import { describe, expect, it } from 'vitest';
import { snippetView } from './snippet-view';

/**
 * SPEC.md §10b's snippet as the panel sees it, and A31a's confirmation rule.
 *
 * **Pure, so the two decisions that matter are testable without a browser:**
 * whether regenerating needs confirming, and what the confirmation says. Both
 * are judgements the E2E can then check are wired up, rather than deriving them
 * inside a component where only a rendered DOM could assert them.
 */

describe('what the panel shows', () => {
  /**
   * Fails against: a panel that invites a snippet where there is none.
   *
   * §10b: "Absence is fine. A record with no snippet shows none, and no
   * placeholder invites one." So the absent state offers generation without
   * pretending something is missing.
   */
  it('absence is ordinary, not a gap', () => {
    const view = snippetView({ snippet: null, snippetEditedAt: null });

    expect(view.kind).toBe('absent');
  });

  /**
   * Fails against: a view that cannot tell generated text from the user's.
   *
   * The distinction drives everything else — the label, and whether
   * regeneration confirms.
   */
  it.each([
    ['generated', null],
    ['edited', new Date('2026-08-20T12:00:00Z')],
  ])('reports %s text', (kind, editedAt) => {
    const view = snippetView({ snippet: 'Two or three sentences.', snippetEditedAt: editedAt });

    expect(view.kind).toBe(kind);
  });
});

describe('A31a: confirmation only where there is something to lose', () => {
  /**
   * Fails against: a panel that confirms every regeneration.
   *
   * **The same reasoning as the cover notice firing on 'failed' and never on
   * 'none'.** With `snippet_edited_at` null the stored text is as generated: no
   * user work is at stake, and confirming anyway would train the user to dismiss
   * the dialog — so the one that matters gets dismissed too.
   */
  it.each([
    ['absent', null, null],
    ['generated', 'Generated text.', null],
  ])('does not confirm when the snippet is %s', (_case, snippet, editedAt) => {
    const view = snippetView({ snippet, snippetEditedAt: editedAt });

    expect(view.confirmBeforeRegenerating).toBe(false);
  });

  /**
   * Fails against: a regeneration that replaces the user's text without asking.
   *
   * §7.8 via A31a: the affordance is OFFERED, not hidden — hiding it would treat
   * the owner of the text as the threat the rule protects against — but it names
   * what will be lost first.
   */
  it('confirms when the user has edited it', () => {
    const view = snippetView({
      snippet: 'Mine.',
      snippetEditedAt: new Date('2026-08-20T12:00:00Z'),
    });

    expect(view.confirmBeforeRegenerating).toBe(true);
  });
});

describe('the confirmation names the text, not the rule', () => {
  /**
   * **Fails against a message that explains the mechanism.**
   *
   * A31a is explicit: "Replace the snippet you edited? Your version will be
   * lost" — never "this record has snippet_edited_at set". The consequence is
   * what must be legible, and a column name is not a consequence.
   *
   * Asserted both ways round: it must say what is lost, and it must not leak
   * implementation vocabulary into a sentence a person reads.
   */
  it('says what will be lost', () => {
    const view = snippetView({ snippet: 'Mine.', snippetEditedAt: new Date() });

    expect(view.confirmMessage).toMatch(/you edited/i);
    expect(view.confirmMessage).toMatch(/lost|replaced/i);
  });

  it.each([['snippet_edited_at'], ['timestamp'], ['column'], ['null'], ['409']])(
    'never mentions %s',
    (jargon) => {
      const view = snippetView({ snippet: 'Mine.', snippetEditedAt: new Date() });

      expect(view.confirmMessage).not.toBeNull();
      expect((view.confirmMessage ?? '').toLowerCase()).not.toContain(jargon);
    },
  );

  /**
   * Fails against: a confirmation message offered where nothing is confirmed.
   *
   * A message that exists for a state that never shows it is the sort of dead
   * string that later gets rendered by accident.
   */
  it('has no message when nothing needs confirming', () => {
    const view = snippetView({ snippet: 'Generated.', snippetEditedAt: null });

    expect(view.confirmMessage).toBeNull();
  });
});

describe('the generated label', () => {
  /**
   * Fails against: a panel that labels the user's own writing as generated.
   *
   * §10b's label exists because the app is asserting things about music that
   * NOTHING in the pipeline verified — withholding the record's facts is the only
   * enforced mitigation, so the label carries what the code cannot. But once the
   * user has edited the text it is theirs, and calling it generated would be the
   * same misattribution in the other direction.
   */
  it.each([
    ['generated', null, true],
    ['edited', new Date(), false],
  ])('%s text: labelled as generated = %s', (_case, editedAt, expected) => {
    const view = snippetView({ snippet: 'Some text.', snippetEditedAt: editedAt });

    expect(view.labelAsGenerated).toBe(expected);
  });
});

describe('a snippet the user deleted', () => {
  /**
   * Fails against: a view that forgets ownership survives a deletion.
   *
   * §4.2: "Deleting a snippet sets `snippet` to null and leaves
   * `snippet_edited_at` alone — a deliberate deletion is an edit." So the user
   * owns the ABSENCE, and generating over it must still confirm — otherwise a
   * user who deliberately removed a snippet gets it silently filled back in,
   * which overrules the choice they made.
   *
   * **This case is why `kind` and `confirmBeforeRegenerating` are separate
   * fields.** The panel shows nothing (there is no text), but the action still
   * asks. Deriving the confirmation from `kind` would have collapsed them and
   * lost exactly this state.
   */
  it('shows nothing but still confirms before regenerating', () => {
    const view = snippetView({
      snippet: null,
      snippetEditedAt: new Date('2026-08-20T12:00:00Z'),
    });

    expect(view.kind).toBe('absent');
    expect(view.confirmBeforeRegenerating).toBe(true);
    expect(view.confirmMessage).toMatch(/deleted|removed/i);
  });
});

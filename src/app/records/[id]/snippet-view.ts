/**
 * SPEC.md §10b's snippet, as the panel needs to see it, and A31a's confirmation
 * rule.
 *
 * **Pure and separate from the component**, so the two judgements that matter
 * are testable without a browser: whether regenerating needs confirming, and
 * what the confirmation says. Both are decisions rather than rendering, and a
 * decision buried in JSX can only be asserted through a rendered DOM.
 */

export type SnippetState = {
  snippet: string | null;
  snippetEditedAt: Date | null;
};

export type SnippetView = {
  /** `absent` shows no placeholder (§10b: "absence is fine"). */
  kind: 'absent' | 'generated' | 'edited';
  /**
   * §10b's labelling rule, in the same register as "Discogs estimates".
   *
   * False once the user has edited: the text is then THEIRS, and calling it
   * generated would misattribute their writing to the model — the same error as
   * presenting the model's writing as fact, in the other direction.
   */
  labelAsGenerated: boolean;
  /**
   * A31a. True only when there is user work to lose.
   *
   * Confirming every regeneration would train the user to dismiss the dialog,
   * so the one that matters gets dismissed too — the same reasoning as the
   * cover notice firing on `failed` and never on `none`.
   */
  confirmBeforeRegenerating: boolean;
  /** Null when nothing needs confirming, so no dead string can be rendered. */
  confirmMessage: string | null;
};

/**
 * A31a: **names the text, not the rule.**
 *
 * "Replace the snippet you edited? Your version will be lost." The consequence
 * is what must be legible; a column name is not a consequence, and neither is a
 * status code. §7.3's precedent for deleting an acquired want-list row: "a
 * confirmation naming what is lost, not a bare delete button".
 */
const CONFIRM_REPLACE =
  'Replace the snippet you edited? Your version will be lost and cannot be recovered.';

/**
 * The DELETED case, which needs its own sentence.
 *
 * §4.2: "a deliberate deletion is an edit", so the user owns the ABSENCE. There
 * is no text on screen to point at, and "your version will be lost" would be
 * false — nothing is lost, a choice is overruled. The message says which choice.
 */
const CONFIRM_AFTER_DELETE =
  'You deleted the snippet for this record. Write a new one?';

/**
 * **Ownership and presence are separate questions, and this function keeps them
 * separate.** A user who deleted their snippet still owns the absence, so the
 * panel shows nothing AND the action still asks — deriving one from the other
 * collapses exactly that state, which is why `kind` and
 * `confirmBeforeRegenerating` are not the same field.
 */
export function snippetView(state: SnippetState): SnippetView {
  const owned = state.snippetEditedAt !== null;

  if (state.snippet === null) {
    return {
      kind: 'absent',
      labelAsGenerated: false,
      confirmBeforeRegenerating: owned,
      confirmMessage: owned ? CONFIRM_AFTER_DELETE : null,
    };
  }

  return {
    kind: owned ? 'edited' : 'generated',
    labelAsGenerated: !owned,
    confirmBeforeRegenerating: owned,
    confirmMessage: owned ? CONFIRM_REPLACE : null,
  };
}

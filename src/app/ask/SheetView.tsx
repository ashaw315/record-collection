import type { MatchedTextChecks } from '@/lib/db/queries/matched-text';
import { LABEL } from '../records/[id]/grid-type';

/**
 * **§67's correcting sheet, drawn (step 3; the coordinator's go, 23 Nov).** "The sheet sets the text out a sentence at a
 * time, and a press on a sentence opens that sentence alone for editing while the others stay as they read." The reason
 * is its head, held in view while the text scrolls; no sentence carries a support mark (§67 rules them out; Q75); Clear
 * is drawn only where an edit exists, and it asks first, as does a close with a change unsaved, on the page's asking
 * line. The mechanical checks stored with the draft stand beside the sentences at one line each: the sentence whose
 * figure the credits cannot cover is marked at its own line, the dropped and the disagreements named above the list.
 * Pure: the state comes in and the presses go out, so the structure is asserted with no socket and no browser
 * (SheetView.test.tsx); CorrectingSheet holds the state and the route.
 */
export type SheetViewProps = {
  reason: string;
  sentences: readonly string[];
  openIndex: number | null;
  draft: string;
  hasEdit: boolean;
  dirty: boolean;
  checks: MatchedTextChecks | null;
  asking: 'clear' | 'close' | null;
  error: string | null;
  onOpen: (index: number) => void;
  onDraft: (text: string) => void;
  onCommit: () => void;
  onSave: () => void;
  onClear: () => void;
  onClose: () => void;
  onAnswer: (yes: boolean) => void;
};

const CONTROL = `${LABEL} cursor-pointer border-0 bg-transparent p-0 underline-offset-4 hover:underline disabled:cursor-default disabled:opacity-50`;

/* Proposed wording, in the slot's register (§P.6): the asking line asks one thing and offers the two answers. */
const ASKING: Record<'clear' | 'close', string> = {
  clear: 'Clear the edit and return to the generated text?',
  close: 'Close without saving?',
};

export function SheetView({ reason, sentences, openIndex, draft, hasEdit, dirty, checks, asking, error, onOpen, onDraft, onCommit, onSave, onClear, onClose, onAnswer }: SheetViewProps) {
  const figures = new Set(checks?.numbered ?? []);
  const notes: string[] = [];
  if (checks !== null) {
    if (checks.dropped.length > 0) notes.push(`${checks.dropped.length} sentence${checks.dropped.length === 1 ? '' : 's'} dropped for describing the material: ${checks.dropped.join(' ')}`);
    for (const d of checks.disagreements) notes.push(`sentences ${d.a} and ${d.b}: ${d.why}`);
  }
  return (
    <div data-correcting-sheet="" role="dialog" aria-modal="true" aria-label="Correct the text" className="fixed inset-0 z-50 flex flex-col bg-background">
      {/* The head: the reason, held in view while the text scrolls; CLOSE on its row as the sleeve's is (§M). */}
      <div data-sheet-head="" className="box-border shrink-0 border-b border-border px-[18px] py-[14px]">
        <div className="flex items-start gap-[18px]">
          <p data-sheet-reason="" className="text-prose leading-[1.55]">
            {reason}
          </p>
          <button type="button" data-sheet-close="" onClick={onClose} className={`${CONTROL} ml-auto shrink-0`}>
            Close
          </button>
        </div>
        {asking !== null && (
          <p data-sheet-asking="" role="status" className="mt-[10px] text-prose">
            {ASKING[asking]}{' '}
            <button type="button" data-sheet-answer="yes" onClick={() => onAnswer(true)} className={CONTROL}>
              Yes
            </button>{' '}
            <button type="button" data-sheet-answer="no" onClick={() => onAnswer(false)} className={CONTROL}>
              Keep editing
            </button>
          </p>
        )}
        {error !== null && (
          <p data-sheet-error="" role="alert" className="mt-[10px] text-prose">
            {error}
          </p>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-[18px] py-[18px]">
        {notes.length > 0 && (
          <ul data-sheet-checks="" className={`mb-[18px] ${LABEL}`}>
            {notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        )}
        <ol data-sheet-sentences="" className="flex flex-col gap-[12px]">
          {sentences.map((sentence, index) => (
            <li key={`${index}-${sentence}`} data-sheet-sentence="" data-index={index} {...(figures.has(index + 1) ? { 'data-sheet-check': 'figure' } : {})}>
              {openIndex === index ? (
                <div>
                  <textarea
                    data-sheet-open=""
                    aria-label={`Sentence ${index + 1}`}
                    value={draft}
                    onChange={(event) => onDraft(event.target.value)}
                    rows={3}
                    className="box-border w-full border border-border bg-transparent p-[8px] text-prose leading-[1.55]"
                  />
                  <button type="button" data-sheet-commit="" onClick={onCommit} className={`${CONTROL} mt-[6px]`}>
                    Done
                  </button>
                </div>
              ) : (
                <button type="button" data-sheet-sentence-button="" onClick={() => onOpen(index)} className="block w-full cursor-pointer border-0 bg-transparent p-0 text-left text-prose leading-[1.55]">
                  {sentence}
                </button>
              )}
              {figures.has(index + 1) && <span className={`mt-[4px] block ${LABEL}`}>A figure to check against the credits</span>}
            </li>
          ))}
        </ol>
      </div>
      <div className="box-border flex shrink-0 items-center gap-[24px] border-t border-border px-[18px] py-[14px]">
        <button type="button" data-sheet-save="" onClick={onSave} disabled={!dirty} className={CONTROL}>
          Save
        </button>
        {hasEdit && (
          <button type="button" data-sheet-clear="" onClick={onClear} className={CONTROL}>
            Clear
          </button>
        )}
      </div>
    </div>
  );
}

import Link from 'next/link';
import type { RecordSummary } from './summary';
import { HAIRLINE, INK, LABEL, LABEL_INK } from '../records/[id]/grid-type';

/**
 * **The pulled record's facts, in the record screen's order (§11.19).**
 *
 * Artist, title, year, then the note, then the fact groups on their
 * hairlines, then Open the full record and the two verbs. Turn over and Put
 * back sit together at the foot because they are the two things you can do
 * to the object; Open the full record sits above them because it leaves
 * this surface — §3's rule, separating a departure from an interaction.
 * The panel is the record screen's order, not a summary of it: no count of
 * further facts, no truncation, no toggle — §11.9 fixed its region and it
 * is expanded at rest.
 *
 * ## Generated and entered facts stay distinguishable (A33c)
 *
 * The note is the app's own claim about the music, carried as
 * `{ text, generated }` since 13c so it can never be rendered as a fact. It
 * sits above the fact groups, labelled in the register §10b requires, with
 * a hairline between. `RecordSummary` keeps `snippet` and `factGroups` as
 * separate fields precisely so this component cannot merge them.
 *
 * **Set in the record screen's type and rules (§11.7):** flat, on paper,
 * labels at `LABEL`, hairlines for rules.
 *
 * Left open by §11.19, reported rather than solved: a long title wraps in
 * the 420px column and pushes the fact groups toward a foot the two verbs
 * pin — §4.2's collision, in a column with no ornament track to yield.
 */
export function RecordPanel({
  summary,
  onTurnOver,
  onPutBack,
  alwaysExpanded = true,
}: {
  summary: RecordSummary;
  onTurnOver: () => void;
  onPutBack: () => void;
  /** Kept for the callers that pass it; the panel has one state now, expanded. */
  alwaysExpanded?: boolean;
}) {
  void alwaysExpanded;
  const groupName = (kind: string) => kind.charAt(0).toUpperCase() + kind.slice(1);

  return (
    <div data-testid="record-panel" data-expanded="true">
      <p data-testid="panel-artist" className={LABEL}>
        {summary.artist}
      </p>
      <h3 data-testid="summary-title" className={`mt-[6px] text-title font-semibold ${INK}`}>
        {summary.title}
      </h3>
      {summary.year !== null && (
        <p data-testid="panel-year" className="mt-[4px] text-prose" style={{ color: LABEL_INK }}>
          {summary.year}
        </p>
      )}

      {summary.snippet !== null && (
        <section data-testid="panel-snippet" className="mt-[18px]">
          {/*
            **The generated label, kept (A33c).** The note is the app asserting
            something about the music; §10b requires it in the register of
            "Discogs estimates", never as established fact. The label travels
            with the text because `RecordSummary.snippet` carries the
            `generated` flag — an edited note is the user's and is labelled so.
          */}
          <p data-testid="panel-snippet-label" className={`mb-[6px] ${LABEL}`}>
            {summary.snippet.generated ? 'A note, written by Claude' : 'Your note'}
          </p>
          <p className={`text-prose leading-[1.55] ${INK}`}>{summary.snippet.text}</p>
        </section>
      )}

      {/*
        Every group on its own hairline (§11.19). The first one's is also
        **the boundary (A33c)** between the generated note and the entered
        facts, so the panel never reads as one undifferentiated block
        asserting things about music without saying which part it made up.
      */}
      {summary.factGroups.length > 0 && (
        <dl data-testid="panel-facts" className="mt-[18px]">
          {summary.factGroups.map((group, index) => (
            <div
              key={group.kind}
              data-group={group.kind}
              data-testid={index === 0 && summary.snippet !== null ? 'panel-boundary' : undefined}
              className={`grid grid-cols-[112px_1fr] gap-x-4 border-t py-[10px] ${HAIRLINE}`}
            >
              <dt className={LABEL}>{groupName(group.kind)}</dt>
              <dd className={`text-prose ${INK}`}>{group.rows.map((row) => row.value).join(' · ')}</dd>
            </div>
          ))}
        </dl>
      )}

      {/* Leaves this surface, so it sits above the two verbs rather than among them (§3, §11.19). */}
      <Link href={summary.href} data-testid="panel-detail-link" className={`mt-[18px] inline-block text-prose underline ${INK}`}>
        Open the full record — journal, prices, images
      </Link>

      {/*
        §11.31: above the two verbs, bleeding across the facts column. The
        count is the collection and everything below it is one record; the
        verbs are what you do rather than what is true, so the rule closes
        the panel's lower end.
      */}
      <hr data-line="facts-verbs" className={`border-t ${HAIRLINE}`} style={{ margin: "18px -34px 0" }} />

      {/* The two things you can do to the object, together at the foot. */}
      <div className="mt-[14px] flex gap-2">
        <button type="button" onClick={onTurnOver} data-testid="action-turn" className={`min-h-11 flex-1 border text-prose ${HAIRLINE} ${INK}`}>
          Turn over
        </button>
        <button type="button" onClick={onPutBack} data-testid="action-put" className={`min-h-11 flex-1 border text-prose ${HAIRLINE} ${INK}`}>
          Put back
        </button>
      </div>
    </div>
  );
}

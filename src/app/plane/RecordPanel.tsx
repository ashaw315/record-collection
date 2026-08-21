'use client';

import { useState } from 'react';
import Link from 'next/link';
import { PANEL_TEXT } from '../shelf/panel-palette';
import type { RecordSummary } from './summary';

/**
 * **The pulled record's facts, as a panel that expands in place (§10b, A33).**
 *
 * The chevron does not navigate — it expands the panel over the record, the
 * synopsis scrolling inside it, the record staying behind, as the reference
 * does. A33 superseded A32's decision that the tap went to `/records/:id`;
 * that page is now reached by a link INSIDE the expanded panel, for what the
 * panel does not hold — the journal, prices, images and editing.
 *
 * One component for both layouts (A33d): the narrow overlay and the wide
 * flanking panel both use it. The wide panel's difference is only that it sits
 * beside the record with room, not over it — the expand/collapse behaviour is
 * the same, because a behavioural fork on top of A32's layout fork has no room
 * argument behind it.
 *
 * ## Generated and entered facts stay distinguishable (A33c)
 *
 * The snippet is the app's own claim about the music, carried as
 * `{ text, generated }` since 13c so it can never be rendered as a fact. It sits
 * above the fact list, labelled in the register §10b requires, with a boundary
 * between. `RecordSummary` keeps `snippet` and `factGroups` as separate fields
 * precisely so this component cannot merge them.
 */
export function RecordPanel({
  summary,
  onTurnOver,
  onPutBack,
  alwaysExpanded = false,
}: {
  summary: RecordSummary;
  onTurnOver: () => void;
  onPutBack: () => void;
  /**
   * **The flanking layout has room, so it shows the expanded content at rest
   * (A33d)** — the snippet, the facts and the link, no chevron. The overlay
   * (narrow) toggles. One behaviour, two layouts: the wide panel is "the
   * expanded shape at rest", not a second, static fork.
   */
  alwaysExpanded?: boolean;
}) {
  const [toggled, setToggled] = useState(false);
  const expanded = alwaysExpanded || toggled;

  const attribution = [summary.artist, summary.year].filter((part) => part !== null).join(' · ');

  return (
    <div data-testid="record-panel" data-expanded={expanded ? 'true' : 'false'}>
      {/*
        The collapsed header: title, attribution, and a chevron that expands
        rather than navigates. A button, not a link — the destination is inside
        the expansion now.
      */}
      <button
        type="button"
        data-testid="panel-expand-toggle"
        aria-expanded={expanded}
        onClick={() => setToggled((open) => !open)}
        disabled={alwaysExpanded}
        className="group flex w-full items-center gap-3 rounded-xs px-4 py-3 text-left"
      >
        <div className="min-w-0 flex-1">
          <h3
            data-testid="summary-title"
            className="font-heading truncate text-lg leading-tight font-semibold"
            style={{ color: PANEL_TEXT.title }}
          >
            {summary.title}
          </h3>
          <p
            data-testid="summary-attribution"
            className="mt-0.5 truncate text-sm"
            style={{ color: PANEL_TEXT.muted }}
          >
            {attribution}
          </p>
          <p
            data-testid="summary-further"
            className="mt-1 truncate text-xs"
            style={{ color: PANEL_TEXT.muted }}
          >
            {summary.furtherFacts === 0
              ? 'Nothing else recorded yet'
              : `${summary.furtherFacts} more ${summary.furtherFacts === 1 ? 'fact' : 'facts'}`}
          </p>
        </div>
        {!alwaysExpanded && (
          <span
            aria-hidden="true"
            className="shrink-0 text-lg transition-transform"
            style={{
              color: PANEL_TEXT.muted,
              transform: expanded ? 'rotate(90deg)' : undefined,
            }}
          >
            ›
          </span>
        )}
      </button>

      {expanded && (
        <div
          data-testid="panel-expanded"
          /*
            Scrolls WITHIN the panel — the record stays whole behind it, the
            synopsis unfolds inside, as the reference does. Capped so the panel
            never grows past the record it sits over.
          */
          className="max-h-64 overflow-y-auto px-4 pb-3"
        >
          {summary.snippet !== null && (
            <section data-testid="panel-snippet" className="mb-4">
              {/*
                **The generated label, kept (A33c).** The snippet is the app
                asserting something about the music; §10b requires it in the
                register of "Discogs estimates", never as established fact. The
                label travels with the text because `RecordSummary.snippet`
                carries the `generated` flag — an edited snippet is the user's
                and is labelled so.
              */}
              <p
                data-testid="panel-snippet-label"
                className="mb-1 text-[11px] tracking-wide uppercase"
                style={{ color: PANEL_TEXT.muted }}
              >
                {summary.snippet.generated ? 'A note, written by Claude' : 'Your note'}
              </p>
              <p className="text-sm leading-relaxed" style={{ color: PANEL_TEXT.value }}>
                {summary.snippet.text}
              </p>
            </section>
          )}

          {/*
            **The boundary (A33c).** A rule between the generated synopsis and the
            entered facts, so the panel never reads as one undifferentiated block
            asserting things about music without saying which part it made up.
            Present only when both sides exist — a boundary above nothing is
            noise.
          */}
          {summary.snippet !== null && summary.factGroups.length > 0 && (
            <hr data-testid="panel-boundary" className="mb-4 border-t" style={{ borderColor: PANEL_TEXT.muted, opacity: 0.25 }} />
          )}

          {summary.factGroups.length > 0 && (
            <dl data-testid="panel-facts" className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
              {summary.factGroups.flatMap((group) =>
                group.rows.map((row) => (
                  <div key={`${group.kind}-${row.label}`} className="contents">
                    <dt style={{ color: PANEL_TEXT.muted }}>{row.label}</dt>
                    <dd style={{ color: PANEL_TEXT.value }}>{row.value}</dd>
                  </div>
                )),
              )}
            </dl>
          )}

          {/*
            The link to the full record — INSIDE the expanded panel (A33b), for
            what the panel does not hold. The one destination §10b's keyboard
            list also uses.
          */}
          <Link
            href={summary.href}
            data-testid="panel-detail-link"
            className="mt-4 inline-block text-sm underline"
            style={{ color: PANEL_TEXT.title }}
          >
            Open the full record — journal, prices, images
          </Link>
        </div>
      )}

      {/* The controls belong with the panel in both states. */}
      <div className="mt-2 flex gap-2 px-4 pb-3">
        <button
          type="button"
          onClick={onTurnOver}
          data-testid="action-turn"
          className="min-h-11 flex-1 rounded-xs border border-border text-sm"
          style={{ color: PANEL_TEXT.title }}
        >
          Turn over
        </button>
        <button
          type="button"
          onClick={onPutBack}
          data-testid="action-put"
          className="min-h-11 flex-1 rounded-xs border border-border text-sm"
          style={{ color: PANEL_TEXT.title }}
        >
          Put back
        </button>
      </div>
    </div>
  );
}

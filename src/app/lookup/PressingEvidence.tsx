import type { PressingEvidence as Evidence } from './pressing-evidence';

/**
 * SPEC.md §12 step 14c — the evidence panel.
 *
 * Shows what Discogs holds about the physical object so the user can compare it
 * against the record in their hands. **It asserts nothing.** There is no match,
 * no score, no "this is probably yours" — the user's eye is the matcher, and
 * the app's only job is to put the evidence where they can read it.
 */
export function PressingEvidencePanel({ evidence }: { evidence: Evidence }) {
  /**
   * §12 step 14c: "Absence reads as absence." A release Discogs holds nothing
   * for must SAY so — an empty panel looks like a fetch that failed, and the
   * user would go looking for a button to press again.
   */
  if (!evidence.hasEvidence) {
    return (
      <div data-testid="pressing-evidence" className="mt-2 border-t border-border px-3 pt-2">
        <p data-testid="evidence-none" className="text-xs text-muted-foreground">
          Discogs holds no matrix, runout or pressing details for this release. That is a gap in
          the database, not a fact about the record.
        </p>
        {evidence.notes !== null && <Notes notes={evidence.notes} />}
      </div>
    );
  }

  return (
    <div data-testid="pressing-evidence" className="mt-2 border-t border-border px-3 pt-2">
      {/*
        **Identifiers and companies FIRST** (§12 step 14c). These are transcribed
        off the object and checkable against what the user is holding, which is
        why they lead: the panel is read top-down by someone with a record in one
        hand.
      */}
      {evidence.runouts.length > 0 && (
        <section data-testid="evidence-runouts">
          <h4 className="text-xs font-medium">Matrix / runout</h4>
          <dl className="mt-1 space-y-1">
            {evidence.runouts.map((runout, index) => (
              <div key={`${runout.value}-${index}`} className="text-xs">
                {runout.description !== null && (
                  <dt className="text-muted-foreground">{runout.description}</dt>
                )}
                {/*
                  **VERBATIM, and this is the rule the feature lives or dies by**
                  (§12 step 14c). `whitespace-pre-wrap` is load-bearing, not
                  cosmetic: the browser's default `white-space: normal` COLLAPSES
                  interior runs of spaces, so a runout with double spacing would
                  render tidied even though the string reached the DOM intact.
                  The user's eye is the matcher, so a collapsed space is
                  discrimination thrown away silently.

                  `font-mono` for the same reason — proportional glyphs make
                  `LW2` and `LW1` harder to tell apart at a glance.
                */}
                <dd
                  data-testid="runout-value"
                  className="whitespace-pre-wrap font-mono break-words"
                >
                  {runout.value}
                </dd>
              </div>
            ))}
          </dl>

          {/*
            **What a match ESTABLISHES**, said once, only where variants exist.
            Found by Adam on first real use: a release can file six runout
            variants, so finding your deadwax among them identifies the release
            and not the stamper (NOTES).

            Phrased as what it DOES establish rather than what it does not —
            a reader standing in a shop wants the boundary, not a disclaimer.
            It does not explain what a stamper is: anyone reading a deadwax
            already knows, and explaining it would make the line skippable.

            CLAUDE.md §8's "a pressing is not an album" has a level below the
            one this screen reaches, and this is the app naming which level it
            got to — the same honesty as the identical-row collapse.
          */}
          {evidence.hasRunoutVariants && (
            <p data-testid="variant-limit" className="mt-1 text-xs text-muted-foreground">
              Variants are different stampers within this release — a match identifies the
              release.
            </p>
          )}
        </section>
      )}

      {evidence.otherIdentifiers.length > 0 && (
        <section data-testid="evidence-identifiers" className="mt-2">
          <h4 className="text-xs font-medium">Other identifiers</h4>
          <ul className="mt-1 space-y-0.5">
            {evidence.otherIdentifiers.map((identifier, index) => (
              <li key={`${identifier.type}-${index}`} className="text-xs text-muted-foreground">
                <span className="text-foreground">{identifier.type}: </span>
                <span className="whitespace-pre-wrap font-mono break-words">
                  {identifier.value}
                </span>
                {identifier.description !== null && <> ({identifier.description})</>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {evidence.companies.length > 0 && (
        <section data-testid="evidence-companies" className="mt-2">
          <h4 className="text-xs font-medium">Made by</h4>
          <ul className="mt-1 space-y-0.5">
            {evidence.companies.map((company, index) => (
              <li key={`${company.role}-${company.name}-${index}`} className="text-xs">
                <span className="text-muted-foreground">{company.role}: </span>
                {company.name}
              </li>
            ))}
          </ul>
        </section>
      )}

      {evidence.notes !== null && <Notes notes={evidence.notes} />}
    </div>
  );
}

/**
 * **Notes are CONTEXT, not evidence, and the panel says so** (§12 step 14c).
 *
 * A runout is transcribed off the object; notes are someone's description of the
 * release, running to several hundred characters. They earned their place by
 * resolving the one collision group identifiers could not — but they are a
 * different KIND of thing, kept visually distinct the way §7.8 keeps a generated
 * snippet distinct from the facts.
 *
 * Rendered in its own element with its own label, so the separation survives a
 * refactor rather than depending on where it happens to sit in the markup.
 */
function Notes({ notes }: { notes: string }) {
  return (
    <section data-testid="evidence-notes" className="mt-2 border-t border-dashed border-border pt-2">
      <h4 className="text-xs font-medium text-muted-foreground">
        Contributor notes — context, not evidence
      </h4>
      <p className="mt-1 text-xs whitespace-pre-wrap text-muted-foreground italic">{notes}</p>
    </section>
  );
}

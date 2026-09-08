import { pressingVariantPanel, type HeldPressing } from './pressing-variants';

/**
 * SPEC.md §12b (A55, 2026-09-08) — what the app HOLDS about the pressing being
 * hunted, shown rather than described.
 *
 * **This panel asserts nothing.** Every string on it came from Discogs or from
 * the user's own entry, and it is displayed verbatim. That is the whole design:
 * A43's generated assessment invented CAD 3016 for a record whose catalogue
 * number is CAD 3X38, and a fabricated identifier is a navigational failure no
 * disclaimer can mitigate — the user goes to the wrong record.
 *
 * **Relayed, and labelled as relayed.** The values are not facts the app
 * established; Discogs data is user-submitted (CLAUDE.md §8) and the user's own
 * entry is their reading of the object. So the panel says where they came from
 * and does not vouch for them.
 */
export function PressingVariants({ pressing }: { pressing: HeldPressing | null }) {
  const panel = pressingVariantPanel(pressing);

  /*
   * **A bare row renders ONE SENTENCE, no panel** (A56, amended after E2E).
   *
   * §10's existing rule — asserted by `want-list.spec.ts:796` — is that a row
   * with nothing recorded says NOTHING about what is absent: blank is a
   * legitimate state rather than a gap to be filled, and a list of absences
   * would turn a bare row into a form with holes in it. The first version of
   * this panel broke that rule by rendering a heading and a message on exactly
   * such a row.
   *
   * **But the Ask button vanished from that row**, and an affordance
   * disappearing with no explanation is a different problem from a blank field.
   * So one sentence explains the thing that CHANGED, where the button was — no
   * heading, no panel chrome, no description of empty fields.
   *
   * The three-state distinction stays and shows for `no-detail`, which is the
   * case it was built for: "this pressing has no identifying details" is about a
   * thing that exists, where "no target pressing" is about a thing that does not,
   * and only the first belongs in a panel.
   */
  if (panel.state === 'no-pressing') {
    return (
      <p data-testid="variants-no-pressing" className="mt-6 text-xs text-muted-foreground">
        Attach a target pressing to ask Claude about it.
      </p>
    );
  }

  return (
    <section className="mt-6 border-t border-border pt-4">
      <h2 className="font-heading text-sm font-semibold tracking-tight">
        The pressing you are hunting
      </h2>

      {panel.message !== null ? (
        /*
          **The empty state says WHICH empty it is** (A52's three-zero rule,
          reused rather than rebuilt). "No pressing attached" and "this pressing
          has no variant data" are different facts implying different actions,
          and collapsing them would rebuild the defect the walk just fixed.
        */
        <p data-testid={`variants-${panel.state}`} className="mt-2 text-sm text-muted-foreground">
          {panel.message}
        </p>
      ) : (
        <>
          <dl data-testid="variants-detail" className="mt-2 space-y-1">
            {panel.fields.map((field) => (
              <div key={field.label} className="flex gap-2 text-sm">
                <dt className="shrink-0 text-muted-foreground">{field.label}</dt>
                {/*
                  Mono, and verbatim. A runout is a string of glyphs read off the
                  deadwax — spacing and case carry meaning, and "Salt" is the
                  whole distinction between two Halcyon Digest variants.
                */}
                <dd className="font-mono break-all">{field.value}</dd>
              </div>
            ))}
          </dl>

          {/*
            **Says where these came from, and vouches for nothing.** §5.7's rule
            that Discogs is "a strong starting point, never proof", applied to a
            panel whose entire content is relayed.
          */}
          <p className="mt-2 text-xs text-muted-foreground">
            Recorded on this entry — from your own notes or a Discogs lookup. Check them
            against the record in your hand.
          </p>
        </>
      )}
    </section>
  );
}

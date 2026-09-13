import Link from 'next/link';
import { HAIRLINE, LABEL } from './grid-type';
import { formatPrice } from '../../collection-format';
import { pressingFacts } from '../record-detail-format';
import { priceTypeMeaning, type PriceType } from './price-line';
import type { HydratedRecord } from '@/lib/db/queries/records';

/**
 * The record's FIELDS on the detail screen (SPEC.md §10 `/records/:id`).
 *
 * A server component, and deliberately only the fields. The gallery, price
 * history and journal are siblings assembled by `page.tsx`, not children of
 * this one: each is interactive or has its own data, and mixing them in here
 * would make the whole screen a client component to serve three sections that
 * need it.
 *
 * **This docblock previously said the gallery, the journal, the sparkline and
 * the edit form were "DELIBERATELY ABSENT" and named the steps that would add
 * them.** All four shipped, two steps earlier, and `page.tsx` renders every one
 * of them — so a reader trusting the header would have concluded the screen was
 * half-built. It was accurate when written and became false without being
 * touched, which is the ordinary way a comment goes wrong: the code it
 * described moved to a different file.
 *
 * Kept as a note rather than deleted, because the ABSENCE it justified is a
 * live rule and still correct: no placeholder sections. An empty gallery that
 * does nothing reads as broken rather than as not-yet-built, and a reader
 * cannot tell the difference.
 */

function Field({
  label,
  children,
  mono = false,
}: {
  label: string;
  children: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className={`border-b ${HAIRLINE} py-2 last:border-0 sm:flex sm:gap-4`}>
      <dt className={`${LABEL} sm:w-40 sm:shrink-0 sm:pt-0.5`}>
        {label}
      </dt>
      <dd className={mono ? 'font-mono text-detail' : 'text-detail'}>{children}</dd>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-6">
      <h2 className={`mb-2 ${LABEL}`}>{title}</h2>
      <dl>{children}</dl>
    </section>
  );
}

export function RecordDetail({ record }: { record: HydratedRecord }) {
  const facts = pressingFacts(
    record.pressing ?? {
      catalogNumber: null,
      matrixRunout: null,
      pressingPlant: null,
      yearPressed: null,
      countryPressed: null,
      vinylWeightGrams: null,
      colorVariant: null,
      isReissue: false,
    },
  );

  /**
   * The facts the GRID already shows, excluded here so the page does not state
   * anything twice. Named as a list rather than filtered by position, because a
   * reorder of `pressingFacts` must not silently change what this renders.
   */
  const GRID_CARRIES = new Set([
    'Catalog number',
    'Country',
    'Pressed',
    /*
      **8a carries the matrix, which `RecordGrid` did not.** It has a cell of
      its own — mono, "because a character matters" — so leaving it here stated
      it twice, and `getByText` went ambiguous exactly as the note above
      describes. The seam moved when the screen did; this list is how it moves.
    */
    'Matrix / runout',
  ]);
  const remainingFacts = facts.filter((fact) => !GRID_CARRIES.has(fact.label));

  return (
    <article>
      {/*
        **The title, artist, Record, Pressing and Acquisition sections are gone
        (7a §6).** The grid above this renders all of them, and §6's rule —
        "labels that duplicate their content are dropped rather than restyled" —
        applies at the seam as much as inside a cell. Keeping both made the page
        state every fact twice, which broke 24 locators across six E2E files by
        making `getByText` ambiguous; the duplication was visible on screen
        before any test found it.

        What remains is what the grid does NOT carry: the matrix/runout and the
        other pressing facts too specific for a two-line block, and Tags. (The
        note itself is 8a's, in the journal cell's `About` block.)
      */}

      {/*
        **The pressing facts the grid does NOT carry.** The grid's two-line
        pressing block holds label, format, catalog number, country and year;
        these five are too specific for it and have nowhere else to go —
        matrix/runout especially, which §4 of SPEC.md calls user-authoritative
        and is how a collector identifies a pressing when catalogue numbers
        agree.

        Filtered rather than re-listed, so a new fact added to `pressingFacts`
        appears here automatically unless the grid claims it.
      */}
      {remainingFacts.length > 0 && (
        <Section title="Pressing detail">
          {remainingFacts.map((fact) => (
            <Field key={fact.label} label={fact.label} mono={fact.mono}>
              {fact.value}
            </Field>
          ))}
        </Section>
      )}

      {/*
        **Acquisition's Paid / Bought / From fields are gone** — the grid's
        provenance module carries them (§6). `Latest price` stays, because it
        answers a different question from the grid's market median: the latest
        OBSERVATION whatever its type, against the median of all of them. Two
        numbers that can legitimately differ, each labelled with what it is.
      */}
      <Section title="Acquisition">
        {/*
          The LATEST price, whatever its type — NOT §7.6's used → new →
          purchase_price chain, which is defined for the collection-value
          aggregate on the stats screen. The two answer different questions and
          a record can legitimately show one number here and contribute another
          there, so this one says which it is rather than being labelled
          "value". See NOTES.md on the §7.6 hazard.

          No sparkline: nothing writes price_history until step 9, so a chart
          would be an empty box on every record. It arrives with the data.
        */}
        {record.latestPrice !== null && (
          <Field label="Latest price">
            <span className="font-mono tabular-nums">{formatPrice(record.latestPrice.price)}</span>
            {/*
              The type EXPLAINED, not the raw enum. This read "$120.00 asking"
              directly beside "PAID $8.00", which invites reading the record as
              worth $120 — and $120 is precisely the figure nobody paid.
              Same rule as the observation list below and §7.6's total: the
              number and its meaning arrive together.
            */}
            <span className="ml-2 text-meta text-muted-foreground">
              {priceTypeMeaning(record.latestPrice.priceType as PriceType)}
            </span>
          </Field>
        )}
      </Section>

      {/*
        **Genres left this section for the grid's pressing block** (7a §1.1:
        "the genres line moves into the pressing block, which is where it
        belongs on the facts side anyway"). Tags stay — the grid has no tags
        cell, and a tag is the owner's own filing rather than a fact about the
        pressing.
      */}
      {record.tags.length > 0 && (
        <Section title="Filed under">
          {record.tags.length > 0 && (
            <Field label="Tags">
              <span className="flex flex-wrap gap-1">
                {record.tags.map((tag) => (
                  <Link
                    key={tag.id}
                    href={`/?tagId=${tag.id}`}
                    className="rounded-xs border border-border px-1.5 py-0.5 text-label hover:bg-accent"
                  >
                    {tag.name}
                  </Link>
                ))}
              </span>
            </Field>
          )}
        </Section>
      )}

      {/*
        **Notes moved above the seam with 8a.** 8a's journal cell renders the
        note under an `About` rule, so a `Notes` section here stated it twice
        and `getByText` went ambiguous — the same duplication the note at the
        top of this file describes, arriving again because the screen above
        changed and the seam did not move with it.
      */}
    </article>
  );
}

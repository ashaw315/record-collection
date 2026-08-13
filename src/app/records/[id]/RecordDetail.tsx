import Link from 'next/link';
import { formatPrice, formatYear } from '../../collection-format';
import { conditionLabel, pressingFacts } from '../record-detail-format';
import { priceTypeMeaning, type PriceType } from './price-line';
import type { HydratedRecord } from '@/lib/db/queries/records';

/**
 * The record detail screen (SPEC.md §10 `/records/:id`).
 *
 * A server component: it renders props and has no interactivity yet. The edit
 * form is unit 9.
 *
 * DELIBERATELY ABSENT: the images gallery (step 8) and journal entries with
 * their add-entry form (step 9). No placeholder sections — an empty gallery
 * that does nothing reads as broken rather than as not-yet-built, and a reader
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
    <div className="border-b border-border py-2 last:border-0 sm:flex sm:gap-4">
      <dt className="text-xs tracking-wide text-muted-foreground uppercase sm:w-40 sm:shrink-0 sm:pt-0.5">
        {label}
      </dt>
      <dd className={mono ? 'font-mono text-sm' : 'text-sm'}>{children}</dd>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-6">
      <h2 className="mb-1 font-heading text-sm font-semibold tracking-tight">{title}</h2>
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

  const grade = (value: string | null) => {
    if (value === null) return <span className="text-muted-foreground">Not graded</span>;
    const full = conditionLabel(value);
    return (
      <span className="font-mono" title={full}>
        {value}
      </span>
    );
  };

  return (
    <article>
      <header className="mb-5">
        <h1 className="font-heading text-xl font-semibold tracking-tight">{record.title}</h1>
        {/* The artist links to the collection filtered by them — the question
            "what else do I have by this artist" is one click, not a search. */}
        <p className="mt-0.5 text-sm">
          <Link
            href={`/?artistId=${record.artist.id}`}
            className="text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
          >
            {record.artist.name}
          </Link>
        </p>
      </header>

      <Section title="Record">
        <Field label="Release year">
          {record.releaseYear === null ? (
            <span className="text-muted-foreground">Unknown</span>
          ) : (
            <span className="font-mono tabular-nums">{formatYear(record.releaseYear)}</span>
          )}
        </Field>
        {record.label !== null && (
          <Field label="Label">
            <Link href={`/?labelId=${record.label.id}`} className="underline-offset-2 hover:underline">
              {record.label.name}
            </Link>
          </Field>
        )}
        {record.format !== null && <Field label="Format">{record.format.name}</Field>}
        <Field label="Media condition">{grade(record.conditionMedia)}</Field>
        <Field label="Sleeve condition">{grade(record.conditionSleeve)}</Field>
      </Section>

      {/* Only when the pressing carries something. A found-or-created pressing
          row can be nearly empty (§4), and an empty section is worse than none. */}
      {facts.length > 0 && (
        <Section title="Pressing">
          {facts.map((fact) => (
            <Field key={fact.label} label={fact.label} mono={fact.mono}>
              {fact.value}
            </Field>
          ))}
        </Section>
      )}

      <Section title="Acquisition">
        <Field label="Paid">
          {record.purchasePrice === null ? (
            <span className="text-muted-foreground">Not recorded</span>
          ) : (
            <span className="font-mono tabular-nums">{formatPrice(record.purchasePrice)}</span>
          )}
        </Field>
        {record.purchaseDate !== null && (
          <Field label="Bought">
            <span className="font-mono tabular-nums">{record.purchaseDate}</span>
          </Field>
        )}
        {record.store !== null && (
          <Field label="From">
            <Link href={`/?storeId=${record.store.id}`} className="underline-offset-2 hover:underline">
              {record.store.name}
            </Link>
          </Field>
        )}
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
            <span className="ml-2 text-xs text-muted-foreground">
              {priceTypeMeaning(record.latestPrice.priceType as PriceType)}
            </span>
          </Field>
        )}
      </Section>

      {(record.genres.length > 0 || record.tags.length > 0) && (
        <Section title="Filed under">
          {record.genres.length > 0 && (
            <Field label="Genres">
              <span className="flex flex-wrap gap-1">
                {record.genres.map((genre) => (
                  <Link
                    key={genre.id}
                    href={`/?genreId=${genre.id}`}
                    className="rounded-xs border border-border px-1.5 py-0.5 text-xs hover:bg-accent"
                  >
                    {genre.name}
                  </Link>
                ))}
              </span>
            </Field>
          )}
          {record.tags.length > 0 && (
            <Field label="Tags">
              <span className="flex flex-wrap gap-1">
                {record.tags.map((tag) => (
                  <Link
                    key={tag.id}
                    href={`/?tagId=${tag.id}`}
                    className="rounded-xs border border-border px-1.5 py-0.5 text-xs hover:bg-accent"
                  >
                    {tag.name}
                  </Link>
                ))}
              </span>
            </Field>
          )}
        </Section>
      )}

      {record.notes !== null && record.notes !== '' && (
        <Section title="Notes">
          {/* whitespace-pre-line: a note typed with line breaks keeps them. */}
          <p className="text-sm whitespace-pre-line">{record.notes}</p>
        </Section>
      )}
    </article>
  );
}

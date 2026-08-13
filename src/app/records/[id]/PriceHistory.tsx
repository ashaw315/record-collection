'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatPrice } from '@/app/collection-format';
import { priceLine } from './price-line';
import {
  SPARK_HEIGHT,
  SPARK_WIDTH,
  priceRange,
  sparklinePoints,
  type PriceObservation,
} from './sparkline';

/**
 * §10's "price history sparkline", with §5.2's append control.
 *
 * **Append-only (§7.5).** There is no edit affordance, deliberately: a
 * correction is a new observation, not a rewrite, and offering an edit here
 * would promise something the endpoint refuses.
 */

/**
 * §4.2's three types, labelled in the user's terms.
 *
 * `best_dig` is gone (migration 0005): it names a PRESSING worth hunting for,
 * never a price, and offering it here produced "$120.00 best dig" — which reads
 * as "best price", the exact §8 conflation the rule forbids.
 */
const PRICE_TYPES = [
  { value: 'used', label: 'Used — what a copy sold for' },
  { value: 'new', label: 'New — a sealed copy' },
  { value: 'asking', label: 'Asking — wanted, not paid' },
] as const;

export function PriceHistory({
  recordId,
  observations,
}: {
  recordId: string;
  observations: PriceObservation[];
}) {
  const router = useRouter();

  const [price, setPrice] = useState('');
  const [priceType, setPriceType] = useState<string>('used');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  // Controlled inputs read on submit — the marker is a default for this shape
  // now, not something to rediscover when a mobile test fails (NOTES).
  const formRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    formRef.current?.setAttribute('data-hydrated', 'true');
  }, []);

  const points = sparklinePoints(observations);
  const range = priceRange(observations);

  async function add() {
    if (price.trim() === '') {
      setError('Enter a price first.');
      return;
    }

    setBusy(true);
    setError(undefined);

    try {
      const response = await fetch(`/api/records/${recordId}/prices`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ price: price.trim(), priceType }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setError(body?.error?.message ?? 'That price could not be saved.');
        return;
      }

      setPrice('');
      router.refresh();
    } catch {
      setError('Could not reach the server. Nothing was saved.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mt-6" data-testid="price-history">
      <h2 className="mb-1 font-heading text-sm font-semibold tracking-tight">Price history</h2>

      {points.length === 0 ? (
        <p className="mb-3 text-sm text-muted-foreground">
          No prices recorded. Add what it is worth, or what you were quoted.
        </p>
      ) : (
        <div className="mb-3">
          <svg
            data-testid="sparkline"
            viewBox={`0 0 ${SPARK_WIDTH} ${SPARK_HEIGHT}`}
            preserveAspectRatio="none"
            className="h-10 w-full max-w-xs text-primary"
            role="img"
            /**
             * The shape carries no numbers, so the label does. A chart a screen
             * reader cannot describe is decoration, and §10 asked for
             * information.
             */
            aria-label={
              range === null
                ? 'Price history'
                : `Price history: ${observations.length} observations, ${formatPrice(range.low)} to ${formatPrice(range.high)}`
            }
          >
            {points.length === 1 ? (
              <circle cx={points[0].x} cy={points[0].y} r={2} fill="currentColor" />
            ) : (
              <polyline
                points={points.map((point) => `${point.x},${point.y}`).join(' ')}
                fill="none"
                stroke="currentColor"
                strokeWidth={1.5}
                vectorEffect="non-scaling-stroke"
              />
            )}
          </svg>

          {/*
            The bounds in words, beside the shape rather than under it. A
            sparkline shows the trend and says nothing about scale — the same
            obligation §7.6's total has to state what it sums.
          */}
          {range !== null && (
            <p data-testid="price-range" className="mt-1 text-xs text-muted-foreground">
              {observations.length} observation{observations.length === 1 ? '' : 's'},{' '}
              <span className="font-mono tabular-nums">{formatPrice(range.low)}</span> to{' '}
              <span className="font-mono tabular-nums">{formatPrice(range.high)}</span>
            </p>
          )}
          {/*
            The observations themselves, which the sparkline could not show.
            "3 observations, $8.00 to $120.00" cannot say whether the $120 was
            last week or three years ago, nor which was new or used.

            Newest first, matching the query — the last thing known about a
            record's worth is the thing being looked for.
          */}
          <ul className="mt-2 space-y-1">
            {observations.map(priceLine).map((line) => (
              <li
                key={line.id}
                data-testid="price-observation"
                className="flex flex-wrap items-baseline gap-x-2 text-xs"
              >
                <time dateTime={line.date} className="font-mono tabular-nums text-muted-foreground">
                  {line.date}
                </time>
                <span className="font-mono tabular-nums">{line.amount}</span>
                {/* The MEANING, not the enum label: "asking" alone does not say
                    nobody paid it, which is the whole point of the type. */}
                <span className="text-muted-foreground">{line.meaning}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div ref={formRef} data-testid="price-form" className="flex flex-wrap items-center gap-2">
        <label htmlFor="price-amount" className="sr-only">
          Price
        </label>
        <Input
          id="price-amount"
          value={price}
          inputMode="decimal"
          placeholder="24.50"
          onChange={(event) => setPrice(event.target.value)}
          className="h-9 w-28 font-mono"
        />

        <label htmlFor="price-type" className="sr-only">
          Price type
        </label>
        <select
          id="price-type"
          value={priceType}
          onChange={(event) => setPriceType(event.target.value)}
          className="h-9 rounded-xs border border-input bg-transparent px-2 text-sm"
        >
          {PRICE_TYPES.map((type) => (
            <option key={type.value} value={type.value}>
              {type.label}
            </option>
          ))}
        </select>

        <Button type="button" disabled={busy} onClick={() => void add()}>
          {busy ? 'Saving…' : 'Add price'}
        </Button>
      </div>

      {/*
        §7.5 stated where it is felt. Without this, the absence of an edit
        control reads as an oversight rather than a rule.
      */}
      <p className="mt-1 text-xs text-muted-foreground">
        Prices are a record of observations — each one is added, never edited.
      </p>

      {error !== undefined && (
        <p role="alert" className="mt-2 text-xs text-destructive">
          {error}
        </p>
      )}
    </section>
  );
}

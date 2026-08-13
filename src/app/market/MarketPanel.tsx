'use client';

import { useCallback, useEffect, useState } from 'react';
import { marketSummary, type MarketView } from '@/app/lookup/market-summary';

/**
 * §10a layers 1–2, on demand, wherever a release id is in hand.
 *
 * **One component for three screens.** §10a: "One fetch, one cache, three
 * placements. Building it per-screen produces three implementations that
 * drift." `/lookup` has its own inline treatment because the control sits among
 * a result card's actions; the want list and record detail share this.
 *
 * The panel says what each figure IS rather than relying on position. On the
 * want list it lands beside `max_price`, so three quantities that all render as
 * money sit together — the user's DECISION, a seller's LISTING, and Discogs'
 * MODEL. §7.2 has kept the first two apart since step 6; this is the screen
 * where the third arrives.
 */
export function MarketPanel({
  discogsReleaseId,
  label,
  autoLoad = false,
}: {
  discogsReleaseId: number | null;
  /** What the reader is asking here — §10a's table gives a different question per screen. */
  label: string;
  /**
   * Record detail loads without asking: the user is looking at one record they
   * already own, which is the single-release case §10a auto-resolves. The want
   * list does not, because it is a list.
   */
  autoLoad?: boolean;
}) {
  const [market, setMarket] = useState<MarketView | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  const load = useCallback(async () => {
    if (discogsReleaseId === null) return;

    setLoading(true);
    setError(undefined);

    try {
      const response = await fetch(`/api/discogs/market/${discogsReleaseId}`);

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setError(body?.error?.message ?? 'Could not reach Discogs for market data.');
        return;
      }

      setMarket(await response.json());
    } catch {
      setError('Could not reach Discogs for market data.');
    } finally {
      setLoading(false);
    }
  }, [discogsReleaseId]);

  // Scheduled off the effect body: `react-hooks` rejects a synchronous setState
  // inside an effect, and `load` sets state on its first line.
  useEffect(() => {
    if (!autoLoad || discogsReleaseId === null) return;

    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [autoLoad, discogsReleaseId, load]);

  /**
   * A record with no Discogs release id cannot be looked up, and saying so is
   * better than a control that fails when pressed. This is absence of a KEY,
   * not absence of market interest.
   */
  if (discogsReleaseId === null) return null;

  return (
    <div className="mt-2" data-testid="market-panel">
      <p className="text-xs tracking-wide text-muted-foreground uppercase">{label}</p>

      {market === null && error === undefined && (
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          data-testid="market-check"
          className="text-xs text-foreground underline underline-offset-2 disabled:text-muted-foreground"
        >
          {loading ? 'Checking Discogs…' : 'Check the market'}
        </button>
      )}

      {market !== null && (
        <p data-testid="market-summary" className="text-sm">
          {marketSummary(market)}
        </p>
      )}

      {error !== undefined && (
        <p role="status" data-testid="market-error" className="text-xs text-muted-foreground">
          {error}
        </p>
      )}
    </div>
  );
}

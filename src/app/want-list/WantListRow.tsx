'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from '@/components/ui/dialog';
import { useRouter } from 'next/navigation';
import {
  BEST_DIG_LABEL,
  MARKET_FLOOR_LABEL,
  MAX_PRICE_LABEL,
  formatCeiling,
  priorityLabel,
  targetPressingSummary,
} from './want-list-format';
import { MarketPanel } from '@/app/market/MarketPanel';

/**
 * One want-list row (SPEC.md §10: "Sorted by priority. Each row shows target
 * pressing and best-dig notes. 'Mark acquired' action opens the record form
 * prefilled").
 *
 * §7.2 governs the two fields that are easy to conflate. They are rendered in
 * SEPARATE blocks with labels that cannot be mistaken for one another — see
 * want-list-format.ts, where the copy is asserted as data.
 */

export type WantListItem = {
  id: string;
  title: string;
  priority: number;
  isAcquired: boolean;
  acquiredRecordId: string | null;
  bestDigNotes: string | null;
  maxPrice: string | null;
  artist: { id: string; name: string };
  label: { id: string; name: string } | null;
  targetPressing: {
    catalogNumber: string | null;
    countryPressed: string | null;
    yearPressed: number | null;
    matrixRunout: string | null;
    // §10a needs a release to ask about. The query already returns the whole
    // pressing row; only this narrowed prop omitted it.
    discogsReleaseId: number | null;
  } | null;
};

export function WantListRow({ item }: { item: WantListItem }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const pressing = targetPressingSummary(item.targetPressing);
  const ceiling = formatCeiling(item.maxPrice);

  async function remove() {
    setDeleting(true);
    try {
      await fetch(`/api/want-list/${item.id}`, { method: 'DELETE' });
      setConfirming(false);
      router.refresh();
    } finally {
      setDeleting(false);
    }
  }

  return (
    <li className="border-b border-border py-3 last:border-0">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <div className="min-w-0">
          <p className="font-medium">{item.title}</p>
          <p className="text-sm text-muted-foreground">
            {item.artist.name}
            {item.label !== null && ` · ${item.label.name}`}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {/* Named, not numbered: §4.2 makes 1 the highest and a bare digit
              cannot tell the reader which end is the top. */}
          <span className="rounded-xs border border-border px-1.5 py-0.5 text-xs text-muted-foreground">
            {priorityLabel(item.priority)}
          </span>

          {item.isAcquired ? (
            <>
              <span className="rounded-xs border border-border bg-accent px-1.5 py-0.5 text-xs">
                Acquired
              </span>
              {item.acquiredRecordId !== null && (
                <Link
                  href={`/records/${item.acquiredRecordId}`}
                  className="text-xs underline underline-offset-2"
                >
                  View record
                </Link>
              )}
            </>
          ) : (
            /**
             * §10: the action opens the record form PREFILLED. Standing in a
             * shop having just bought the thing, this has to be one tap and
             * then a save — not a form to fill in again.
             */
            <Link
              href={`/records/new?wantListId=${item.id}`}
              className="rounded-xs bg-primary px-2 py-1 text-xs text-primary-foreground transition-opacity hover:opacity-90"
            >
              Mark acquired
            </Link>
          )}

          {/*
            **Set apart from the primary action, not hidden.** On a 390px row
            the priority chip, "Mark acquired" and this sat adjacent with Delete
            hard against the right edge — a destructive control under the thumb,
            a few pixels from the one you actually want.

            §7.3 already requires a confirmation naming what is lost, so the
            risk was never an unrecoverable delete; it was the mis-tap, and the
            interruption of confirming something you did not mean to press. The
            separator and the leading margin make it a deliberate reach while
            leaving it exactly as reachable as before — hiding it behind a menu
            would trade a small annoyance for a hunt.
          */}
          <span aria-hidden className="ml-1 hidden h-3 w-px bg-border sm:block" />
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="ml-auto pl-3 text-xs text-muted-foreground underline underline-offset-2 hover:text-destructive sm:ml-1 sm:pl-0"
          >
            Delete
          </button>
        </div>
      </div>

      {/*
        The two §7.2 fields, in SEPARATE blocks with labels that cannot be
        mistaken for each other. "Best dig" is about the pressing to hunt for;
        the ceiling is what the user will pay. CLAUDE.md §8 forbids conflating
        them, and adjacency in one line is how that starts.
      */}
      {pressing !== undefined && (
        <p className="mt-1.5 text-xs">
          <span className="text-muted-foreground">Target pressing: </span>
          <span className="font-mono">{pressing}</span>
        </p>
      )}

      {item.bestDigNotes !== null && item.bestDigNotes !== '' && (
        <p className="mt-1 text-xs">
          <span className="text-muted-foreground">{BEST_DIG_LABEL}: </span>
          {item.bestDigNotes}
        </p>
      )}

      {ceiling !== undefined && (
        <p className="mt-1 text-xs">
          <span className="text-muted-foreground">{MAX_PRICE_LABEL}: </span>
          <span className="font-mono tabular-nums">{ceiling}</span>
        </p>
      )}

      {/*
        §10a beside §7.2's ceiling — and this is where THREE money figures meet:
        what the user will pay, what someone is asking, and what Discogs
        estimates. §7.2 has kept the first two apart since step 6; each now says
        what it is in words rather than relying on position.

        Not auto-loaded: this is a list, and §10a forbids fetching market data
        for a page of rows.
      */}
      <MarketPanel
        discogsReleaseId={item.targetPressing?.discogsReleaseId ?? null}
        label={MARKET_FLOOR_LABEL}
      />

      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent>
          <DialogTitle>Delete “{item.title}”?</DialogTitle>
          {/*
            §7.3 requires the consequence to be legible BEFORE it happens, and
            the consequence differs: deleting an acquired item removes an entry
            from acquisition history while leaving the record itself alone.
          */}
          <DialogDescription>
            {item.isAcquired
              ? 'This removes it from your acquisition history. The record you acquired is not affected — it stays in your collection with its purchase date, price and store.'
              : 'This removes it from your want list, including the best-dig notes and anything you recorded about the pressing to hunt for.'}
          </DialogDescription>
          <DialogFooter>
            <DialogClose render={<Button variant="outline">Cancel</Button>} />
            <Button
              variant="destructive"
              disabled={deleting}
              onClick={() => void remove()}
              data-testid="confirm-delete"
            >
              {deleting ? 'Deleting…' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </li>
  );
}

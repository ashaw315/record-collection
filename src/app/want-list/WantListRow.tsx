'use client';

import Link from 'next/link';
import { useState } from 'react';
import { CONTROL_BOX } from '@/app/records/[id]/grid-type';
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
import { HIT, HIT_ALONE } from '@/app/hit-area';
import { LABEL } from '@/app/records/[id]/grid-type';

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
      {/*
        The want list's pass (step 132): "On a phone the want list's row is a
        title line, an artist line, and one actions line beneath them in a
        fixed order: priority, MARK ACQUIRED, DELETE." Stacked below 640, so
        the row is one shape whether its title is short or long; from 640
        the actions stand at the row's right, as they did.
      */}
      <div className="sm:flex sm:items-baseline sm:justify-between sm:gap-x-3">
        <div className="min-w-0">
          {/*
            Clickable through to the detail view, where `target_pressing` and
            `best_dig_notes` are visible — they live on the row and were
            previously only reachable by editing.
          */}
          <Link
            href={`/want-list/${item.id}`}
            data-testid="want-list-detail-link"
            /*
              Its hit area is its own padding, not `HIT`'s overlay: a title
              takes two lines on a phone, the link is then a box a line, and
              an overlay placed against a link in pieces lands on neither
              (measured at 320: 34 of 44). 13 above and below a line box of 19.5,
              which 12 left half a pixel short. Padding above and below an inline
              link moves no line, and being positioned puts it over the
              type beneath. 9 past its start and 17, half the 34, toward Edit.
              Under a coarse pointer only, as every hit area is (step 127).
            */
            className="relative font-medium underline-offset-2 hover:underline pointer-coarse:-ml-[9px] pointer-coarse:-mr-[17px] pointer-coarse:py-[13px] pointer-coarse:pl-[9px] pointer-coarse:pr-[17px]"
          >
            {item.title}
          </Link>
          {/*
            **Edit belongs on the ROW as well as the detail view** (Adam): a
            route reachable only from a page built yesterday is half the fix.
            The list is where the hunt is managed, and §10 has specified this
            route since step 6 — it was simply never built, which is why no row
            in the collection carries a dig field.
          */}
          <Link
            href={`/want-list/${item.id}/edit`}
            data-testid={`want-list-row-edit-${item.id}`}
            /* Across (step 132): Edit is 19 wide and has 9 past its end, so it needs 17 toward the title to be 44 by the reading: under a coarse pointer the 8 between them grows to 34, half each. */
            className={`${HIT} ml-2 text-label text-muted-foreground underline underline-offset-2 before:-left-[17px] before:-right-[9px] pointer-coarse:ml-[34px]`}
          >
            Edit
          </Link>
          <p data-want-artist="" className="text-detail text-muted-foreground">
            {item.artist.name}
            {item.label !== null && ` · ${item.label.name}`}
          </p>
        </div>

        <div data-want-actions="" className="mt-3 flex shrink-0 items-center gap-[18px] sm:mt-0">
          {/* Named, not numbered: §4.2 makes 1 the highest and a bare digit
              cannot tell the reader which end is the top. A label, with no
              box: nothing listens on it, and "a box means a control by
              §9.3". */}
          <span data-want-priority="" className={LABEL}>
            {priorityLabel(item.priority)}
          </span>

          {item.isAcquired ? (
            <>
              {/* A label as priority is, by the same rule: no box and no fill. */}
              <span data-want-acquired="" className={LABEL}>
                Acquired
              </span>
              {item.acquiredRecordId !== null && (
                <Link
                  href={`/records/${item.acquiredRecordId}`}
                  className={`${HIT_ALONE} text-label underline underline-offset-2`}
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
              /* The overlay is placed from inside the 1px border, so each side is one more than it reaches. */
              className={`${HIT} border border-foreground px-2 py-1 text-label text-foreground before:-left-[10px] before:-right-[10px] hover:underline`}
            >
              Mark acquired
            </Link>
          )}

          {/*
            §7.3 requires a confirmation naming what is lost, so the risk of
            Delete beside the primary action was the mis-tap. It was set
            apart by a | and a margin; the pass: "The | before Delete goes;
            the gap separates."
          */}
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className={`${HIT_ALONE} text-label text-muted-foreground underline underline-offset-2 hover:text-destructive`}
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
        <p className="mt-1.5 text-detail">
          <span className="text-muted-foreground">Target pressing: </span>
          <span className="font-mono">{pressing}</span>
        </p>
      )}

      {item.bestDigNotes !== null && item.bestDigNotes !== '' && (
        /* The pass: "held to two lines, ending in an ellipsis, with its whole text on the item's page." */
        <p className="mt-1 line-clamp-2 text-detail">
          <span className="text-muted-foreground">{BEST_DIG_LABEL}: </span>
          {item.bestDigNotes}
        </p>
      )}

      {ceiling !== undefined && (
        <p className="mt-1 text-detail">
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
            {/* §T.6 part 2 (Design, 14 Oct): "Cancel's grey fill goes, and CANCEL and the verb are §9.3 boxes"; the verb ink, "as §24's Delete record is". */}
            <DialogClose render={<button type="button" className={CONTROL_BOX}>Cancel</button>} />
            <button
              type="button"
              className={`${CONTROL_BOX} disabled:opacity-50`}
              disabled={deleting}
              onClick={() => void remove()}
              data-testid="confirm-delete"
            >
              {deleting ? 'Deleting…' : 'Delete'}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </li>
  );
}

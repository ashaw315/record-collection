'use client';

import { useRouter } from 'next/navigation';
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
import { deleteConsequence, deleteFailureMessage } from './delete-record';

/**
 * Deleting a record (SPEC.md §5.2), with §7.3's confirmation rule applied.
 *
 * §7.3 was written about the want list and the reasoning carries: "the UI must
 * make the consequence legible before it happens — a confirmation naming what
 * is lost, not a bare delete button." A record loses MORE than a want-list
 * entry: images, journal entries and price history cascade (§4.2), and the
 * purchase price, date and store are hand-entered and unrecoverable.
 *
 * The endpoint has existed since step 5 with no way to reach it.
 */
export function DeleteRecord({
  recordId,
  title,
  imageCount,
  journalCount,
}: {
  recordId: string;
  title: string;
  imageCount: number;
  journalCount: number;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  async function remove() {
    setDeleting(true);
    setError(undefined);

    try {
      const response = await fetch(`/api/records/${recordId}`, { method: 'DELETE' });

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setError(deleteFailureMessage(response.status, body?.error?.code));
        // Closed so the message is READABLE — an alert behind a modal is not.
        // The record is still here, which a dialog still open would contradict.
        setConfirming(false);
        return;
      }

      /**
       * `replace`, not `push`: the record no longer exists, so leaving it in
       * history means Back lands on a 404 for something the user deliberately
       * removed. `refresh` because the collection is server-rendered and would
       * otherwise show the deleted row from cache.
       */
      router.replace('/');
      router.refresh();
    } catch {
      setError('Could not reach the server. Nothing was deleted.');
      setConfirming(false);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      {error !== undefined && (
        <p
          role="alert"
          className="mt-3 rounded-xs border border-destructive px-3 py-2 text-sm text-destructive"
        >
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="mt-1 text-xs text-muted-foreground underline underline-offset-2 hover:text-destructive"
      >
        Delete record
      </button>

      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent>
          {/* Named, not "this record" — the reader may have several open. */}
          <DialogTitle>Delete “{title}”?</DialogTitle>
          <DialogDescription>
            {deleteConsequence({ imageCount, journalCount })}
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
    </>
  );
}

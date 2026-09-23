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
import { LABEL } from './grid-type';

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
        /*
          The dialog STAYS open and carries the refusal (§24). It used to close
          and render the alert beside the trigger, so the message was readable
          and not behind a modal — sound while the trigger sat in the page.
          §24 moved the trigger into the nav's actions slot, where a sentence
          in a nowrap chrome row is neither readable nor room it has. The
          dialog is where the question was asked, so the answer goes there:
          "Delete X?" — "No, because…", with Cancel as the way out. The record
          is still here, and the open dialog now says so rather than
          contradicting it.
        */
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
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      {/*
        **Matched to the `Edit` it stands beside.** The two are one pair of
        controls in the chrome row and were set in two vocabularies — Edit mono
        uppercase per §4, this one sans sentence-case. §4's treatment is what
        carries the 11px label role, so the pair takes it; only the destructive
        hover is kept, because that is a claim about the action rather than
        about the type.
      */}
      {/* §24: in the nav's own type — 11px mono uppercase, ink — beside Edit in the actions slot. */}
      <button
        type="button"
        data-control="delete"
        onClick={() => setConfirming(true)}
        className={`${LABEL} underline-offset-2 hover:underline`}
        style={{ color: 'var(--foreground)' }}
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
          {/* The refusal, inside the conversation that asked (§24). */}
          {error !== undefined && (
            <p
              role="alert"
              className="rounded-xs border border-destructive px-3 py-2 text-prose text-destructive"
            >
              {error}
            </p>
          )}
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

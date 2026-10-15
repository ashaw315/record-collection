'use client';

import { useState } from 'react';
import { CONTROL_BOX, CONTROL_LABEL } from '@/app/records/[id]/grid-type';
import {
  evidenceLine,
  groupProposal,
  type Evidence,
  type ProposedPairing,
} from './parent-proposal';

/**
 * SPEC.md §12c (A44) — the proposed hierarchy, confirmed one pairing at a time.
 *
 * **Suggest, never assign.** CLAUDE.md §8 protects this vocabulary specifically,
 * so nothing here writes a parent: each accept is a `PATCH /api/genres/:id` the
 * user chose, and that endpoint already enforces §4.1's cycle rule.
 *
 * **Nine groups, not thirty-two rows.** Measured on the live collection: 32
 * unparented genres produce ~9 parents holding 22 children. Doing this by hand
 * means a dropdown 32 times with no view of the shape — the friction this exists
 * to remove, and a screen that reproduced it row by row would have failed.
 */

type Props = {
  pairings: ProposedPairing[];
  noParentFits: string[];
  evidence: Record<string, Evidence>;
  onAccept: (pairing: ProposedPairing) => Promise<void>;
  onReject: (pairing: ProposedPairing) => Promise<void>;
};

export function ParentProposal({
  pairings,
  noParentFits,
  evidence,
  onAccept,
  onReject,
}: Props) {
  const [settled, setSettled] = useState<Record<string, 'accepted' | 'rejected'>>({});
  /**
   * The row currently being settled — **per row, not global.**
   *
   * A global flag disabled every button while any pairing was in flight, and on
   * a slower project a second click landed while the first was still awaiting
   * and was silently swallowed. **One pairing's decision has nothing to do with
   * another's**, so the guard is scoped to the row it protects.
   */
  const [busy, setBusy] = useState<string | undefined>();

  const groups = groupProposal(pairings, [], evidence);
  const outstanding = pairings.filter((p) => settled[p.genreId] === undefined);

  async function settle(pairing: ProposedPairing, action: 'accepted' | 'rejected') {
    setBusy(pairing.genreId);
    try {
      await (action === 'accepted' ? onAccept(pairing) : onReject(pairing));
      setSettled((prior) => ({ ...prior, [pairing.genreId]: action }));
    } finally {
      setBusy(undefined);
    }
  }

  return (
    <section data-testid="parent-proposal" className="mt-4">
      {/*
        §10b's labelling rule: this must read as GENERATED. The vocabulary is
        the user's and the app is proposing changes to it, so it says whose
        suggestion this is before any of it is read.
      */}
      <p className="text-meta text-muted-foreground">
        Suggested by Claude from your genre names and the records carrying them. Nothing changes
        until you accept a pairing.
      </p>

      {groups.map((group) => (
        <div key={group.parent} className="mt-3">
          <h4 className="text-detail font-medium">{group.parent}</h4>

          <ul className="mt-1 space-y-1">
            {group.children.map((child) => {
              const state = settled[child.genreId];

              return (
                /*
                  Step 149 (§T.6, 14 Oct): "Each proposed genre sets its name on
                  one line with ACCEPT and REJECT at the line's right, and its
                  evidence ... on the next line in the label colour. At 390, as
                  built, the name wrapped beside its evidence." The verbs are
                  §9.3 labels, 24 apart by the grouped-controls rule and with no
                  half-gap overlay.
                */
                <li key={child.genreId} data-testid={`pairing-${child.genreId}`} className="pl-3 text-detail">
                  <div className="flex items-center justify-between gap-6">
                    <span data-genre-name="" className={state === 'rejected' ? 'text-muted-foreground line-through' : ''}>
                      {child.genre}
                    </span>

                    {state === undefined ? (
                      <span className="flex shrink-0 gap-6">
                        <button
                          type="button"
                          data-testid={`accept-${child.genreId}`}
                          disabled={busy === child.genreId}
                          onClick={() => void settle(child, 'accepted')}
                          className={`${CONTROL_LABEL} disabled:opacity-50`}
                        >
                          Accept
                        </button>
                        <button
                          type="button"
                          data-testid={`reject-${child.genreId}`}
                          disabled={busy === child.genreId}
                          onClick={() => void settle(child, 'rejected')}
                          className={`${CONTROL_LABEL} disabled:opacity-50`}
                        >
                          Reject
                        </button>
                      </span>
                    ) : (
                      <span className="text-meta text-muted-foreground">
                        {state === 'accepted' ? 'Accepted' : 'Rejected — will not be suggested again'}
                      </span>
                    )}
                  </div>

                  {/*
                    **The basis, STATED and never RATED.** A count is a fact the
                    user weighs; a grade would be the app judging its own output.
                    `Rock` at ten records across ten unrelated artists is the
                    standing proof that count and quality are different axes —
                    and it is the EXAMPLE that reveals it, which is why the line
                    carries one rather than a number alone.
                  */}
                  <p data-testid={`evidence-${child.genreId}`} className="text-meta text-[oklch(0.44_0.008_70)]">
                    {evidenceLine(child.evidence)}
                  </p>
                </li>
              );
            })}
          </ul>

          {/*
            **Per-GROUP accept**, because the judgement is per group: "is Rock
            the right bucket for these?" is one question, not seven. Per-pairing
            reject stays for the exceptions, which is where the real judgement
            lives — accept most of Rock and stop at one or two.
          */}
          {group.children.some((child) => settled[child.genreId] === undefined) && (
            <button
              type="button"
              data-testid={`accept-group-${group.parent}`}
              disabled={busy !== undefined}
              onClick={async () => {
                for (const child of group.children) {
                  if (settled[child.genreId] === undefined) await settle(child, 'accepted');
                }
              }}
              className={`${CONTROL_LABEL} mt-1 ml-3 disabled:opacity-50`}
            >
              Accept all under {group.parent}
            </button>
          )}
        </div>
      ))}

      {/*
        **"No existing genre fits" is a RESULT, not an absence** (A44). A genre
        listed here is one the model considered and could not place — which is
        different from a genre it did not mention, and collapsing them would tell
        the user nobody looked.
      */}
      {noParentFits.length > 0 && (
        <div data-testid="no-parent-fits" className="mt-4 border-t border-dashed border-border pt-2">
          <h4 className="text-label font-medium text-muted-foreground">
            No existing genre fits as a parent for these
          </h4>
          <p className="mt-1 text-detail">{noParentFits.join(', ')}</p>
          <p className="mt-1 text-meta text-muted-foreground">
            They stay at the top level. Add a genre yourself if one is missing.
          </p>
        </div>
      )}

      {/*
        **Accept-all is deliberate, never default** (§8). A tree accepted by not
        looking is a taxonomy the user did not choose — so it sits at the bottom,
        after the whole proposal has been read, and says how many it will change.
      */}
      {outstanding.length > 0 && (
        <div className="mt-4">
          <button
            type="button"
            data-testid="accept-all"
            disabled={busy !== undefined}
            onClick={async () => {
              for (const pairing of outstanding) await settle(pairing, 'accepted');
            }}
            className={`${CONTROL_BOX} disabled:opacity-50`}
          >
            Accept all {outstanding.length} remaining
          </button>
        </div>
      )}
    </section>
  );
}

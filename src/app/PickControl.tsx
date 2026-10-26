import { CONTROL_LABEL, HAIRLINE } from './records/[id]/grid-type';

/**
 * Target §P.5, Phase 0 (step 156): the pick control with the moods not yet
 * built, so SURPRISE ME and the reserved slot. It is the permanent control
 * and not §P.6's nothing-tagged form: nothing here reads the tags.
 *
 * SURPRISE ME is a §9.3 label, as ADD RECORD is in the rail: §P.5 says "§9.3
 * controls" without saying box or label (held for Design).
 *
 * The slot is §T.6's: there before anything is asked, so a message moves
 * nothing beneath it. It is not clipped, because §P.6 rewrites a message that
 * does not fit rather than cutting it.
 */
export function PickControl({ ruled = false }: {
  /** §P.5: on the table and the grid it stands "after a hairline", which separates it from the filters it sits with. The rail has no rule above it. */
  ruled?: boolean;
}) {
  return (
    <div data-pick-control="">
      {ruled && <hr data-pick-rule="" className={`mb-[18px] border-t ${HAIRLINE}`} />}
      <button type="button" className={CONTROL_LABEL}>
        Surprise me
      </button>
      <p role="status" data-pick-slot="" className="min-h-[1lh] text-prose" />
    </div>
  );
}

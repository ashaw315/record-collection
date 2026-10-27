'use client';

import { useEffect, useState } from 'react';
import { pickFrom } from '@/lib/moods/pick';
import { GridCell } from './GridCell';
import { usePickChannel } from './wall/pick-channel';
import { CONTROL_LABEL, HAIRLINE } from './records/[id]/grid-type';

/** A record the pick can serve, with what §T.5's cell draws. */
export type PickRecord = { id: string; title: string; artist: string; cover: string | null };

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
 *
 * §P.4: in a view that cannot pull, the answer is §T.5's cell beneath the
 * control, and a later answer replaces it in the same place. §P.2: the pool
 * is what the screen shows, and the last-served record is held here, by the
 * page only; the page keys this on its address, so a navigation clears it.
 */
export function PickControl({ ruled = false, pool, answers = 'cell' }: {
  /** §P.5: on the table and the grid it stands "after a hairline", which separates it from the filters it sits with. The rail has no rule above it. */
  ruled?: boolean;
  pool: readonly PickRecord[];
  /**
   * The shelf's rail asks the wall first, through the pick channel: where the
   * reader is on a view that can pull, the answer is the wall's pull (§P.3);
   * on the far view, at any width, the wall says it cannot pull and the
   * answer is the cell (§P.1, §P.4).
   */
  answers?: 'cell' | 'wall';
}) {
  /* §P.2's last-served record. Every answer sets it, and on the shelf so does a record pulled by its spine or the arrows; only an answer in a view that cannot pull draws the cell. */
  const [last, setLast] = useState<string | null>(null);
  const [served, setServed] = useState<PickRecord | null>(null);
  /* §P.4: "Where the answer is the record the cell already shows, the cell does not change and the slot says so." */
  const [again, setAgain] = useState(false);
  const channel = usePickChannel();
  useEffect(
    () =>
      channel?.hearPulls((id) => {
        setLast(id);
        setAgain(false);
      }),
    [channel],
  );
  /* §P.2 (Design, 27 Oct): "An answer already drawn ends with the view it was drawn in, and the new view starts with none." The record stays last-served. */
  useEffect(
    () =>
      channel?.hearViews(() => {
        setServed(null);
        setAgain(false);
      }),
    [channel],
  );

  const ask = () => {
    const id = pickFrom(pool.map((record) => record.id), last, Math.random);
    const did = answers === 'wall' ? (channel?.ask(id) ?? 'ignore') : 'cannot-pull';
    if (did !== 'cannot-pull') {
      /* §P.3: "Where the pick names the record already out, nothing moves", and the slot says so. */
      if (did === 'stay') setAgain(true);
      return;
    }
    /* §P.6: "An ask the pool cannot answer draws nothing." */
    if (id === null) return;
    setAgain(id === served?.id);
    setLast(id);
    setServed(pool.find((record) => record.id === id) ?? null);
  };

  return (
    <div data-pick-control="">
      {ruled && <hr data-pick-rule="" className={`mb-[18px] border-t ${HAIRLINE}`} />}
      <button type="button" className={CONTROL_LABEL} onClick={ask}>
        Surprise me
      </button>
      {/* §P.6's message, "as proposed there" (§P.4). */}
      <p role="status" data-pick-slot="" className="min-h-[1lh] text-prose">
        {again ? 'The only one.' : ''}
      </p>
      {/* §P.4: "drawn at §T.5's 160, the least a cover is, and 24 below the slot." */}
      {served !== null && (
        <div data-pick-answer="" className="relative mt-[24px] w-[160px]">
          <GridCell id={served.id} title={served.title} artist={served.artist} cover={served.cover} />
        </div>
      )}
    </div>
  );
}

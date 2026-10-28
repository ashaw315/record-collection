'use client';

import { useEffect, useId, useState } from 'react';
import { pickFrom } from '@/lib/moods/pick';
import { MOODS } from '@/lib/moods/moods';
import { topTier } from '@/lib/moods/score';
import { GridCell } from './GridCell';
import { usePickChannel, type CellHost, type PickRecord } from './wall/pick-channel';
import { CONTROL_LABEL, HAIRLINE, INK, LABEL_TYPE } from './records/[id]/grid-type';

export type { PickRecord };

/** A §9.3 label on the rail's own line (§P.5): the control label's type and underline, with no 44. */
const RAIL_LABEL = `${LABEL_TYPE} ${INK} decoration-1 underline-offset-[3px] hover:underline`;

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
export function PickControl({ ruled = false, pool, answers = 'cell', inert = [], untagged = 0 }: {
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
  /** §P.6: the moods no tagged record carries, over the whole collection; drawn, unavailable, a Tab stop. */
  inert?: readonly string[];
  /** §P.6: how many records are not yet tagged, over the whole collection; the line is drawn while it is more than none. */
  untagged?: number;
}) {
  /*
    §P.2: "The moods toggle, and a separate ASK asks." Held by the page only:
    the control is keyed on the address, so a navigation clears them, and on
    the shelf keyed without the zoom's place, so a zoom keeps them.
  */
  const [selected, setSelected] = useState<readonly string[]>([]);
  const askInert = selected.length === 0;
  /* §P.6: an inert ASK's reason, as its description, for a reader who cannot see that no mood is in ink. */
  const reasonId = useId();
  const toggle = (m: string) => {
    /* §P.6: an inert mood "cannot be selected". */
    if (inert.includes(m)) return;
    setSelected((current) => (current.includes(m) ? current.filter((x) => x !== m) : [...current, m]));
  };
  /* §P.6: "there is no pull and no cell, and the slot says none of these records carries the moods." Cleared by the next answer, and with the view. */
  const [none, setNone] = useState(false);
  /* §P.2's last-served record. Every answer sets it, and on the shelf so does a record pulled by its spine or the arrows; only an answer in a view that cannot pull draws the cell. */
  const [last, setLast] = useState<string | null>(null);
  const [served, setServed] = useState<PickRecord | null>(null);
  /* §P.4: where the served record's cell stands, from the wall's answer: beneath the control, or in the far view's count column, which the wall draws. */
  const [host, setHost] = useState<CellHost>('here');
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
        setNone(false);
      }),
    [channel],
  );
  /* The column host's cell is the wall's to draw (`P.4/column-cell-drawing-pays`); it follows `served`, so ending the answer ends it there too. */
  useEffect(() => {
    if (answers === 'wall') channel?.showCell(host === 'count-column' ? served : null);
  }, [answers, channel, host, served]);

  /* One answer path for ASK and SURPRISE ME: the candidates differ, the draw, the last-served rule and the hosts do not. */
  const serve = (candidates: readonly string[]) => {
    const id = pickFrom(candidates, last, Math.random);
    setNone(false);
    const answer = answers === 'wall' ? (channel?.ask(id) ?? { did: 'ignore', host: null }) : { did: 'cannot-pull', host: 'here' as const };
    if (answer.did !== 'cannot-pull') {
      /* §P.3: "Where the pick names the record already out, nothing moves", and the slot says so. */
      if (answer.did === 'stay') setAgain(true);
      return;
    }
    /* §P.6: "An ask the pool cannot answer draws nothing." */
    if (id === null) return;
    setAgain(id === served?.id);
    setLast(id);
    setHost(answer.host ?? 'here');
    setServed(pool.find((record) => record.id === id) ?? null);
  };
  /* §P.2: "The ask leans; it does not filter": the tier is the records carrying the most of the selected moods. */
  const ask = () => {
    const tier = topTier(pool, selected);
    /* The selected moods have records somewhere, since an inert mood cannot be selected; none among what the filters and the search leave. */
    if (tier.length === 0) {
      setNone(true);
      return;
    }
    serve(tier);
  };
  /* §P.2: "SURPRISE ME draws from the whole pool, tagged or not, ignoring the moods and leaving them selected". */
  const surprise = () => serve(pool.map((record) => record.id));

  return (
    <div data-pick-control="">
      {ruled && <hr data-pick-rule="" className={`mb-[18px] border-t ${HAIRLINE}`} />}
      {/*
        §P.5: the eight moods from code's list, in its order, toggles "in the
        label type, in the label colour when clear and in ink when selected,
        with no bar, underline or box": a mood wearing a bar or an underline
        would read as a view or a filter (§W.13, §W.32). 44 tall, the floor.
      */}
      {/*
        §P.5 (27 Oct): "In the rail the moods take the rail's own label pitch,
        as §W sets it for SHELF, TABLE and GRID, and not §T.6's 44": a column
        of labels at their type's line, 18 apart, as WallRail's view list is
        (band-rules lays the column as a wrapped row where the rail is a
        band). "On the table and the grid the control stands with the
        filters, and there it takes their 44."
      */}
      <ul data-moods="" aria-label="Moods" className={answers === 'wall' ? 'flex flex-col gap-[18px]' : 'flex flex-wrap gap-x-[18px]'}>
        {MOODS.map((m) => {
          const on = selected.includes(m);
          const off = inert.includes(m);
          /* A list item, as the view names are: in the rail its line is the rail's own, which is what sets the pitch; the label inside is the type's. */
          return (
            <li key={m} className="relative">
              <button
                type="button"
                data-mood={m}
                aria-pressed={on}
                aria-disabled={off || undefined}
                onClick={() => toggle(m)}
                className={`${LABEL_TYPE} ${answers === 'wall' ? '' : 'inline-flex h-[44px] items-center '}${on ? INK : 'text-[oklch(0.44_0.008_70)]'}`}
              >
                {m}
              </button>
            </li>
          );
        })}
      </ul>
      {/*
        §P.6: "While any record is untagged, a line beneath the moods gives how
        many are not yet tagged, and every inert mood reads under it as
        possibly waiting. With every record tagged the line is absent." Drawn
        on load, never in answer to a press, so it moves nothing. 18 above, as
        the rail's lines are: no ruling gives the figure.
      */}
      {untagged > 0 ? (
        <p data-untagged="" className="relative mt-[18px]">
          <span className="text-prose">{untagged} not tagged yet.</span>
        </p>
      ) : null}
      {/*
        §P.5: ASK and SURPRISE ME are §9.3 labels; "ASK is inert while no mood
        is selected." §P.6: "An inert mood stays a Tab stop, and so does ASK
        while it is inert", so the rail's stops are fixed by the control's
        list and not by the tags. `disabled` would leave the tab order;
        `aria-disabled` keeps the stop and names it unavailable.
      */}
      {/*
        §P.5 (27 Oct): "In the rail they take §W's one pitch with the moods,
        so SURPRISE ME on a 44 line is a defect": each on the rail's line, 18
        above, as the view names and the moods are. On the table and the grid
        they are §9.3 labels on the filters' 44.
      */}
      {answers === 'wall' ? (
        <>
          <div className="relative mt-[18px]">
            <button type="button" className={RAIL_LABEL} aria-disabled={askInert} aria-describedby={askInert ? reasonId : undefined} onClick={() => { if (!askInert) ask(); }}>
              Ask
            </button>
          </div>
          <span id={reasonId} className="sr-only">Choose a mood first.</span>
          <div className="relative mt-[18px]">
            <button type="button" className={RAIL_LABEL} onClick={surprise}>
              Surprise me
            </button>
          </div>
        </>
      ) : (
        <>
          <button type="button" className={CONTROL_LABEL} aria-disabled={askInert} aria-describedby={askInert ? reasonId : undefined} onClick={() => { if (!askInert) ask(); }}>
            Ask
          </button>
          <span id={reasonId} className="sr-only">Choose a mood first.</span>
          <button type="button" className={CONTROL_LABEL} onClick={surprise}>
            Surprise me
          </button>
        </>
      )}
      {/* §P.6's message, "as proposed there" (§P.4). */}
      <p role="status" data-pick-slot="" className="min-h-[1lh] text-prose">
        {again ? 'The only one.' : none ? 'None among these.' : ''}
      </p>
      {/* §P.4: "drawn at §T.5's 160, the least a cover is, and 24 below the slot." */}
      {served !== null && host === 'here' && (
        <div data-pick-answer="" className="relative mt-[24px] w-[160px]">
          <GridCell id={served.id} title={served.title} artist={served.artist} cover={served.cover} />
        </div>
      )}
    </div>
  );
}

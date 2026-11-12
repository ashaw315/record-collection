'use client';

import { useEffect, useId, useState } from 'react';
import { askSlotMessage, SLOT_MESSAGES } from '@/lib/ask/slot';
import { drawSurprise } from '@/lib/ask/surprise';
import { GridCell } from './GridCell';
import { usePickChannel, type CellHost, type PickRecord } from './wall/pick-channel';
import { CONTROL_LABEL, HAIRLINE, INK, LABEL, LABEL_TYPE } from './records/[id]/grid-type';

export type { PickRecord };

/** A §9.3 label on the rail's own line (§P.5): the control label's type and underline, with no 44. */
const RAIL_LABEL = `${LABEL_TYPE} decoration-1 underline-offset-[3px] hover:underline`;
/** §P.5's "label colour": an inert ASK is set in it, as an inert mood was. */
const LABEL_COLOUR = 'text-[oklch(0.44_0.008_70)]';
/* §9.3's field, as the rail's SEARCH draws it (WallRail): a hairline underneath, the type's ink, 44 to the floor. */
const FIELD = `mt-[6px] block w-full border-b bg-transparent px-0 h-[44px] font-sans text-[16px] leading-[1.9] ${HAIRLINE} ${INK}`;

/* §P.6's slot messages live in `src/lib/ask/slot.ts`, written to fit the slot at the rail's width (one line). */
const MESSAGES = SLOT_MESSAGES;

type AskAnswer = { answers: Array<{ recordId: string; nearness: number }>; from: 'phrase' | 'title'; askedFrom: string | null; unanswerable: boolean };

/**
 * **Q22's control, step 178 (§P.2, §P.4, §P.5, §P.6 as Design's "Ask field" and "the rest of the moods" rule them,
 * 10 and 11 Nov).** "The control is the ask field, then ASK and SURPRISE ME, then the slot." The reader writes what
 * they want, a phrase for a feeling or an occasion, or a record's title; a separate ASK asks. The moods retire.
 *
 * §P.2: the pool is what the screen shows, every match on every page, handed over as ids; the ask ranks it by how
 * near each ABOUT's stored vector is to the phrase's and answers with the nearest three to five (three on the shelf,
 * where the first is pulled and the rest are context; five elsewhere, where the covers draw: the two proposals, the
 * coordinator, 12 Nov). A re-ask leaves out the last answer's records while enough remain. A title asks from that
 * record. §P.4: on the table, the grid and the far view the answer is the covers in rank order beneath the control;
 * on the shelf it is §W's pull of the first. §P.6: ASK is inert while the field is empty, a Tab stop named unavailable
 * with "write what you want first" as its description, and takes ink once there is text; the line beneath counts the
 * records with no ABOUT; a pool with no ABOUT is unanswerable, and the slot says so.
 *
 * Held by the page only: the control is keyed on the address, so a navigation clears the field and the answer, and on
 * the shelf keyed without the zoom's place, so a zoom keeps them. SURPRISE ME is unchanged: it draws from the whole
 * pool, ABOUT or not, ignoring the field and leaving its text.
 */
export function PickControl({ ruled = false, pool, answers = 'cell', withoutAbout = 0 }: {
  /** §P.5: on the table and the grid it stands "after a hairline", which separates it from the filters it sits with. The rail has no rule above it. */
  ruled?: boolean;
  pool: readonly PickRecord[];
  /**
   * The shelf's rail asks the wall first, through the pick channel: where the
   * reader is on a view that can pull, the answer is the wall's pull (§P.3);
   * on the far view, at any width, the wall says it cannot pull and the
   * answer is the covers beneath the control (§P.1, §P.4).
   */
  answers?: 'cell' | 'wall';
  /** §P.6: how many records have no ABOUT, over the whole collection; the line is drawn while it is more than none. */
  withoutAbout?: number;
}) {
  const [phrase, setPhrase] = useState('');
  const askInert = phrase.trim() === '';
  const reasonId = useId();
  /* A stable id, as the rail's search field has (`rail-search`): the Tab walk names an input by it. One control stands in the shelf's rail and one in the sidebar, so the two never share a document's id. */
  const fieldId = answers === 'wall' ? 'rail-ask' : 'sidebar-ask';
  const [asking, setAsking] = useState(false);
  /* The slot's message: cleared by the next answer, and with the view. */
  const [message, setMessage] = useState('');
  /*
    §P.2's last answer: the records the reader was shown, left out of the next ask while enough remain (the route
    applies the rule), and of SURPRISE ME's draw with the whole pool as the fallback. One form for both since "Ask
    field reconciled" (12 Nov) withdrew the singular last-served record and its tier: nothing singular survives from
    the moods build. On the shelf a record pulled by its spine or the arrows was shown, so it is the last answer too.
  */
  const [lastAnswer, setLastAnswer] = useState<readonly string[]>([]);
  /* §P.4: the covers in rank order, where the host draws them. */
  const [drawn, setDrawn] = useState<readonly PickRecord[]>([]);
  /* §P.4: where the far view's cell stands, from the wall's answer: beneath the control, or in the count column, which the wall draws. */
  const [host, setHost] = useState<CellHost>('here');
  const channel = usePickChannel();
  useEffect(
    () =>
      channel?.hearPulls((id) => {
        setLastAnswer([id]);
      }),
    [channel],
  );
  /* §P.2 (Design, 27 Oct): "An answer already drawn ends with the view it was drawn in, and the new view starts with none." The field's text stays (what the page holds across a zoom, 11 Nov). */
  useEffect(
    () =>
      channel?.hearViews(() => {
        setDrawn([]);
        setMessage('');
      }),
    [channel],
  );
  /* The column host's cell is the wall's to draw (`P.4/column-cell-drawing-pays`): the first answer; it follows `drawn`, so ending the answer ends it there too. */
  useEffect(() => {
    if (answers === 'wall') channel?.showCell(host === 'count-column' ? (drawn[0] ?? null) : null);
  }, [answers, channel, host, drawn]);

  const byId = (id: string) => pool.find((record) => record.id === id);

  /** Where the view can pull, the first answer is pulled; where it cannot, the covers draw beneath the control. */
  const show = (ids: readonly string[]) => {
    const records = ids.map(byId).filter((record): record is PickRecord => record !== undefined);
    const first = records[0];
    if (first === undefined) return;
    const answer = answers === 'wall' ? (channel?.ask(first.id) ?? { did: 'ignore', host: null }) : { did: 'cannot-pull', host: 'here' as const };
    if (answer.did !== 'cannot-pull') {
      /* §P.3: "Where the pick names the record already out, nothing moves", and the slot says so. */
      if (answer.did === 'stay') setMessage(MESSAGES.only);
      return;
    }
    setHost(answer.host ?? 'here');
    setDrawn(records);
  };

  /** ASK: the phrase or a title to the route, the pool as ids, the last answer left out. */
  const ask = async () => {
    if (askInert || asking) return;
    setAsking(true);
    try {
      const response = await fetch('/api/ask', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          phrase,
          pool: pool.map((record) => record.id),
          /* §P.2 (12 Nov): an answer is what is shown; the count is keyed to its form, one where it is a pull (a re-roll pulls the next nearest) and five where it is cells, never to the view's name: the wall says which, and the far view cannot pull. */
          take: answers === 'wall' && channel?.pulls() === true ? 1 : 5,
          ...(lastAnswer.length > 0 ? { exclude: [...lastAnswer] } : {}),
        }),
      });
      const body = (await response.json().catch(() => null)) as (AskAnswer & { error?: { message?: string; code?: string } }) | null;
      if (!response.ok || body === null) {
        /* §P.6 (12 Nov): the slot says so in its own words, never the route's; ASK stays live. */
        setMessage(askSlotMessage({ ok: false, status: response.status, code: body?.error?.code, routeMessage: body?.error?.message }));
        setDrawn([]);
        return;
      }
      const ids = body.answers.map((a) => a.recordId);
      const slot = askSlotMessage({ ok: true, status: response.status, unanswerable: body.unanswerable, answered: ids.length });
      if (slot !== '') {
        setMessage(slot);
        setDrawn([]);
        return;
      }
      setLastAnswer(ids);
      setMessage('');
      show(ids);
    } finally {
      setAsking(false);
    }
  };

  /* §P.2: "SURPRISE ME draws from the whole pool, with an ABOUT or not, ignoring the ask field and leaving its text", the last answer's records left out while another remains. */
  const surprise = () => {
    const id = drawSurprise(pool.map((record) => record.id), lastAnswer, Math.random);
    /* §P.6: "An ask the pool cannot answer draws nothing." */
    if (id === null) return;
    setMessage('');
    if (drawn.length === 1 && drawn[0]?.id === id) setMessage(MESSAGES.only);
    setLastAnswer([id]);
    show([id]);
  };

  const inRail = answers === 'wall';
  const buttonClass = (inert: boolean) => `${inRail ? RAIL_LABEL : CONTROL_LABEL} ${inert ? LABEL_COLOUR : INK}`;

  return (
    <div data-pick-control="">
      {ruled && <hr data-pick-rule="" className={`mb-[18px] border-t ${HAIRLINE}`} />}
      {/* §P.5: the ask field, "as §9.3's field, separate from SEARCH": its own label and field, part of no form. */}
      <div data-ask-host="" className="relative w-full">
        {/* §P.5 (Design, 12 Nov; step 182): "The ask field’s label says what goes in it, never ASK, which is the button’s name." WHAT TO PLAY, Proposed. */}
        <label htmlFor={fieldId} className={`block ${LABEL}`}>
          What to play
        </label>
        <input
          id={fieldId}
          data-ask-field=""
          type="text"
          autoComplete="off"
          value={phrase}
          onChange={(event) => setPhrase(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              void ask();
            }
          }}
          className={FIELD}
        />
      </div>
      {/*
        §P.6 (11 Nov): "the line counting records with no ABOUT, absent when every record has one." Drawn on load,
        never in answer to a press, so it moves nothing. 18 above, as the rail's lines are.
      */}
      {withoutAbout > 0 ? (
        <p data-without-about="" className="relative mt-[18px]">
          {/* "N have no About.", Proposed (Design, 12 Nov; step 182): the first wording took two lines at the rail's width. */}
          <span className="text-prose">{withoutAbout} have no About.</span>
        </p>
      ) : null}
      {/*
        §P.5: ASK and SURPRISE ME are §9.3 labels. §P.6: "ASK is inert while the field is empty; it stays a Tab stop,
        named unavailable, and takes ink once the field holds text." `disabled` would leave the tab order;
        `aria-disabled` keeps the stop and names it unavailable. In the rail they take §W's one pitch; on the table and
        the grid they are labels on the filters' 44.
      */}
      {inRail ? (
        <>
          <div className="relative mt-[18px]">
            <button type="button" className={buttonClass(askInert)} aria-disabled={askInert} aria-describedby={askInert ? reasonId : undefined} onClick={() => void ask()}>
              Ask
            </button>
          </div>
          <span id={reasonId} className="sr-only">write what you want first</span>
          <div className="relative mt-[18px]">
            <button type="button" className={buttonClass(false)} onClick={surprise}>
              Surprise me
            </button>
          </div>
        </>
      ) : (
        /* §P.5 (Design's defect 2, 12 Nov): the sidebar separates ASK and SURPRISE ME by the band host's 18, where they read "ASKSURPRISE ME" before. */
        <div data-pick-buttons="" className="flex flex-wrap items-center gap-x-[18px]">
          <button type="button" className={buttonClass(askInert)} aria-disabled={askInert} aria-describedby={askInert ? reasonId : undefined} onClick={() => void ask()}>
            Ask
          </button>
          <span id={reasonId} className="sr-only">write what you want first</span>
          <button type="button" className={buttonClass(false)} onClick={surprise}>
            Surprise me
          </button>
        </div>
      )}
      {/* §P.6's message, "as proposed there" (§P.4). */}
      <p role="status" data-pick-slot="" className="min-h-[1lh] text-prose">
        {message}
      </p>
      {/*
        §P.4: "the covers in rank order beneath the control", each at §T.5's 160, the least a cover is, 24 below the
        slot. A column where the control draws as a column (the sidebar; the far view's rail column draws the first in
        the count column instead), a wrapped row where it draws as a band (band-rules, sidebar-layout): the second
        proposal, the coordinator, 12 Nov.
      */}
      {drawn.length > 0 && host === 'here' && (
        <>
          <ul data-pick-answers="" className="relative mt-[24px] flex flex-col gap-[18px]">
            {drawn.map((record, index) => (
              <li key={record.id} data-pick-answer="" data-rank={index + 1} className="w-[160px]">
                <GridCell id={record.id} title={record.title} artist={record.artist} cover={record.cover} />
              </li>
            ))}
          </ul>
          {/* §P.4 (12 Nov): "where the answer stands above the list, as at 390, it ends with the hairline that closes the control"; the sidebar's stylesheet draws it below the fork and not above, where the list stands beside the control. */}
          {!inRail && <hr data-pick-close-rule="" className={`mt-[24px] hidden border-t ${HAIRLINE}`} />}
        </>
      )}
    </div>
  );
}

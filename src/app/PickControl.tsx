'use client';

import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { askSlotMessage, SLOT_MESSAGES, type AskVerdict } from '@/lib/ask/slot';
import { drawSurprise } from '@/lib/ask/surprise';
import { pressInFlight } from '@/lib/ask/in-flight';
import { PickWorking } from './PickWorking';
import { onSheetSaved } from './ask/sheet-store';
import { GridCell } from './GridCell';
import { usePickChannel, type CellHost, type PickRecord } from './wall/pick-channel';
import { CONTROL_LABEL, HAIRLINE, INK, LABEL, LABEL_TYPE } from './records/[id]/grid-type';

export type { PickRecord };

/** A §9.3 label on the rail's own line (§P.5): the control label's type and underline, with no 44. */
const RAIL_LABEL = `${LABEL_TYPE} decoration-1 underline-offset-[3px] hover:underline`;
/** §P.5's "label colour": an inert ASK is set in it, as an inert mood was. */
const LABEL_COLOUR = 'text-[oklch(0.44_0.008_70)]';
/*
  §9.3's field, as the rail's SEARCH draws it (WallRail): a hairline underneath, the type's ink, 44 to the floor. A
  textarea since "Ask field wraps and count line" (13 Nov): its one line of 30.4 (16 at 1.9) sits centred in the 44 as
  the input's did, by 6.8 above and below, and each further line adds 30.4. No resize handle and no cap.
*/
const FIELD = `mt-[6px] block w-full resize-none overflow-hidden border-b bg-transparent px-0 py-[6.8px] min-h-[44px] font-sans text-[16px] leading-[1.9] ${HAIRLINE} ${INK}`;

/** The field's height is its phrase's lines (§P.5): set from its own scroll height, the border added back under border-box. */
function fitToPhrase(el: HTMLTextAreaElement) {
  el.style.height = 'auto';
  el.style.height = `${el.scrollHeight + (el.offsetHeight - el.clientHeight)}px`;
}

/* §P.6's slot messages live in `src/lib/ask/slot.ts`, written to fit the slot at the rail's width (one line). */
const MESSAGES = SLOT_MESSAGES;
/* §P.3's words threshold, Proposed at five seconds ("Indicator any length", 23 Nov), for Adam to judge on his phone. */
const WORDS_AFTER_MS = 5_000;

/** What the control shows for one answer: the record, the pick's reason (null where there is none), and whether it is a consolation beside a nothing-fits message (§P.2). */
/* §67 (24 Nov): each answer carries the whole stored sentences its reason rests on, so the sheet opens on one of them. */
type Answer = { id: string; reason: string | null; consolation?: boolean; claims?: readonly string[] };

type AskAnswer = {
  mode?: 'ranking' | 'pick';
  verdict?: AskVerdict | null;
  /* §P.2 (unit 3a): each answer carries the model's reason; the ranking's answers carry none. */
  answers: Array<{ recordId: string; reason?: string; claims?: string[] }>;
  from: 'phrase' | 'title';
  askedFrom: string | null;
  undescribed?: string | null;
  unanswerable: boolean;
};

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
  /*
    §P.5: "one line at rest when empty, and its phrase’s lines when not." Fitted as the phrase changes, which only the
    reader's writing does (§P.4: "ASK moves under a reader writing, never between two presses"), and as the host's
    width changes, which rewraps the same phrase. CSS's field-sizing would do this alone, but the mobile project runs
    WebKit, so the fit is the script's.
  */
  const fieldRef = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    if (fieldRef.current !== null) fitToPhrase(fieldRef.current);
  }, [phrase]);
  useEffect(() => {
    const el = fieldRef.current;
    if (el === null || typeof ResizeObserver === 'undefined') return;
    let width = el.clientWidth;
    const observer = new ResizeObserver(() => {
      if (el.clientWidth === width) return;
      width = el.clientWidth;
      fitToPhrase(el);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const reasonId = useId();
  /* A stable id, as the rail's search field has (`rail-search`): the Tab walk names an input by it. One control stands in the shelf's rail and one in the sidebar, so the two never share a document's id. */
  const fieldId = answers === 'wall' ? 'rail-ask' : 'sidebar-ask';
  const [asking, setAsking] = useState(false);
  /* The phrase the ask in flight was made with: a press with the same phrase is ignored, a changed one lets it go (§P.3, 22 Nov). */
  const askingPhrase = useRef('');
  /*
    §P.3's indicator words ("Indicator any length", 23 Nov): at five seconds into a wait, Proposed, timed here so a test's
    clock can move it; under reduced motion the motion is still and the words are drawn from the press.
  */
  const [slow, setSlow] = useState(false);
  /* Read when the control mounts on the client; the words are never drawn on the server, so the first render cannot disagree. */
  const [reduced, setReduced] = useState(() => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const change = () => setReduced(query.matches);
    query.addEventListener('change', change);
    return () => query.removeEventListener('change', change);
  }, []);
  useEffect(() => {
    if (!asking) return;
    const timer = window.setTimeout(() => setSlow(true), WORDS_AFTER_MS);
    return () => window.clearTimeout(timer);
  }, [asking]);
  /* The slot's message: cleared by the next answer, and with the view. */
  const [message, setMessage] = useState('');
  /*
    §P.2's run (Design's "a run leaves out its history"; the coordinator, 14 Nov): asks with one phrase, and every
    record the run has DISPLAYED, by ASK, SURPRISE ME or a spine or arrow pull, left out of each ask while enough
    others remain (the route applies the rule) and out of SURPRISE ME's draw. A record joins when it is shown, never
    when it is returned, so a queued record the reader never saw is never left out. The set clears when the phrase
    changes, on a navigation (the control is keyed on the address), and when the run starts again.
  */
  const [shown, setShown] = useState<readonly string[]>([]);
  /* In the order last shown: a record served again moves to the end, so the set's last is the record just served, which SURPRISE ME's fallback leaves out. */
  const named = (ids: readonly string[]) => setShown((prev) => [...prev.filter((id) => !ids.includes(id)), ...ids]);
  /* The phrase the run is asking with; a different phrase at ASK starts a new run. */
  const runPhrase = useRef<string | null>(null);
  /* The model pick's answer walked on the shelf: one record per press, with no request, until it is spent. */
  const [queue, setQueue] = useState<readonly Answer[]>([]);
  /* Each request's number: a reply whose number is not the latest belongs to a phrase or run since changed, and is ignored on arrival. */
  const request = useRef(0);
  /* §P.4: the covers in rank order, where the host draws them. */
  const [drawn, setDrawn] = useState<readonly PickRecord[]>([]);
  /* §P.4: where the far view's cell stands, from the wall's answer: beneath the control, or in the count column, which the wall draws. */
  const [host, setHost] = useState<CellHost>('here');
  const channel = usePickChannel();
  /* §67: the shelf's queue is discarded on a save, since a queued record was chosen on the text before the correction. */
  useEffect(() => onSheetSaved(() => setQueue([])), []);
  useEffect(
    () =>
      channel?.hearPulls((id) => {
        named([id]);
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
  /* The column host's cells are the wall's to draw (`P.4/column-cell-drawing-pays`; five, two across, since 3b): the whole answer in rank order; it follows `drawn`, so ending the answer ends them there too. */
  useEffect(() => {
    if (answers === 'wall') channel?.showCells(host === 'count-column' ? drawn : []);
  }, [answers, channel, host, drawn]);

  const byId = (id: string) => pool.find((record) => record.id === id);

  /** Where the view can pull, the first answer is pulled; where it cannot, the covers draw beneath the control, each with its reason (§P.2). */
  const show = (answersToShow: readonly Answer[]) => {
    const records: PickRecord[] = [];
    for (const a of answersToShow) {
      const record = byId(a.id);
      if (record !== undefined) records.push({ ...record, reason: a.reason, consolation: a.consolation === true, claims: a.claims ?? [] });
    }
    const first = records[0];
    if (first === undefined) return;
    const answer = answers === 'wall' ? (channel?.ask(first.id, { reason: first.reason ?? null, consolation: first.consolation === true, claims: first.claims ?? [] }) ?? { did: 'ignore', host: null }) : { did: 'cannot-pull', host: 'here' as const };
    if (answer.did !== 'cannot-pull') {
      /* §P.3: "Where the pick names the record already out, nothing moves", and the slot says so. */
      if (answer.did === 'stay') setMessage(MESSAGES.only);
      return;
    }
    setHost(answer.host ?? 'here');
    setDrawn(records);
    /* What was displayed joins the run: the cells here, and on a pull the record the wall tells of when it comes out (`hearPulls`). A draw the wall ignored or let stay changes nothing (pick-pull-156, 12 Nov). */
    named(records.map((record) => record.id));
  };

  /** ASK: the phrase or a title to the route, the pool as ids, the run's shown records left out. */
  const ask = async () => {
    if (askInert) return;
    /* §P.3 (22 Nov): the same phrase in flight is ignored; a changed phrase lets the ask in flight go and asks again, the old reply never drawn since its number is no longer the latest. */
    if (pressInFlight(asking ? { phrase: askingPhrase.current } : null, { kind: 'ask', phrase }) === 'ignore') return;
    const asked = phrase.trim();
    let exclude = shown;
    if (runPhrase.current !== asked) {
      runPhrase.current = asked;
      exclude = [];
      setShown([]);
      setQueue([]);
    } else if (queue.length > 0) {
      const [next, ...rest] = queue;
      setQueue(rest);
      setMessage('');
      show([next]);
      return;
    }
    const mine = (request.current += 1);
    askingPhrase.current = asked;
    setSlow(false);
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
          ...(exclude.length > 0 ? { exclude: [...exclude] } : {}),
        }),
      });
      const body = (await response.json().catch(() => null)) as (AskAnswer & { error?: { message?: string; code?: string } }) | null;
      /* A reply to a phrase or run since changed answers a question that no longer exists. */
      if (mine !== request.current) return;
      if (!response.ok || body === null) {
        /* §P.6 (12 Nov): the slot says so in its own words, never the route's; ASK stays live. */
        setMessage(askSlotMessage({ ok: false, status: response.status, code: body?.error?.code, routeMessage: body?.error?.message }));
        setDrawn([]);
        return;
      }
      const answered: Answer[] = body.answers.map((a) => ({ id: a.recordId, reason: a.reason ?? null, claims: a.claims ?? [] }));
      const ids = answered.map((a) => a.id);
      const undescribedTitle = body.undescribed ? byId(body.undescribed)?.title : undefined;
      const slot = askSlotMessage({ ok: true, status: response.status, unanswerable: body.unanswerable, answered: ids.length, verdict: body.verdict ?? null, undescribedTitle });
      /* The run's end: it names none, and the ask after it starts the run again (§P.2). */
      if (body.verdict === 'run-exhausted') setShown([]);
      /*
        §P.2: nothing fits, and a requirement unmet, are the slot's message, each in its own words since Design's "Slot
        for unmet and dropped reason" (19 Nov; 3a had drawn the same words for both). A record beside it is a
        consolation, drawn where the pick gave one and never required, labelled the closest available so it never
        reads as an answer: a cell where the answer is cells, the pull where it is a pull, its reason saying what it is
        not.
      */
      if (body.verdict !== undefined && body.verdict !== null && body.verdict !== 'answer') {
        setMessage(slot);
        const standIn = answered[0];
        if (body.verdict === 'run-exhausted' || standIn === undefined) {
          setDrawn([]);
          return;
        }
        show([{ ...standIn, consolation: true }]);
        return;
      }
      if (ids.length === 0) {
        setMessage(slot);
        setDrawn([]);
        return;
      }
      setMessage(slot);
      /* The model pick's answer on the shelf: the first pulled, the rest walked one per press, a record joining the run when it is pulled. */
      if (body.mode === 'pick' && answers === 'wall' && channel?.pulls() === true) {
        setQueue(answered.slice(1));
        show(answered.slice(0, 1));
        return;
      }
      show(answered);
    } finally {
      /* Only the ask still current ends the indicator: a reply let go must not clear the wait of the ask that replaced it. */
      if (mine === request.current) setAsking(false);
    }
  };

  /* §P.2: "SURPRISE ME draws from the whole pool, with an ABOUT or not, ignoring the ask field and leaving its text", the last answer's records left out while another remains. */
  const surprise = () => {
    const id = drawSurprise(pool.map((record) => record.id), shown, Math.random);
    /* §P.6: "An ask the pool cannot answer draws nothing." */
    if (id === null) return;
    /* §P.3 (22 Nov): SURPRISE ME in flight lets the ask go and answers at once; the reply, when it comes, is never drawn. */
    if (asking) {
      request.current += 1;
      setAsking(false);
    }
    setMessage('');
    if (drawn.length === 1 && drawn[0]?.id === id) setMessage(MESSAGES.only);
    /* A draw by chance has no reason (§P.2: SURPRISE ME ignores the ask field). */
    show([{ id, reason: null }]);
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
        <textarea
          ref={fieldRef}
          id={fieldId}
          data-ask-field=""
          rows={1}
          autoComplete="off"
          value={phrase}
          /* A phrase is one line of thought, wrapped: a pasted line break reads as a space, and Enter asks below. */
          onChange={(event) => {
            const next = event.target.value.replace(/\r?\n/g, ' ');
            setPhrase(next);
            /*
              A different phrase ends the run's queue. It no longer lets an ask in flight go: since "Ask in flight presses
              and field" (22 Nov) only ASK with a changed phrase or SURPRISE ME does, and typing is honoured for the next
              press. 2b's interim rule (14 Nov) ignored the reply on any edit, which with the indicator would have left the
              slot working for an ask nothing could end.
            */
            if (next.trim() !== runPhrase.current) setQueue([]);
          }}
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
        {/* §P.3: the slot says the pick is working for the length of the call, and the drawn answer stays until replaced. */}
        {asking ? <PickWorking words={slow || reduced} /> : message}
      </p>
      {/*
        §P.4: "the covers in rank order beneath the control", each at §T.5's 160, the least a cover is, 24 below the
        slot. A column where the control draws as a column (the sidebar; the far view's rail column draws the first in
        the count column instead), a wrapped row where it draws as a band (band-rules, sidebar-layout): the second
        proposal, the coordinator, 12 Nov.
      */}
      {/*
        §P.6 (11 Nov): "the line counting records with no ABOUT, absent when every record has one." Drawn on load,
        never in answer to a press, so it moves nothing. 18 above, as the rail's lines are. "The count line stands
        beneath the slot" ("Ask field wraps and count line", 13 Nov; it stood between the field and ASK). It stands
        before the answers: 3a's list was inserted between the slot and this line, on a note here that read the two's
        order as Design's open question, and the line landed beneath the last cell in every band and sidebar host
        (ask-fold, 19 Nov). §P.6 stands the line beneath the slot and §P.4 the answers 24 below the line (the
        coordinator, 19 Nov).
      */}
      {withoutAbout > 0 ? (
        <p data-without-about="" className="relative mt-[18px]">
          {/* "N not described.", Proposed ("Matched by role and count line", 14 Nov): the line counts records with no text to be matched by, by mode. */}
          <span className="text-prose">{withoutAbout} not described.</span>
        </p>
      ) : null}
      {drawn.length > 0 && host === 'here' && (
        <ul data-pick-answers="" className="relative mt-[24px] flex flex-col gap-[18px]">
          {drawn.map((record, index) => (
            <li key={record.id} data-pick-answer="" data-rank={index + 1} className="w-[160px]">
              <GridCell id={record.id} title={record.title} artist={record.artist} cover={record.cover} reason={record.reason ?? null} claims={record.claims ?? []} consolation={record.consolation === true} />
            </li>
          ))}
        </ul>
      )}
      {/* §P.4 (12 Nov): "where the answer stands above the list, as at 390, it ends with the hairline that closes the control"; the sidebar's stylesheet draws it below the fork and not above, where the list stands beside the control. */}
      {drawn.length > 0 && host === 'here' && !inRail && <hr data-pick-close-rule="" className={`mt-[24px] hidden border-t ${HAIRLINE}`} />}
    </div>
  );
}

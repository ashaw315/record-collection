'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { holdScroll } from '@/components/scroll-hold';
import { NAV_TYPE } from '@/components/nav-type';
import { LABEL } from './grid-type';
import { PlainBackImprint } from '@/app/wall/PlainBackImprint';
import { TURN_MS, turnDistance, turnPose, type TurnPose } from './sleeve-turn';
import { OPEN_MS, easeOutCubic, openDistance, openPose, spreadSquare } from './sleeve-open';
import { FADE_MS, TRAVEL_MS, travelBox, travelPhoto, type Square } from './sleeve-travel';
import type { CoverTreatment } from './cover-fit';
import { MODAL_CONTROL, MODAL_CONTROL_GAP, MODAL_LABEL_GAP, MODAL_LABEL_LINE, MODAL_ROW, SETTLE_MS, sleeveSquare, type SleeveFace } from './sleeve-modal';

/**
 * The record modal's view (§M.1): "a view of the object, not a dialog over
 * the page. It covers the whole viewport on opaque paper, with no dimming,
 * shadow or rounded panel... Its top row is 53, like the header's, with a
 * hairline below it and CLOSE at the right on the 18 inset."
 *
 * A dialog to assistive technology all the same: it takes the keyboard and
 * hides the page, and that is what the role says. Drawn in a portal on the
 * body, because the cover's cell is a size container with its overflow
 * hidden, and a view placed inside it is at the mercy of both.
 *
 * `onClose` is asked for; it does not close the view itself. Its owner
 * steps back through the history entry it added, and the entry going is
 * what closes it, so Back, CLOSE and Escape are one path.
 */
/**
 * §M.6: "44 tall, a 1px ink box, no fill, no radius, border-box, with an
 * 11px mono uppercase ink label." Hover: "the label takes a 1px ink
 * underline, 3 below its baseline, and nothing else changes." Keyboard
 * focus: "a 2px ink outline, offset 2 outside the box, on keyboard focus
 * only." The label is the header's own type, as the top row's CLOSE is.
 */
const CONTROL = `${NAV_TYPE} box-border flex h-[44px] shrink-0 cursor-pointer items-center justify-center border border-foreground font-normal text-foreground decoration-1 underline-offset-[3px] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground`;

/** The closed square, a leaf of the open spread, and the paper between the top row and the closed sleeve, for the window as it is now. */
function measureSleeve(): { side: number; leaf: number; room: number } {
  const side = sleeveSquare(window.innerWidth, window.innerHeight);
  return {
    side,
    leaf: spreadSquare(window.innerWidth, window.innerHeight),
    room: (window.innerHeight - MODAL_ROW - (side + MODAL_LABEL_GAP + MODAL_LABEL_LINE + MODAL_LABEL_GAP + MODAL_CONTROL)) / 2,
  };
}

const FACE_NAME: Record<SleeveFace | 'inside', string> = { front: 'Front', back: 'Back', inside: 'Inside' };

export function SleeveModal({
  onClose,
  front,
  back,
  inside,
  plain,
  origin,
  natural,
  pageTreatment,
  closing,
  onClosed,
}: {
  onClose: () => void;
  front: string;
  back: string | null;
  /** §M.6: "The gatefold opens only when both inside photos exist." Null where either leaf is missing. */
  inside: { left: string; right: string } | null;
  /** §M.3: the back where there is no back photograph: the record's field, and the imprint the wall draws on it. */
  plain: { ground: string; labelName: string | null; catalogNumber: string | null };
  /** §M.7: the page's cover, for the travel: where its square is now, the photograph's own size, and how the page draws it. */
  origin: () => Square | null;
  natural: { width: number; height: number };
  pageTreatment: CoverTreatment;
  /** True once the modal's history entry has gone: the modal is closing, whatever state it is in. */
  closing: boolean;
  /** Called when the return has landed and the modal can be removed. */
  onClosed: () => void;
}) {
  const view = useRef<HTMLDivElement>(null);
  /*
    §M.4 (step 93): the sizes are measured when the modal opens, "at the
    press, before the cover travels", and again "once the viewport settles"
    after a rotation or a resize. One measurement of the three that go
    together: the closed square, a leaf of the spread, and the paper above
    the sleeve (step 91).
  */
  const [{ side, leaf, room }, setSizes] = useState(measureSleeve);
  const [face, setFace] = useState<SleeveFace>('front');
  /*
    §M.5: the turn. While it runs, `turn` holds the pose of this frame; the
    browser projects the one rotation it names, so the face turns and no
    corner is interpolated. At rest there is no turn, no transform and no
    perspective: "every face is flat and face-on at rest."
  */
  const [turn, setTurn] = useState<{ from: SleeveFace; to: SleeveFace; pose: TurnPose } | null>(null);
  const frame = useRef(0);
  const turning = useRef(false);
  /* What the motion under way ends as, so a settled viewport can cut it there (step 93); null at rest. */
  const endMotion = useRef<(() => void) | null>(null);
  useEffect(() => () => cancelAnimationFrame(frame.current), []);
  const turnOver = useCallback(() => {
    /* A press while it turns is not a second turn. */
    if (turning.current) return;
    const from = face;
    const to: SleeveFace = from === 'front' ? 'back' : 'front';
    /* "Under the reduced-motion setting, the turn... become[s] an immediate change of face, with no rotation and no fade." */
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setFace(to);
      return;
    }
    turning.current = true;
    const land = () => {
      turning.current = false;
      endMotion.current = null;
      setFace(to);
      setTurn(null);
    };
    endMotion.current = land;
    const started = performance.now();
    const step = (now: number) => {
      const progress = (now - started) / TURN_MS;
      if (progress >= 1) {
        land();
        return;
      }
      setTurn({ from, to, pose: turnPose(progress) });
      frame.current = requestAnimationFrame(step);
    };
    setTurn({ from, to, pose: turnPose(0) });
    frame.current = requestAnimationFrame(step);
  }, [face]);
  /*
    §M.4 and §M.5: the gatefold's opening. `spread` is null while the sleeve
    is closed; otherwise it holds the eased value of this frame, 0 closed to
    1 open, and whether it is moving. The move, the scale and the rotation
    all read that one value (`openPose`), "so they read as one motion".
    Folding runs the same curve back. The spread's square is taken with the
    closed one, when the modal opens.
  */
  const [spread, setSpread] = useState<{ e: number; moving: boolean; target: 'open' | 'closed' } | null>(null);
  const openOrFold = useCallback((target: 'open' | 'closed') => {
    /* §M.5: a press that would start another motion is ignored while one is under way. */
    if (turning.current) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      /* "The opened spread appears at once, centred and at its own size." */
      setSpread(target === 'open' ? { e: 1, moving: false, target } : null);
      return;
    }
    turning.current = true;
    const land = () => {
      turning.current = false;
      endMotion.current = null;
      setSpread(target === 'open' ? { e: 1, moving: false, target } : null);
    };
    endMotion.current = land;
    const started = performance.now();
    const step = (now: number) => {
      const progress = (now - started) / OPEN_MS;
      if (progress >= 1) {
        land();
        return;
      }
      const eased = easeOutCubic(progress);
      setSpread({ e: target === 'open' ? eased : 1 - eased, moving: true, target });
      frame.current = requestAnimationFrame(step);
    };
    setSpread({ e: target === 'open' ? 0 : 1, moving: true, target });
    frame.current = requestAnimationFrame(step);
  }, []);
  /*
    The control row changes with the state it leads to: FOLD once the
    opening starts, TURN OVER and OPEN once the folding does. The control
    pressed has then gone, so focus goes to the one that undoes it, which is
    in the row the reader's focus was in (§M.5: focus stays with the control).
  */
  const showsFold = spread !== null && spread.target === 'open';
  const foldControl = useRef<HTMLButtonElement>(null);
  const openControl = useRef<HTMLButtonElement>(null);
  const wasFold = useRef(false);
  useEffect(() => {
    if (showsFold !== wasFold.current) (showsFold ? foldControl : openControl).current?.focus();
    wasFold.current = showsFold;
  }, [showsFold]);
  /*
    §M.7: the cover's travel. "The modal does not appear: the cover the
    reader pressed travels from its square on the record page to the modal's
    square." `travel` holds this frame's progress through the travel and
    which way it is going; null is the modal at rest. The eased value drives
    the travelling square, the photograph's crop, the paper and the top row
    together. Closing runs the same progress back, from wherever it is, so
    "closing plays the travel in reverse" and a close mid-travel "reverses
    from wherever the cover is" without a separate case.
  */
  const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const [travel, setTravel] = useState<{ p: number; dir: 'in' | 'out'; page: Square } | null>(() => {
    const page = reducedMotion() ? null : origin();
    return page === null ? null : { p: 0, dir: 'in', page };
  });
  /* "The face label and the controls arrive after the cover lands, with a short fade that starts at landing." */
  const [chrome, setChrome] = useState(() => travel === null);
  const progress = useRef(travel === null ? 1 : 0);
  const landed = useRef(travel === null);
  const travelFrame = useRef(0);
  const endTravel = useRef<(() => void) | null>(null);
  useEffect(() => {
    if (landed.current) return;
    const arrive = () => {
      landed.current = true;
      progress.current = 1;
      endTravel.current = null;
      setTravel(null);
      setChrome(true);
    };
    endTravel.current = arrive;
    const started = performance.now();
    const step = (now: number) => {
      const p = Math.min(1, (now - started) / TRAVEL_MS);
      progress.current = p;
      if (p >= 1) {
        arrive();
        return;
      }
      setTravel((was) => (was === null ? was : { ...was, p }));
      travelFrame.current = requestAnimationFrame(step);
    };
    travelFrame.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(travelFrame.current);
  }, []);
  /*
    "A close is honoured from any state, at any moment... The sleeve cuts at
    once to its folded front, from wherever a turn or the gatefold's opening
    has reached, and then travels home." The label and controls go first;
    the square the cover returns to "is still measured at close".
  */
  useEffect(() => {
    if (!closing) return;
    cancelAnimationFrame(frame.current);
    cancelAnimationFrame(travelFrame.current);
    /* No motion starts once it is closing, and the ones under way are stopped; what is drawn is cut to the folded front below, from `closing` itself. */
    turning.current = true;
    let timer = 0;
    const leave = () => {
      const page = reducedMotion() ? null : origin();
      if (page === null) {
        onClosed();
        return;
      }
      const from = landed.current ? 1 : progress.current;
      const started = performance.now();
      const step = (now: number) => {
        const p = Math.max(0, from - (now - started) / TRAVEL_MS);
        progress.current = p;
        if (p <= 0) {
          onClosed();
          return;
        }
        setTravel({ p, dir: 'out', page });
        travelFrame.current = requestAnimationFrame(step);
      };
      landed.current = false;
      setTravel({ p: from, dir: 'out', page });
      travelFrame.current = requestAnimationFrame(step);
    };
    /* Landed, the label and controls fade first (they read `closing`); still travelling in, there is nothing to fade and it turns back on the next frame. */
    timer = window.setTimeout(leave, landed.current && !reducedMotion() ? FADE_MS : 0);
    return () => {
      window.clearTimeout(timer);
      cancelAnimationFrame(travelFrame.current);
    };
  }, [closing, onClosed, origin]);
  /*
    §M.4 (step 93): "A rotation or a resize while the modal is open
    re-measures the square once the viewport settles, and the sleeve takes
    its new size and place at once... If a turn, the gatefold's opening or
    the cover's travel is under way, it is cut to its end state first and
    then re-measured... A resize that does not change the square's size
    moves nothing." Settled is SETTLE_MS with no resize event. A modal that
    is closing is left to close.
  */
  const sizes = useRef({ side, leaf, room });
  useEffect(() => {
    sizes.current = { side, leaf, room };
  }, [side, leaf, room]);
  const spreadDrawn = useRef(false);
  useEffect(() => {
    spreadDrawn.current = spread !== null;
  }, [spread]);
  const isClosing = useRef(closing);
  useEffect(() => {
    isClosing.current = closing;
  }, [closing]);
  useEffect(() => {
    let timer = 0;
    const settle = () => {
      if (isClosing.current) return;
      const next = measureSleeve();
      const now = sizes.current;
      const closedSame = next.side === now.side && next.room === now.room;
      if (closedSame && next.leaf === now.leaf) return;
      /* Only the spread's leaf differs and no spread is drawn: nothing on screen changes, so nothing is cut. The new leaf is kept for when it opens. */
      if (closedSame && !spreadDrawn.current) {
        setSizes(next);
        return;
      }
      cancelAnimationFrame(frame.current);
      cancelAnimationFrame(travelFrame.current);
      endMotion.current?.();
      endTravel.current?.();
      setSizes(next);
    };
    const onResize = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(settle, SETTLE_MS);
    };
    window.addEventListener('resize', onResize);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('resize', onResize);
    };
  }, []);
  const risen = travel === null ? 1 : easeOutCubic(travel.p);
  /* Where the cover lands: inside the modal square's hairline, which is where the modal draws the photograph. */
  const modalSquare: Square = { left: (window.innerWidth - side) / 2 + 1, top: MODAL_ROW + room + 1, size: side - 2 };
  const flying = travel === null ? null : travelBox(risen, travel.page, modalSquare);
  const flyingPhoto = flying === null ? null : travelPhoto(risen, flying.size, natural, pageTreatment);
  /* Closing, the sleeve "shows its front folded": the spread, the turn and the face are overridden, not unwound. */
  const pose = spread === null || closing ? null : openPose(spread.e, side, leaf);
  /* The face toward the reader: it changes edge-on, and the label with it. */
  const turnNow = closing ? null : turn;
  const toward: SleeveFace | 'inside' = closing ? 'front' : pose !== null ? (pose.panel === 'front' ? 'front' : 'inside') : turnNow === null ? face : turnNow.pose.face === 'from' ? turnNow.from : turnNow.to;
  const shown = toward === 'front' ? front : back;
  /* Every face is a square with a hairline edge, its photograph fitted on paper (§M.4). */
  const LEAF = 'absolute top-0 box-border border border-border bg-background';
  const close = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    close.current?.focus();
    /* "The page beneath" does not scroll under the view, and keeps its width (§G.8's hold, the same function). */
    const release = holdScroll(document.documentElement, window);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== 'Tab') return;
      /* "Tab cycles within the modal while it is open." */
      const stops = Array.from(view.current?.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])') ?? []);
      if (stops.length === 0) return;
      const at = stops.indexOf(document.activeElement as HTMLElement);
      const next = event.shiftKey ? (at <= 0 ? stops.length - 1 : at - 1) : at === -1 || at === stops.length - 1 ? 0 : at + 1;
      event.preventDefault();
      stops[next].focus();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      release();
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  return createPortal(
    <div ref={view} data-sleeve-modal="" data-travelling={travel?.dir} role="dialog" aria-modal="true" aria-label="The sleeve" className="fixed inset-0 z-50 flex flex-col">
      {/* §M.7: "The paper comes up with the cover, rising from clear to opaque over the same duration on the same curve." At rest it is opaque: this is a transition, not the dimming §M.1 rules out. */}
      <div data-sleeve-paper="" className="absolute inset-0 bg-background" style={{ opacity: risen }} />
      {/* "...and the top row, with CLOSE and its hairline, comes with it." */}
      <div data-sleeve-row="" className="relative box-border flex h-[53px] shrink-0 items-center border-b border-border px-[18px]" style={{ opacity: risen }}>
        <button
          ref={close}
          type="button"
          data-sleeve-close=""
          onClick={onClose}
          className={`${CONTROL} ml-auto w-[calc(5ch+0.6em+36px)]`}
        >
          Close
        </button>
      </div>
      {/*
        §M.4: the sleeve centred below the row, with the face label and the
        controls beneath it. The square is a box with a hairline edge, and
        every photograph is fitted inside it on paper, never cropped, so a
        face keeps its size and framing across a turn.
      */}
      <div data-sleeve-stage="" className="relative flex min-h-0 flex-1 flex-col items-center justify-center" style={{ visibility: travel === null ? undefined : 'hidden' }}>
        {pose !== null && inside !== null ? (
          /*
            The spread, and the motion to and from it. The right leaf stays
            where the closed sleeve was and is uncovered; the panel is the
            front, hinged at its left edge, until it stands edge-on, and
            then the left leaf, hinged at its right, laid down. x is from
            the stage's centre, which the spread ends centred on.
          */
          <div data-spread="" data-opening={spread?.moving === true ? '' : undefined} className="relative w-full shrink-0" style={{ height: pose.size }}>
            <div data-leaf="right" className={LEAF} style={{ left: `calc(50% + ${pose.fold}px)`, width: pose.size, height: pose.size }}>
              {/* eslint-disable-next-line @next/next/no-img-element -- blob and data URLs the optimizer is not configured for, as in ImageGallery */}
              <img data-sleeve-face="inside-right" src={inside.right} alt="" className="block h-full w-full object-contain" />
            </div>
            <div
              data-leaf="panel"
              data-panel={pose.panel}
              className={LEAF}
              style={{
                left: `calc(50% + ${pose.panel === 'front' ? pose.fold : pose.fold - pose.size}px)`,
                width: pose.size,
                height: pose.size,
                transformOrigin: pose.panel === 'front' ? 'left center' : 'right center',
                /* In perspective during the motion only, seen from the fold; flat at rest. */
                transform: spread?.moving === true ? `perspective(${openDistance(pose.size, room)}px) rotateY(${pose.angle}deg)` : undefined,
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- as above */}
              <img key={pose.panel} data-sleeve-face={pose.panel === 'front' ? 'front' : 'inside-left'} src={pose.panel === 'front' ? front : inside.left} alt="" className="block h-full w-full object-contain" />
            </div>
          </div>
        ) : (
          <div
            data-sleeve=""
            data-face={toward}
            data-turning={turnNow === null ? undefined : ''}
            className="relative box-border shrink-0 border border-border bg-background"
            style={{
              width: side,
              height: side,
              /*
                Perspective during the motion only, and in the sleeve's own
                transform: the distance it is seen from, in its own widths,
                with the vanishing point at the sleeve's centre. On the stage
                it would be the stage's centre, which is below the sleeve's,
                and the top and bottom edges would slope unequally.
              */
              transform: turnNow === null ? undefined : `perspective(${turnDistance(side, room)}px) rotateY(${turnNow.pose.angle}deg)`,
            }}
          >
            {shown !== null ? (
              // eslint-disable-next-line @next/next/no-img-element -- blob and data URLs the optimizer is not configured for, as in ImageGallery
              <img key={toward} data-sleeve-face={toward} src={shown} alt="" className="block h-full w-full object-contain" />
            ) : (
              /*
                §M.3: "The modal's plain back is the record's field, filling
                the square, with the label and catalogue number in paper on
                it; where the record has no stored colour, it is ink." The
                imprint is the wall's own component, so one sleeve has one
                back; the ground is the wall's own computation, handed in.
              */
              <div data-plain-back="" className="h-full w-full" style={{ background: plain.ground }}>
                <PlainBackImprint labelName={plain.labelName} catalogNumber={plain.catalogNumber} />
              </div>
            )}
          </div>
        )}
        {/* §M.5: "a label beneath the sleeve names the face shown... It shows in every mode... the label is announced politely." */}
        <div data-face-label="" aria-live="polite" className={`${LABEL} shrink-0 leading-none`} style={{ marginTop: MODAL_LABEL_GAP, height: MODAL_LABEL_LINE, opacity: chrome && !closing ? 1 : 0, transition: `opacity ${FADE_MS}ms linear` }}>
          {FACE_NAME[toward]}
        </div>
        <div data-sleeve-controls="" className="flex shrink-0" style={{ marginTop: MODAL_LABEL_GAP, gap: MODAL_CONTROL_GAP, opacity: chrome && !closing ? 1 : 0, transition: `opacity ${FADE_MS}ms linear` }}>
          {showsFold ? (
            /* §M.6: "Open, the control row shows FOLD alone", so the sleeve is folded shut before it can be turned. */
            <button ref={foldControl} type="button" data-sleeve-control="fold" onClick={() => openOrFold('closed')} className={`${CONTROL} px-[18px]`}>
              Fold
            </button>
          ) : (
            <>
              {/* §M.6: "TURN OVER shows on the front and on the back, and keeps its label on both". */}
              <button type="button" data-sleeve-control="turn" onClick={turnOver} className={`${CONTROL} px-[18px]`}>
                Turn over
              </button>
              {/* §M.6: "OPEN shows on the front only, and only where the gatefold opens... absent, not present and inert." */}
              {inside !== null && face === 'front' && (
                <button ref={openControl} type="button" data-sleeve-control="open" onClick={() => openOrFold('open')} className={`${CONTROL} px-[18px]`}>
                  Open
                </button>
              )}
            </>
          )}
        </div>
      </div>
      {flying !== null && flyingPhoto !== null && (
        /*
          The travelling cover: a copy of the page's cover, without its focus
          ring, which "stays behind" on the page's trigger. Flat: "a move
          and a growth in the picture plane, with no rotation".
        */
        <div data-travel-cover="" className="absolute overflow-hidden" style={{ left: flying.left, top: flying.top, width: flying.size, height: flying.size }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- as above */}
          <img src={front} alt="" className="absolute max-w-none" style={{ width: flyingPhoto.width, height: flyingPhoto.height, left: (flying.size - flyingPhoto.width) / 2, top: (flying.size - flyingPhoto.height) / 2 }} />
        </div>
      )}
    </div>,
    document.body,
  );
}

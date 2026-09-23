import { COS30, DEPTH, SPINE_HEIGHT, frontFace, labelTransform, rightFace, topFace, type PlacedSeat } from './geometry';
import { PAPER_CSS } from '@/lib/colour/paper';
import { paintOrder, seatBounds } from './paint-sort';
import { FACE_FILL, PLANE_FILL, TOP_FILL, points } from './WallOverview';
import type { WallSeat } from './shelf-runs';
import { WALL_PAPER_HEX, pullFill, returnFill } from './pull-colour';
import { wallLayout } from './wall-layout';
import type { View } from './view';
import { GROWTH, OUT_MS, RETURN_MS, easeInOutCubic, gestureFaces, outTime, poseAt, type GestureState } from './gesture';
import { recordOffset } from './pan';
import { RETURN_FADE_END } from './pull-colour';
import { recordLadder } from '@/lib/colour/record-ladder';
import { MICRO_PX } from '../type-scale';
import { LABEL } from '../records/[id]/grid-type';
import { SLEEVE_LEADING, sleeveTitle } from './sleeve-type';

/**
 * The wall at 1:1 — faces plus labels (The Wall 5b §4, D2; 8a §11).
 *
 * **Same geometry as the overview, by import.** `geometry.ts` exists so this
 * component inherits the overview's decisions rather than re-making them: one
 * projection, rows on the axis, planes per run, painter's order across the
 * whole wall. What this adds is what §5 removes below 1:1 — the labels — and
 * the pull.
 *
 * **Labels at `micro` / cos 30° — 9px read through the shear**, Geist Mono
 * 500, on the front face's own plane (D2's matrix, entered at the face's
 * bottom-left) from an 8px baseline inset. Truncated at the 37-character
 * budget. The size is derived from the scale's `micro` by name (§11).
 *
 * **At rest the wall is line, ink and paper (§11): no derived colour anywhere
 * in the drawing.** Pulled, a record slides forward along the depth axis and
 * grows, still in the projection (§11.10), and its colour arrives across the
 * slide (§11.2).
 */

/** The one ink, for outline and label alike. */
const INK = '#161412';
const RULE = 'oklch(0.44 0.008 70)';
const PAPER = PAPER_CSS;
/** §11.34: the footprint a displaced record leaves, at §11.27's hairline. */
const FOOTPRINT = 'oklch(0.72 0.004 80)';
/** §11.33: the focus mark's ink, §11.30's value recomputed against both grounds. */
const SPINE_FOCUS = 'oklch(0.18 0.008 60)';
/** §11.27's hover surface and the hairline recomputed against it (§11.28). */
const SPINE_HOVER_SURFACE = 'oklch(0.731 0.004 80)';
const SPINE_HOVER_RULE = 'oklch(0.588 0.004 80)';
const LABEL_FONT_PX = Number((MICRO_PX / COS30).toFixed(2));
const BASELINE_INSET = 8;

/**
 * Where a record is on its way out or back.
 *
 * `progress` is 0 → 1 in the gesture's own direction, so `back` at 0 is the
 * fully pulled record and at 1 the seated one. The component draws the pose;
 * driving `progress` against the clock is `WallLive`'s job.
 */
/**
 * The label, on the face's plane: local x runs up the spine from the bottom
 * inset, the baseline sits across the thickness at its centre plus half a
 * cap height.
 */
function label(transform: string, width: number, text: string) {
  return (
    <text
      data-label=""
      transform={transform}
      x={BASELINE_INSET}
      y={(width / 2 + LABEL_FONT_PX * 0.35).toFixed(1)}
      fontFamily="Geist Mono, monospace"
      fontSize={LABEL_FONT_PX}
      fontWeight="500"
      fill={INK}
      xmlSpace="preserve"
      /* The face takes the pointer; a label drawn over it must not intercept the click on its own record. */
      pointerEvents="none"
    >
      {text}
    </text>
  );
}

/** A moving record: which, which way, and how far along its own clock (§11.19, §11.21). */
export type PullState = GestureState;

export function WallLabelled({
  seats,
  pull = null,
  pulls,
  labels = true,
  minWidth = 0,
  minHeight = 0,
  side = 'front',
  view = null,
  framed,
  onSeatClick,
  onPulledClick,
}: {
  seats: readonly WallSeat[];
  pull?: PullState | null;
  /** The arrows' slide moves two records at once: one back, one out (§11.8). */
  pulls?: readonly PullState[];
  /** §5's guard: false only when the container cannot hold one record (D1). */
  labels?: boolean;
  /** The container's width in px: the pan extent is never narrower than the view (§11.8). */
  minWidth?: number;
  /** §11.7: Turn over shows the back on the same face. */
  side?: 'front' | 'back';
  /** The visible drawing region in the svg's px (§11.9): where a pulled record lands. Defaults to the whole drawing. */
  view?: View | null;
  /** The region's height: the drawing is never smaller than the region that shows it. */
  minHeight?: number;
  /** Records whose landings the frame holds (§11.22) — every record that has moved since the wall was last at rest. Defaults to the moving set. */
  framed?: readonly string[];
  onSeatClick?: (id: string) => void;
  onPulledClick?: () => void;
}) {
  const moving: readonly PullState[] = pulls ?? (pull === null ? [] : [pull]);
  const movingById = new Map(moving.map((state) => [state.id, state]));

  const byId = new Map(seats.map((seat) => [seat.id, seat]));
  /* §11.23: paint order interleaves rows by column, so the keyboard walk gets its own sequence — seat order, 1-based, over the SEATED records (§11.12: an empty seat is not on the path). */
  const tabOf = new Map(seats.filter((seat) => !seat.empty).map((seat, index) => [seat.id, index + 1]));
  const { placed, pieces, frame } = wallLayout(seats, (framed ?? moving.map((m) => m.id)).map((id) => ({ id })), minWidth, minHeight);
  /* The view is the region's to pan (§11.22); the drawing needs none of it. */
  void view;

  /*
    **Drawn where the sort puts it** (§11.20): last once it is past the row,
    between its neighbours before — a record coming out covers what is
    behind it and is covered by the neighbour at larger x until it is clear.
  */
  /** The moving record's solid at this instant of its gesture (§11.19–§11.21): rigid, re-projected, one fixed point. */
  const facesOf = (seat: PlacedSeat, state: PullState) => gestureFaces(seat, poseAt(outTime(state)));
  /*
    How far colour (and the cover) has arrived: one ease over the FULL
    out-span on the way out (§11.2 — the fade runs 1600ms, not the swing's
    1300, or colour would land 300ms before the record does), and on the way
    back the fade that completes at RETURN_FADE_END, before the spine lands.
  */
  const arrivalOf = (state: PullState) =>
    state.direction === 'out'
      ? easeInOutCubic(outTime(state) / OUT_MS)
      : 1 - easeInOutCubic(Math.min(1, state.ms / RETURN_MS / RETURN_FADE_END));

  const renderMoving = (seat: PlacedSeat, record: WallSeat, state: PullState) => {
    const faces = facesOf(seat, state);
    const arrival = arrivalOf(state);
    /*
      **The same object, travelled, grown and turned under the one projection**
      (§11.19–§11.21): its three faces are `gestureFaces`' — the box rotated
      rigidly about the foot of its cover's near edge and re-projected, never
      an interpolated corner — and its seat is empty behind it. Its right face
      is the field, the one place colour arrives, on the swing's own eased
      value (§11.2); the cover sits on it at its own aspect (§11.3).
    */
    const ladder = recordLadder(record.spineColour);
    const fill = state.direction === 'out' ? pullFill(arrival, ladder) : returnFill(state.ms / RETURN_MS, ladder);
    /* The field's inset, in the cover's own units; it scales with the plane. */
    const inset = Math.round(DEPTH * 0.11);
    /*
      **Type is laid out once, at the landed size, and rides the plane.** The
      cover's plane scales uniformly by the record's growth (§11.25: on the
      rotation's window), exactly GROWTH on arrival, so the sleeve is set at its
      landed px — where it is read, on a wall at 1:1 — inside a group scaled
      by 1/GROWTH. The artist lands at LABEL's 11px: read type is read at the
      scale's size wherever it lands.
    */
    const inner = (DEPTH - 2 * inset) * GROWTH;
    const offset = recordOffset(seat, state);
    const sleeve = (children: React.ReactNode) => (
      <g transform={`translate(${inset} ${inset}) scale(${1 / GROWTH})`}>{children}</g>
    );
    return (
      <g
        key={seat.id}
        data-pulled={seat.id}
        /* §11.26: the pan's clearance, carried by the whole record; the faces inside are the gesture's own. */
        transform={offset[0] === 0 && offset[1] === 0 ? undefined : `translate(${offset[0]} ${offset[1]})`}
        style={{ cursor: onPulledClick === undefined ? undefined : 'pointer' }}
        onClick={onPulledClick}
      >
        <polygon data-face="top" points={points(faces.top)} fill={TOP_FILL} stroke={INK} strokeWidth="1" pointerEvents="all" />
        <g transform={faces.coverMatrix} data-landing="">
          <rect data-field="" width={DEPTH} height={SPINE_HEIGHT} fill={fill} stroke={INK} strokeWidth="1" pointerEvents="all" />
          {side === 'back' ? (
            /*
              §11.7: Turn over is about the record rather than which face
              is toward the reader — the back on the same face. The
              photograph when there is one; otherwise §10b's plain back,
              in the record's field, carrying label and catalogue number
              and no body text.
            */
            record.backUrl !== null ? (
              <image
                data-back={seat.id}
                href={record.backUrl}
                x={inset}
                y={inset}
                width={DEPTH - inset * 2}
                height={SPINE_HEIGHT - inset * 2}
                preserveAspectRatio="xMidYMid meet"
                pointerEvents="none"
              />
            ) : (
              sleeve(
                <foreignObject data-back-plain="" width={inner} height={inner} pointerEvents="none">
                  <div className={`flex h-full flex-col justify-end p-[16px] ${LABEL}`} style={{ color: WALL_PAPER_HEX }}>
                    <div>{record.labelName ?? ''}</div>
                    <div>{record.catalogNumber ?? ''}</div>
                  </div>
                </foreignObject>,
              )
            )
          ) : record.coverUrl !== null ? (
            <image
              data-cover={seat.id}
              href={record.coverUrl}
              x={inset}
              y={inset}
              width={DEPTH - inset * 2}
              height={SPINE_HEIGHT - inset * 2}
              preserveAspectRatio="xMidYMid meet"
              opacity={arrival}
              pointerEvents="none"
            />
          ) : (
            /*
              §11.3, §11.7: **the record with no cover arrives at type,
              not at a swatch.** Its material is its text — title and
              artist set large on a paper sleeve area where the cover
              would be, over the same field every pull arrives at — and
              §6's diagonal crosses the area so the state says "no
              cover" rather than leaving a grey square to be inferred.
              The one place text enters the projection, because it
              stands in for artwork rather than being read as fact.
              Anchored at the top: a long title clips at its tail, never
              its head (sleeve-type.ts fits it to the landed sleeve).
            */
            <g data-no-cover="" opacity={arrival} pointerEvents="none">
              {sleeve(
                <>
                  <rect width={inner} height={inner} fill={PAPER} stroke={INK} strokeWidth="1" />
                  <foreignObject width={inner} height={inner}>
                    {(() => {
                      const fit = sleeveTitle(record.title, inner - 32);
                      return (
                        <div
                          className="flex h-full flex-col justify-start overflow-hidden p-[16px] font-sans tracking-[-0.02em]"
                          style={{ color: 'oklch(0.18 0.005 60)' }}
                        >
                          <div className={LABEL} style={{ fontSize: '11px' }}>
                            {record.artist}
                          </div>
                          <div
                            data-sleeve-title=""
                            className="mt-[6px] font-extrabold tracking-[-0.02em]"
                            style={{ fontSize: `${fit.size}px`, lineHeight: SLEEVE_LEADING }}
                          >
                            {fit.text}
                          </div>
                        </div>
                      );
                    })()}
                  </foreignObject>
                  <line data-diagonal="" x1={0} y1={0} x2={inner} y2={inner} stroke={INK} strokeWidth="1" />
                </>,
              )}
            </g>
          )}
        </g>
        <polygon data-face="front" points={points(faces.spine)} fill={FACE_FILL} stroke={INK} strokeWidth="1" pointerEvents="all" />
        {/* The same object: its spine still says what it is, on the spine's own turning plane. */}
        {labels ? label(faces.labelMatrix, seat.width, record.label) : null}
      </g>
    );
  };

  return (
    <svg
      data-wall="labelled"
      viewBox={frame.viewBox}
      width={frame.width}
      height={frame.height}
      /* No ground of its own: the page's paper is the wall's, one surface. */
      style={{ width: `${frame.width}px`, height: `${frame.height}px`, display: 'block' }}
    >
      {/*
        §11.33: a spine hovers exactly as a run does — it sinks to §11.27's
        0.731 with hairlines at 0.588, and nothing else. No lift, no offset,
        no shadow: a small version of the pull is still the pull, and motion
        of a record is the channel this page reserves for §11.19's gesture.
        No count and no tooltip either — the far view's run shows a count
        because that view withholds counts, and the near view withholds
        nothing, so a tooltip would repeat the label already on the face.

        Focus adds the top-face mark the polygons carry, and the app's
        oxblood ring goes: a focus ring is chrome applied without asking what
        it lands on, and on a monochrome fixture it is the only colour on the
        page, arriving wherever the reader happens to tab (§11.32).
      */}
      <style data-spine-states="">{`
[data-seat]:hover polygon[data-face], [data-seat]:focus-visible polygon[data-face] { fill: ${SPINE_HOVER_SURFACE}; stroke: ${SPINE_HOVER_RULE}; }
[data-seat] [data-spine-focus] { opacity: 0; }
[data-seat]:focus-visible [data-spine-focus] { opacity: 1; }
[data-seat]:focus { outline: none; }
[data-seat]:focus-visible { outline: none; }
`}</style>
      {/*
        **Every object in the painter's order, by separating plane (§11.20):**
        each shelf and upright, each seated record, the moving one. A shelf
        paints before the records on it and after the row below; the right
        upright after the row it ends; a moving record after the seats it is
        nearer than and last once past the row on y. The spine is the +y
        face, toward the camera, so a record's anchor holds all three faces.
        Document order follows this order — within a row it is seat order;
        across rows it interleaves by column, so the keyboard walk carries an
        explicit tabindex sequence in seat order (§11.23).
      */}
      {paintOrder([
        ...pieces.map((piece) => ({ id: piece.id, ...piece.bounds })),
        ...placed.filter((seat) => byId.has(seat.id) && !movingById.has(seat.id)).map((seat) => seatBounds(seat)),
        ...moving.flatMap((state) => {
          const seat = placed.find((p) => p.id === state.id);
          return seat === undefined ? [] : [{ id: seat.id, ...facesOf(seat, state).sortBounds, moving: true }];
        }),
      ]).map((object) => {
        const piece = pieces.find((p) => p.id === object.id);
        if (piece !== undefined) {
          return (
            <g key={piece.id} data-piece={piece.kind}>
              {piece.faces.map((face, index) => (
                <polygon key={index} data-furniture={face.kind} points={points(face.points)} fill={PLANE_FILL} stroke={RULE} strokeWidth="1" />
              ))}
              {/* §2's breaks: a rule across the shelf's top at the seat boundary; the plane runs on past it. */}
              {piece.breaks.map(([from, to], index) => (
                <line key={`break-${index}`} data-break="" x1={from[0].toFixed(2)} y1={from[1].toFixed(2)} x2={to[0].toFixed(2)} y2={to[1].toFixed(2)} stroke={RULE} strokeWidth="1" />
              ))}
            </g>
          );
        }
        const seat = placed.find((p) => p.id === object.id);
        const record = byId.get(object.id);
        if (seat === undefined || record === undefined) return null;
        /*
          §11.34: an emptied seat draws its FOOTPRINT — the seat's own
          rectangle on the shelf's top face. §11.12's position invariance was
          necessary and not sufficient: the seats held to the pixel and the
          drawing had nothing in it to read, so a filtered row looked short
          rather than gapped. A shape made of absences is only a shape if the
          absences are drawn.

          Projected geometry rather than a page rule, so §11.31's "no rules
          in the drawing region" holds: it is drawn by the same projection as
          the shelf under it and moves with the pan. 1px because it is not
          one of §3's three named 2px non-type marks, and a hairline rather
          than a tint, so the shelf at rest stays line, ink and paper
          (§11.32).
        */
        if (record.empty) {
          return (
            <polygon
              key={seat.id}
              /* Carries the displaced record's id, so a test can count footprints among ITS records rather than the whole wall's. */
              data-footprint={seat.id}
              points={points(topFace({ ...seat, height: 0 }))}
              fill="none"
              stroke={FOOTPRINT}
              strokeWidth="1"
            />
          );
        }
        const state = movingById.get(object.id);
        if (state !== undefined) return renderMoving(seat, record, state);
        const face = frontFace(seat);

        return (
          /*
            **An anchor, not a group** (§11.8): the href is the record's route,
            so the spine works with JavaScript off, names its record by role,
            and is on the keyboard's path — and the FULL title is its
            accessible name where the face carries the truncated one, the one
            place in this design where truncation is not a loss. With
            JavaScript on, the click is intercepted into the pull.
          */
          <a
            key={seat.id}
            data-seat={seat.id}
            href={`/records/${seat.id}`}
            tabIndex={tabOf.get(seat.id)}
            aria-label={`${record.artist} · ${record.title}`}
            style={{ cursor: onSeatClick === undefined ? undefined : 'pointer' }}
            onClick={
              onSeatClick === undefined
                ? undefined
                : (event) => {
                    event.preventDefault();
                    onSeatClick(seat.id);
                  }
            }
          >
            <polygon data-face="top" points={points(topFace(seat))} fill={TOP_FILL} stroke={INK} strokeWidth="1" />
            <polygon data-face="right" points={points(rightFace(seat))} fill={FACE_FILL} stroke={INK} strokeWidth="1" />
            <polygon
              data-spine=""
              data-face="front"
              points={points(face)}
              fill={FACE_FILL}
              stroke={INK}
              strokeWidth="1"
            />
            {/*
              §11.33: the focus mark, on the TOP face. A spine's front face
              projects to 10.4 units, so §11.30's 2px rule would be 19% of it
              — at that proportion the mark stops reading as an edge and
              starts reading as a spine of a different colour, which is the
              channel §11.28's hover hairline correction was protecting. The
              top face is 130 deep and no label crosses it. Value unchanged
              at 0.18: 7.89:1 on the sunk surface, 15.07:1 on paper.
            */}
            <polygon
              data-spine-focus=""
              points={points(topFace(seat))}
              fill="none"
              stroke={SPINE_FOCUS}
              strokeWidth="2"
            />
            {labels ? label(labelTransform(seat), seat.width, record.label) : null}
          </a>
        );
      })}
    </svg>
  );
}

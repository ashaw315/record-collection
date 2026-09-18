import {
  COS30,
  coverTransform,
  frontFace,
  labelTransform,
  paintOrder,
  rightFace,
  topFace,
  type PlacedSeat,
} from './geometry';
import { FACE_FILL, PLANE_FILL, TOP_FILL, points } from './WallOverview';
import type { WallSeat } from './shelf-runs';
import { pullPose, returnPose } from './pull-curve';
import { WALL_PAPER_HEX, pullFill, returnFill } from './pull-colour';
import { wallLayout } from './wall-layout';
import { landedBox, landedSquare, landingBoxAt, type View } from './landing';
import { turnMatrixAt, type CornerPath } from './turn';
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
const PAPER = 'oklch(0.925 0.004 80)';
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
function label(seat: Parameters<typeof labelTransform>[0], text: string) {
  return (
    <text
      data-label=""
      transform={labelTransform(seat)}
      x={BASELINE_INSET}
      y={(seat.width / 2 + LABEL_FONT_PX * 0.35).toFixed(1)}
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

export type PullState = {
  id: string;
  direction: 'out' | 'back';
  progress: number;
  /**
   * §11.14's phase two, as the eased amount of the turn: 0 in the projection,
   * 1 on the page's plane. Present only while the record is turning or
   * turned; absent through phase one, and always on the wall as shipped
   * until the probe is ruled on.
   */
  turn?: number;
};

export function WallLabelled({
  seats,
  pull = null,
  pulls,
  labels = true,
  minWidth = 0,
  minHeight = 0,
  side = 'front',
  view = null,
  turnPath = 'linear',
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
  /** §11.14's open question as a parameter: how the cover's corners travel through the turn. */
  turnPath?: CornerPath;
  onSeatClick?: (id: string) => void;
  onPulledClick?: () => void;
}) {
  const moving: readonly PullState[] = pulls ?? (pull === null ? [] : [pull]);
  const poseOf = (state: PullState) =>
    state.direction === 'out' ? pullPose(state.progress, 1, 1) : returnPose(state.progress, 1, 1);
  const movingById = new Map(moving.map((state) => [state.id, state]));

  const byId = new Map(seats.map((seat) => [seat.id, seat]));
  const { placed, furniture, breaks, frame } = wallLayout(seats, moving.map((m) => ({ id: m.id, pose: poseOf(m) })), minWidth, minHeight);
  /* The landing's region, in the svg's own coordinates: the view is given relative to the svg's top-left. */
  const [frameX, frameY] = frame.viewBox.split(' ').map(Number);
  const given: View = view ?? { x: 0, y: 0, width: frame.width, height: frame.height };
  const region: View = { ...given, x: frameX + given.x, y: frameY + given.y };

  /*
    **Drawn after every seat, so nothing paints over it.** A record coming out
    to be looked at covers whatever is behind it; rendered in seat order it
    was under every later face, invisible at rest and unclickable on return.
  */
  const renderMoving = (seat: PlacedSeat, record: WallSeat, state: PullState) => {
    const pose = poseOf(state);
    /*
      **The same object, moved — and grown — under the one projection**
      (§11.10). The pulled record is a box on §11.2's one curve: it slides
      forward along the depth axis, its cover face grows to the region's
      largest square, and it does not straighten. Its faces are drawn by the
      functions that draw every seated face, so the cover arrives as a
      parallelogram at the wall's own angle by construction. The seat is
      empty behind it: the seated anchor is not rendered while it moves.
      Its right face is the field — the one place colour arrives, on the ONE
      eased value the slide reads (§11.2) — and the cover sits on it at its
      own aspect (§11.3).
    */
    /*
      §11.14, phase two: once the record carries a turn amount it is the
      landed box turning onto the page's plane — the cover on the turn's
      matrix, the spine and top departing the drawing with it, since a face
      on the page has no sides.
    */
    const turning = state.turn !== undefined;
    const landed = landedBox(seat.id, region);
    const box = turning ? landed : landingBoxAt(seat, region, pose.eased);
    const departing = turning ? { opacity: 1 - (state.turn ?? 0) } : {};
    const coverMatrix = turning ? turnMatrixAt(landed, landedSquare(region), state.turn ?? 0, turnPath) : coverTransform(box);
    const ladder = recordLadder(record.spineColour);
    const fill =
      state.direction === 'out'
        ? pullFill(state.progress, ladder)
        : returnFill(state.progress, ladder);
    /* The field's inset, in the wall's units: proportional to the face, so the landed cover keeps the seated proportion. */
    const inset = Math.round(box.depth * 0.11);
    /*
      **Type is laid out once, at the landed size, and scaled uniformly on
      the way there.** The face grows faster in depth than in height (a
      100 × 150 seat becomes a square), and type scaled with it would
      stretch; so the sleeve is set at its landed px — where it is read, on
      a wall at 1:1 — and travels inside the field at the smaller of the two
      ratios, exactly 1 on arrival. The artist lands at LABEL's 11px, not
      11·k: read type is read at the scale's size wherever it lands.
    */
    const landedInset = Math.round(landed.depth * 0.11);
    const inner = landed.depth - 2 * landedInset;
    const sleeveScale = Math.min((box.depth - 2 * inset) / inner, (box.height - 2 * inset) / inner);
    const sleeve = (children: React.ReactNode) => (
      <g transform={`translate(${inset} ${inset}) scale(${sleeveScale})`}>{children}</g>
    );
    return (
      <g
        key={seat.id}
        data-pulled={seat.id}
        style={{ cursor: onPulledClick === undefined ? undefined : 'pointer' }}
        onClick={onPulledClick}
      >
        <polygon data-face="top" points={points(topFace(box))} fill={TOP_FILL} stroke={INK} strokeWidth="1" pointerEvents="all" {...departing} />
        <g transform={coverMatrix} data-landing="">
          <rect data-field="" width={box.depth} height={box.height} fill={fill} stroke={INK} strokeWidth="1" pointerEvents="all" />
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
                width={box.depth - inset * 2}
                height={box.height - inset * 2}
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
              width={box.depth - inset * 2}
              height={box.height - inset * 2}
              preserveAspectRatio="xMidYMid meet"
              opacity={pose.eased}
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
            <g data-no-cover="" opacity={pose.eased} pointerEvents="none">
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
        <polygon data-face="front" points={points(frontFace(box))} fill={FACE_FILL} stroke={INK} strokeWidth="1" pointerEvents="all" {...departing} />
        {/* The same object: its spine still says what it is. */}
        {labels ? <g {...departing}>{label(box, record.label)}</g> : null}
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
      {/* The unit's furniture first (§11.10, §11.11): four shelves joined by uprights, the records standing on them. */}
      {furniture.map((face, index) => (
        <polygon key={`f-${index}`} data-furniture={face.kind} points={points(face.points)} fill={PLANE_FILL} stroke={RULE} strokeWidth="1" />
      ))}
      {/* §2's breaks: a rule across the plane at the seat boundary; the plane runs on past it. */}
      {breaks.map(([from, to], index) => (
        <line key={`break-${index}`} data-break="" x1={from[0].toFixed(2)} y1={from[1].toFixed(2)} x2={to[0].toFixed(2)} y2={to[1].toFixed(2)} stroke={RULE} strokeWidth="1" />
      ))}
      {/*
        **Two passes, because the spine is the −y face (§11.15).** A record's
        cover face reaches down-left across the spines of every record to its
        left, so painted record by record the only readable spine in a row is
        the last one — §11.11's drawing has the same occlusion and hides it by
        painting all its labels after every polygon. Per-face painting is what
        a depth test gives: covers and tops far to near, then every spine,
        which is nearer than everything it crosses. Document order of the
        seats is still seat order (§11.8): the anchors are the second pass.
      */}
      {paintOrder(placed).map((seat) =>
        !byId.has(seat.id) || movingById.has(seat.id) ? null : (
          <g key={`faces-${seat.id}`} data-of={seat.id}>
            <polygon data-face="top" points={points(topFace(seat))} fill={TOP_FILL} stroke={INK} strokeWidth="1" />
            <polygon data-face="right" points={points(rightFace(seat))} fill={FACE_FILL} stroke={INK} strokeWidth="1" />
          </g>
        ),
      )}
      {paintOrder(placed).map((seat) => {
        const record = byId.get(seat.id);
        if (record === undefined) return null;
        const face = frontFace(seat);

        if (movingById.has(seat.id)) return null;

        return (
          /*
            **An anchor, not a group** (§11.8): the href is the record's route,
            so the spine works with JavaScript off, names its record by role,
            and is on the keyboard's path — and the FULL title is its
            accessible name where the face carries the truncated one, the one
            place in this design where truncation is not a loss. With
            JavaScript on, the click is intercepted into the pull. The anchor
            is the spine and its label; the record's other faces are in the
            pass above.
          */
          <a
            key={seat.id}
            data-seat={seat.id}
            href={`/records/${seat.id}`}
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
            <polygon
              data-spine=""
              data-face="front"
              points={points(face)}
              fill={FACE_FILL}
              stroke={INK}
              strokeWidth="1"
            />
            {labels ? label(seat, record.label) : null}
          </a>
        );
      })}
      {moving.map((state) => {
        const seat = placed.find((p) => p.id === state.id);
        const record = byId.get(state.id);
        return seat === undefined || record === undefined ? null : renderMoving(seat, record, state);
      })}
    </svg>
  );
}

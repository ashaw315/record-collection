import {
  COS30,
  DEPTH,
  SPINE_HEIGHT,
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
 * in the drawing.** Pulled, a record slides forward along the depth axis (D2)
 * and its colour arrives across the slide (§11.2).
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
function label(seat: PlacedSeat, text: string) {
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
};

export function WallLabelled({
  seats,
  pull = null,
  labels = true,
  minWidth = 0,
  side = 'front',
  onSeatClick,
  onPulledClick,
}: {
  seats: readonly WallSeat[];
  pull?: PullState | null;
  /** §5's guard: false only when the container cannot hold one record (D1). */
  labels?: boolean;
  /** The container's width in px: the pan extent is never narrower than the view (§11.8). */
  minWidth?: number;
  /** §11.7: Turn over shows the back on the same face. */
  side?: 'front' | 'back';
  onSeatClick?: (id: string) => void;
  onPulledClick?: () => void;
}) {
  const pulledId = pull?.id ?? null;
  const pose =
    pull === null
      ? null
      : pull.direction === 'out'
        ? pullPose(pull.progress, 1, 1)
        : returnPose(pull.progress, 1, 1);

  const byId = new Map(seats.map((seat) => [seat.id, seat]));
  const { placed, planes, breaks, frame } = wallLayout(seats, pulledId, pose, minWidth);

  return (
    <svg
      data-wall="labelled"
      viewBox={frame.viewBox}
      width={frame.width}
      height={frame.height}
      /* No ground of its own: the page's paper is the wall's, one surface. */
      style={{ width: `${frame.width}px`, height: `${frame.height}px`, display: 'block' }}
    >
      {planes.map((plane, index) => (
        <polygon key={`plane-${index}`} data-plane="" points={points(plane)} fill={PLANE_FILL} stroke={RULE} strokeWidth="1" />
      ))}
      {/* §2's breaks: a rule across the plane at the seat boundary; the plane runs on past it. */}
      {breaks.map(([from, to], index) => (
        <line key={`break-${index}`} data-break="" x1={from[0].toFixed(2)} y1={from[1].toFixed(2)} x2={to[0].toFixed(2)} y2={to[1].toFixed(2)} stroke={RULE} strokeWidth="1" />
      ))}
      {paintOrder(placed).map((seat) => {
        const record = byId.get(seat.id);
        if (record === undefined) return null;
        const face = frontFace(seat);

        if (seat.id === pulledId && pull !== null) {
          /*
            **The same object, moved** (D2): the pulled record is the seated
            one at a different y. Its right face is the field — the one place
            colour arrives, on the ONE eased value the slide reads (§11.2) —
            and the cover sits on it at its own aspect (§11.3). The cover's
            plane is mirrored by D2's matrix, so it carries no caption.
          */
          const ladder = recordLadder(record.spineColour);
          const fill =
            pull.direction === 'out'
              ? pullFill(pull.progress, ladder)
              : returnFill(pull.progress, ladder);
          const inset = Math.round(DEPTH * 0.11);
          return (
            <g
              key={seat.id}
              data-pulled={seat.id}
              style={{ cursor: onPulledClick === undefined ? undefined : 'pointer' }}
              onClick={onPulledClick}
            >
              <polygon data-face="top" points={points(topFace(seat))} fill={TOP_FILL} stroke={INK} strokeWidth="1" pointerEvents="all" />
              <g transform={coverTransform(seat)}>
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
                    <foreignObject data-back-plain="" x={inset} y={inset} width={DEPTH - inset * 2} height={SPINE_HEIGHT - inset * 2} pointerEvents="none">
                      <div className={`flex h-full flex-col justify-end p-[16px] ${LABEL}`} style={{ color: WALL_PAPER_HEX }}>
                        <div>{record.labelName ?? ''}</div>
                        <div>{record.catalogNumber ?? ''}</div>
                      </div>
                    </foreignObject>
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
                    opacity={pose?.eased ?? 1}
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
                  */
                  <g data-no-cover="" opacity={pose?.eased ?? 1} pointerEvents="none">
                    <rect
                      x={inset}
                      y={inset}
                      width={DEPTH - inset * 2}
                      height={SPINE_HEIGHT - inset * 2}
                      fill={PAPER}
                      stroke={INK}
                      strokeWidth="1"
                    />
                    <foreignObject x={inset} y={inset} width={DEPTH - inset * 2} height={SPINE_HEIGHT - inset * 2}>
                      {/*
                        Two elements governed differently, on read-versus-drawn
                        rather than on size — it looks like an inconsistency and
                        is the rule. The ARTIST is read, so it takes a scale size
                        (LABEL). The TITLE stands in for artwork, so it is a drawn
                        element and its size derives from its box and its string
                        (sleeve-type.ts) — the way the 72 derives from the year
                        field. Anchored at the top: a long title clips at its
                        tail, never its first line.
                      */}
                      <div
                        className="flex h-full flex-col justify-start overflow-hidden p-[16px] font-sans"
                        style={{ color: 'oklch(0.18 0.005 60)' }}
                      >
                        <div className={LABEL}>{record.artist}</div>
                        {(() => {
                          const fit = sleeveTitle(record.title, DEPTH - inset * 2 - 32);
                          return (
                            <div
                              data-sleeve-title=""
                              className="mt-[6px] font-extrabold tracking-[-0.02em]"
                              style={{ fontSize: `${fit.size}px`, lineHeight: SLEEVE_LEADING }}
                            >
                              {fit.text}
                            </div>
                          );
                        })()}
                      </div>
                    </foreignObject>
                    <line
                      data-diagonal=""
                      x1={inset}
                      y1={inset}
                      x2={DEPTH - inset}
                      y2={SPINE_HEIGHT - inset}
                      stroke={INK}
                      strokeWidth="1"
                    />
                  </g>
                )}
              </g>
              <polygon data-face="front" points={points(face)} fill={FACE_FILL} stroke={INK} strokeWidth="1" pointerEvents="all" />
              {/* The same object: its spine still says what it is. */}
              {labels ? label(seat, record.label) : null}
            </g>
          );
        }

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
            {labels ? label(seat, record.label) : null}
          </a>
        );
      })}
    </svg>
  );
}

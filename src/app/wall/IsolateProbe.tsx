'use client';

import { useEffect, useRef, useState } from 'react';
import { PAPER_CSS } from '@/lib/colour/paper';
import { DEPTH, frontFace, labelTransform, rightFace, topFace, type PlacedSeat, type Point } from './geometry';
import { OUT_MS, SWING_MS, gestureFaces, poseAt } from './gesture';
import { paintOrder, seatBounds, type PaintBounds } from './paint-sort';
import { PER_SHELF, rowZ, unitPieces } from './unit';

/**
 * **The isolation harness: the probe's exact configuration, in this code.**
 * One shelf of nine records at the probe's own seats (x = 40 + 17i, width
 * 12), one pulled (the fifth), the probe's floor plane, the probe's colours,
 * the probe's viewBox refit every frame — drawn by the build's own geometry,
 * gesture and painter. Nothing else: no units, no uprights, no panel, no
 * rail, no finish, no drift. Each of those is a switch, added back one at a
 * time to find which one changes the read.
 */
export type IsolateConfig = {
  finish: boolean;
  frame: 'refit' | 'fixed';
  furniture: boolean;
  floor: boolean;
  labelSize: number;
};

const OX = 40;
const SEATS = 9;
const PULLED = 4;
const PAD = 60;
const TITLES = [
  'Miles Davis · Bitches Brew',
  'Donovan · The Hurdy Gurdy Man',
  'Jeff Beck · Wired',
  'John Lennon · Mind Games',
  'Darkside · Psychic',
  'Steely Dan · Gaucho',
  'The Doors · The Soft Parade',
  'MGMT · Loss Of Life',
  'Dire Straits · Dire Straits',
];
const PAPER = PAPER_CSS;
const INK = 'oklch(0.18 0.005 60)';
const HAIR = 'oklch(0.72 0.004 80)';
const FACE = 'oklch(0.948 0.004 80)';
const PLANE = 'oklch(0.905 0.004 80)';
const COVER = 'oklch(0.66 0.05 340)';

const pts = (poly: readonly Point[]) => poly.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(' ');

export function IsolateProbe({ config }: { config: IsolateConfig }) {
  const [t, setT] = useState(0);
  const [running, setRunning] = useState(false);
  const started = useRef<number | null>(null);
  const end = config.finish ? OUT_MS : SWING_MS;

  useEffect(() => {
    if (!running) return;
    let handle = 0;
    const frame = (now: number) => {
      if (started.current === null) started.current = now;
      const ms = Math.min(end, now - started.current);
      setT(ms);
      if (ms < end) handle = requestAnimationFrame(frame);
      else setRunning(false);
    };
    handle = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(handle);
  }, [running, end]);

  const z = config.furniture ? rowZ(0) : 0;
  const seats: PlacedSeat[] = Array.from({ length: SEATS }, (_, i) => ({ id: `iso-${i}`, x: OX + i * 17, y: 0, z, width: 12 }));
  const pulled = seats[PULLED];
  const pose = poseAt(t);
  const moving = gestureFaces(pulled, pose);

  type Drawn = PaintBounds & { svg: React.ReactNode; floor?: boolean };
  const objects: Drawn[] = [];
  if (config.floor) {
    const x0 = OX - 22;
    const x1 = seats[SEATS - 1].x + 12 + 22;
    const floor: PlacedSeat = { id: 'floor', x: x0, y: 0, z, width: x1 - x0 };
    const plane = [
      [x0, 0, z],
      [x1, 0, z],
      [x1, DEPTH + 34, z],
      [x0, DEPTH + 34, z],
    ] as const;
    objects.push({
      id: 'floor',
      floor: true,
      x0,
      x1,
      y0: 0,
      y1: DEPTH + 34,
      z0: z,
      z1: z,
      svg: <polygon key="floor" points={pts(plane.map(([x, y, zz]) => [((x - y) * Math.cos(Math.PI / 6)), (x + y) * 0.5 - zz] as Point))} fill={PLANE} stroke={HAIR} strokeWidth="1" vectorEffect="non-scaling-stroke" />,
    });
    void floor;
  }
  if (config.furniture) {
    for (const piece of unitPieces(PER_SHELF)) {
      objects.push({
        id: piece.id,
        ...piece.bounds,
        svg: (
          <g key={piece.id}>
            {piece.faces.map((face, i) => (
              <polygon key={i} points={pts(face.points)} fill={PLANE} stroke={HAIR} strokeWidth="1" vectorEffect="non-scaling-stroke" />
            ))}
          </g>
        ),
      });
    }
  }
  for (const seat of seats) {
    if (seat.id === pulled.id) continue;
    objects.push({
      ...seatBounds(seat),
      svg: (
        <g key={seat.id} data-seat={seat.id}>
          <polygon points={pts(topFace(seat))} fill={FACE} stroke={INK} strokeWidth="1" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
          <polygon points={pts(rightFace(seat))} fill={PAPER} stroke={INK} strokeWidth="1" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
          <polygon points={pts(frontFace(seat))} fill={PAPER} stroke={INK} strokeWidth="1" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
          <text transform={labelTransform(seat)} x={8} y={6 + config.labelSize * 0.35} fontFamily="Geist Mono, monospace" fontSize={config.labelSize} fill={INK}>
            {TITLES[seats.indexOf(seat)].length > 21 ? `${TITLES[seats.indexOf(seat)].slice(0, 20)}…` : TITLES[seats.indexOf(seat)]}
          </text>
        </g>
      ),
    });
  }
  objects.push({
    id: pulled.id,
    ...moving.sortBounds,
    moving: true,
    svg: (
      <g key={pulled.id} data-pulled="">
        <polygon data-face="top" points={pts(moving.top)} fill={FACE} stroke={INK} strokeWidth="1" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
        <polygon data-face="cover" points={pts(moving.cover)} fill={COVER} stroke={INK} strokeWidth="1.4" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
        <polygon data-face="front" points={pts(moving.spine)} fill={PAPER} stroke={INK} strokeWidth="1" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
      </g>
    ),
  });

  const floorFirst = objects.filter((o) => o.floor);
  const ordered = [...floorFirst, ...paintOrder(objects.filter((o) => !o.floor))];

  /* The frame: refit to every drawn point each frame (the probe's), or fixed to the rest state's extent plus the travel's room. */
  const all: Point[] = [];
  for (const seat of seats) all.push(...frontFace(seat), ...topFace(seat), ...rightFace(seat));
  const restFrame = { minX: Math.min(...all.map((p) => p[0])), maxX: Math.max(...all.map((p) => p[0])), minY: Math.min(...all.map((p) => p[1])), maxY: Math.max(...all.map((p) => p[1])) };
  if (config.frame === 'refit') all.push(...moving.top, ...moving.cover, ...moving.spine);
  const box =
    config.frame === 'refit'
      ? { minX: Math.min(...all.map((p) => p[0])), maxX: Math.max(...all.map((p) => p[0])), minY: Math.min(...all.map((p) => p[1])), maxY: Math.max(...all.map((p) => p[1])) }
      : { ...restFrame, minX: restFrame.minX - 320, maxX: restFrame.maxX + 40, minY: restFrame.minY - 40, maxY: restFrame.maxY + 220 };
  const viewBox = `${(box.minX - PAD).toFixed(1)} ${(box.minY - PAD).toFixed(1)} ${(box.maxX - box.minX + 2 * PAD).toFixed(1)} ${(box.maxY - box.minY + 2 * PAD).toFixed(1)}`;

  return (
    <div style={{ background: PAPER, minHeight: '100vh', padding: 24, fontFamily: 'Geist Mono, monospace', fontSize: 11, color: INK }}>
      <div style={{ marginBottom: 8 }}>
        <button type="button" data-testid="pull" onClick={() => { started.current = null; setT(0); setRunning(true); }} style={{ padding: '6px 14px', border: `1px solid ${INK}`, background: 'transparent' }}>
          Pull
        </button>
        <span data-testid="t" style={{ marginLeft: 12 }}>
          {Math.round(t)}ms · travel {pose.travel.toFixed(1)} · {((pose.angle * 180) / Math.PI).toFixed(1)}° · finish {pose.finish.toFixed(2)}
        </span>
      </div>
      <svg data-testid="isolate" viewBox={viewBox} width={1000} height={720} preserveAspectRatio="xMidYMid meet" style={{ display: 'block' }}>
        {ordered.map((o) => o.svg)}
      </svg>
      <p style={{ marginTop: 8, opacity: 0.7 }}>
        finish {String(config.finish)} · frame {config.frame} · furniture {String(config.furniture)} · floor {String(config.floor)} · label {config.labelSize}px
      </p>
    </div>
  );
}

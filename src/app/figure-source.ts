import { construction } from './records/[id]/construction';
import { MIN_FACE_WIDTH } from './records/[id]/ornament';
import { ownFitViewBox } from './records/[id]/own-fit';

/** A record's construction as a figure: the height at which it clears §29, and its width over its height. */
export type Clearing = { height: number; aspect: number };

const measured = new Map<string, Clearing>();

/**
 * §T.6: "the height at which its construction's narrowest face clears §29's
 * 6px". A top face is the plan of its form and is never the narrow one to
 * read; §29's minimum is a side face's width as drawn. A construction is a
 * property of the id and nothing else, so the measure is kept.
 */
export function clearing(recordId: string): Clearing {
  const known = measured.get(recordId);
  if (known !== undefined) return known;
  const scene = construction(recordId);
  /* The box the still is drawn in, whole pixels of its own units: a figure's height is this box's, so the scale is taken from it. */
  const [, , width, height] = ownFitViewBox(scene).split(' ').map(Number);
  let narrowest = Infinity;
  for (const form of scene.forms) {
    for (const face of form.faces) {
      if (face.kind === 'top') continue;
      const xs = face.points.map((point) => point[0]);
      narrowest = Math.min(narrowest, Math.max(...xs) - Math.min(...xs));
    }
  }
  const result = { height: (MIN_FACE_WIDTH / narrowest) * height, aspect: width / height };
  measured.set(recordId, result);
  return result;
}

export type FigureSource = { id: string; clearing: number; aspect: number };

/**
 * §T.6: "Every figure in the app is drawn from one record, the one in the
 * collection whose construction clears §29's 6px at the smallest height,
 * the oldest where two tie." It is asked of the whole collection and never
 * of a page of it, which is why a re-sort, a filter or a page cannot change
 * it. "An empty collection has no figure."
 */
export function figureSource(records: ReadonlyArray<{ id: string; createdAt: Date }>, measure: (id: string) => Clearing = clearing): FigureSource | null {
  let best: { id: string; createdAt: Date; clearing: Clearing } | null = null;
  for (const record of records) {
    const c = measure(record.id);
    if (
      best === null ||
      c.height < best.clearing.height ||
      (c.height === best.clearing.height && (record.createdAt < best.createdAt || (record.createdAt.getTime() === best.createdAt.getTime() && record.id < best.id)))
    ) {
      best = { ...record, clearing: c };
    }
  }
  return best === null ? null : { id: best.id, clearing: best.clearing.height, aspect: best.clearing.aspect };
}

import { construction } from './records/[id]/construction';
import { MIN_FACE_WIDTH } from './records/[id]/ornament';
import { ownFitViewBox } from './records/[id]/own-fit';
import { SIDEBAR, figureColumnMinimum } from './sidebar-layout';

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

/**
 * The narrowest window at which a record's figure draws: the sidebar's 417
 * and the content column whose figure, 0.328 of it wide, is as tall as the
 * clearing height. It counts the aspect, since "the figure is sized by
 * width, and its height follows its aspect".
 */
export function firstDrawingWidth(shape: Clearing): number {
  return SIDEBAR.taken + figureColumnMinimum({ clearing: shape.height, aspect: shape.aspect });
}

export type FigureSource = { id: string; clearing: number; aspect: number; /** The narrowest window its figure draws at. */ firstDraws: number };

/**
 * §T.6, step 115: "The source record is the one whose figure first draws at
 * the narrowest window, which folds in its construction's aspect", the
 * oldest where two tie. "That width can only fall as records are added, so
 * adding a record never removes a figure." It is asked of the whole
 * collection and never of a page of it, which is why a re-sort, a filter
 * or a page cannot change it. "An empty collection has no figure."
 *
 * Not the smallest clearing height, which this was until The Doors
 * (10 Oct): it clears lower, at 159.6 against 172.4, and draws wider, so
 * as the source it needed a 1080 window where the figure had drawn from
 * 1042.5, and the figure went from the fork's first 27 windows.
 */
export function figureSource(records: ReadonlyArray<{ id: string; createdAt: Date }>, measure: (id: string) => Clearing = clearing): FigureSource | null {
  let best: { id: string; createdAt: Date; clearing: Clearing; firstDraws: number } | null = null;
  for (const record of records) {
    const c = measure(record.id);
    const firstDraws = firstDrawingWidth(c);
    if (
      best === null ||
      firstDraws < best.firstDraws ||
      (firstDraws === best.firstDraws && (record.createdAt < best.createdAt || (record.createdAt.getTime() === best.createdAt.getTime() && record.id < best.id)))
    ) {
      best = { ...record, clearing: c, firstDraws };
    }
  }
  return best === null ? null : { id: best.id, clearing: best.clearing.height, aspect: best.clearing.aspect, firstDraws: best.firstDraws };
}

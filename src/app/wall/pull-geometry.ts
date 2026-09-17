import { SHELF_INSET_Y, SLIDE } from './geometry';
import type { PullPose } from './pull-curve';

/**
 * The pull, as D2 draws it: **the record slides forward along the depth axis
 * rather than being scaled in place.** It stays the same isometric object —
 * same faces, same projection — so nothing about it is re-derived mid
 * gesture; only its y moves, on the pull's one eased value, the same value
 * its colour reads (pull-colour).
 *
 * 5b §3's frames — the record scaling up and its shear resolving to zero into
 * a front-facing square — are superseded: under one projection there is no
 * shear to resolve, and the cover shows on the right face (§11.3) at the
 * record's own size.
 */
export function slideY(pose: PullPose): number {
  return SHELF_INSET_Y + SLIDE * pose.eased;
}

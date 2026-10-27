import type { PullState } from './WallLabelled';
import { settled } from './gesture';

export type PickAnswer = { kind: 'ignore' } | { kind: 'stay' } | { kind: 'pull'; id: string } | { kind: 'reroll'; back: string; pull: string };

/**
 * Target §P.3, step 156 unit 4: what an ask does where the answer is §W's
 * pull. `queued` is a re-roll's pull waiting for its put back to land: the
 * two run in sequence, which is what is built and not what is ruled
 * (`P.3/probe-judges`), so between them nothing moves and the re-roll is
 * still under way.
 */
export function pickAnswer(pulls: readonly PullState[], queued: string | null, named: string | null): PickAnswer {
  /* §P.6: "An ask the pool cannot answer draws nothing." */
  if (named === null) return { kind: 'ignore' };
  /* §P.3: "An ask while a record is moving is ignored", as §M.5 ignores a press that would start another motion. */
  if (queued !== null || !pulls.every(settled)) return { kind: 'ignore' };
  const held = pulls.find((state) => state.direction === 'out') ?? null;
  if (held === null) return { kind: 'pull', id: named };
  if (held.id === named) return { kind: 'stay' };
  return { kind: 'reroll', back: held.id, pull: named };
}
